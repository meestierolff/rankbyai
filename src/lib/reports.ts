import "server-only";
import {
  assembleAi, assembleMaps, buildAiPoints, buildMapsPoints, buildQuote, nearestPoint, safeHttpUrl, type QuoteRow, type RawPoint, type RawSample,
} from "@/components/report/model";
import type { ReportView } from "@/components/report/types";
import type { Engine } from "@/lib/pricing-constants";
import type { AiSummary, MapsSummary } from "@/lib/scans/summary";
import { dbAdmin } from "@/lib/db/clients";
import { businessLanguage, languageName } from "@/lib/countries";
import { CENTRED_MILES, milesBetween } from "@/lib/scans/grid";
import { signedUrl } from "@/lib/storage";

/**
 * Public report view for /r/{slug} (brief 7.6). Read with the service role on the server and reduced
 * to exactly what the page shows: no workspace ids, no owner identity, no keys, no spend.
 * The view model and its pure builders live in components/report (types.ts, model.ts), so the page,
 * the PDF, the link preview and the tests all count the same way.
 */
export type { ReportView } from "@/components/report/types";
export { ANSWER_MAX_CHARS, safeHttpUrl } from "@/components/report/model";

interface ScanLite {
  id: string;
  kind: "ai" | "maps";
  grid_size: number;
  keyword: string | null;
  niche: string | null;
  engines: Engine[];
  status: string;
  summary: Record<string, unknown>;
  radius_miles: number | string | null;
  center_lat: number | null;
  center_lng: number | null;
  created_at: string;
}

const finite = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const centerOf = (s: ScanLite) => (finite(s.center_lat) != null && finite(s.center_lng) != null ? { lat: Number(s.center_lat), lng: Number(s.center_lng) } : null);

export async function getReportView(slug: string): Promise<ReportView | null> {
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(slug)) return null;
  const { data: report } = await dbAdmin().from("reports").select("*").eq("share_slug", slug).eq("revoked", false).maybeSingle();
  return report ? buildReportView(report) : null;
}

/**
 * A public free check's result, by its report id. These reports are stored as revoked (no share link
 * opens them), so this is the only way to read one, and only lib/free-check-public calls it, after it
 * has checked the visitor's cookie against the check.
 */
export async function getFreeCheckReportView(reportId: string): Promise<ReportView | null> {
  const { data: report } = await dbAdmin().from("reports").select("*").eq("id", reportId).eq("kind", "free_check").maybeSingle();
  return report ? buildReportView(report) : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the reports row as PostgREST returns it
async function buildReportView(report: any): Promise<ReportView | null> {
  if (!report.business_id) return null;
  const admin = dbAdmin();

  const [{ data: business }, { data: ws }] = await Promise.all([
    admin.from("businesses").select("id, name, city, region, primary_category, lat, lng, website, language, country").eq("id", report.business_id).maybeSingle(),
    report.workspace_id
      ? admin.from("workspaces").select("brand_name, brand_logo_path, brand_color_hex, brand_website, hide_rankbyai_branding, report_default_view, plan").eq("id", report.workspace_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!business) return null;
  const businessAt = finite(business.lat) != null && finite(business.lng) != null ? { lat: Number(business.lat), lng: Number(business.lng) } : null;

  // A live share link always shows the latest scans; prospect and free-check reports show their own.
  let scans: ScanLite[] = [];
  const cols = "id, kind, grid_size, keyword, niche, engines, status, summary, radius_miles, center_lat, center_lng, created_at";
  if (report.kind === "share") {
    const { data } = await admin.from("scans").select(cols).eq("business_id", business.id).in("status", ["done", "partial"]).order("created_at", { ascending: false }).limit(20);
    scans = (data ?? []) as ScanLite[];
  } else if ((report.scan_ids ?? []).length) {
    const { data } = await admin.from("scans").select(cols).in("id", report.scan_ids).in("status", ["done", "partial"]).order("created_at", { ascending: false });
    scans = (data ?? []) as ScanLite[];
  }
  const aiScan = scans.find((s) => s.kind === "ai") ?? null;
  const mapsScan = scans.find((s) => s.kind === "maps") ?? null;

  // A grid counts as "at the business" only when its centre is on the business's own map point.
  const centredOn = (s: ScanLite) => {
    const c = centerOf(s);
    return !!businessAt && !!c && milesBetween(c, businessAt) <= CENTRED_MILES;
  };
  let ai: ReportView["ai"] = null;
  if (aiScan) {
    const [{ data: pts }, { data: smp }] = await Promise.all([
      admin.from("scan_points").select("idx, row, col, lat, lng, label, status").eq("scan_id", aiScan.id).order("idx"),
      admin.from("ai_samples").select("point_idx, engine, status, mentioned, mention_position, named_businesses").eq("scan_id", aiScan.id),
    ]);
    const samples = (smp ?? []) as RawSample[];
    const engines = aiScan.engines ?? [];
    const points = buildAiPoints((pts ?? []) as RawPoint[], samples, engines);
    const center = centerOf(aiScan);
    // The proof block: verbatim answers at the checked point nearest the business. Only that point's text is read.
    const near = nearestPoint(points, businessAt ?? center, aiScan.grid_size);
    let quoteRows: QuoteRow[] = [];
    if (near) {
      const { data } = await admin.from("ai_samples").select("point_idx, engine, status, prompt, answer_text, mentioned, mention_position, named_businesses, sources").eq("scan_id", aiScan.id).eq("point_idx", near.idx);
      quoteRows = (data ?? []) as QuoteRow[];
    }
    ai = assembleAi(
      { n: aiScan.grid_size, engines, service: aiScan.niche ?? aiScan.keyword, radiusMiles: finite(aiScan.radius_miles), center, date: aiScan.created_at, summary: aiScan.summary as unknown as AiSummary },
      points, samples, business.name, near ? buildQuote(near, quoteRows, engines, aiScan.grid_size) : null,
    );
    const centred = centredOn(aiScan);
    ai = { ...ai, centredOnBusiness: centred, quote: ai.quote && !centred ? { ...ai.quote, atBusiness: false } : ai.quote };
  }

  let maps: ReportView["maps"] = null;
  if (mapsScan) {
    const { data: pts } = await admin.from("scan_points").select("idx, row, col, lat, lng, rank, status").eq("scan_id", mapsScan.id).order("idx");
    maps = assembleMaps(
      { n: mapsScan.grid_size, keyword: mapsScan.keyword, radiusMiles: finite(mapsScan.radius_miles), center: centerOf(mapsScan), date: mapsScan.created_at, summary: mapsScan.summary as unknown as MapsSummary },
      buildMapsPoints((pts ?? []) as RawPoint[]),
    );
    maps = { ...maps, centredOnBusiness: centredOn(mapsScan) };
  } else if (report.kind === "free_check" && report.data?.maps?.checked) {
    const m = report.data.maps as { keyword: string; rank: number | null; top: { rank: number; name: string }[] };
    maps = {
      date: report.created_at, keyword: m.keyword, n: 1, radiusMiles: null, center: businessAt, cells: [], points: [], avgRank: null,
      top3Points: m.rank != null && m.rank <= 3 ? 1 : 0, pointsDone: 1, pointsFailed: 0, pointsSkipped: 0, competitors: [],
      single: { rank: m.rank, top: m.top ?? [] },
    };
  }

  let audit: ReportView["audit"] = null;
  const auditQuery = admin.from("audits").select("id, score, created_at").eq("status", "done").order("created_at", { ascending: false }).limit(1);
  const { data: auditRow } = report.audit_id ? await auditQuery.eq("id", report.audit_id) : report.kind === "share" ? await auditQuery.eq("business_id", business.id) : { data: null };
  if (auditRow?.[0] && auditRow[0].score != null) {
    // A prospect report carries the quick audit: P0 and P1 findings only (brief 7.7).
    const findingQuery = admin.from("audit_findings").select("priority, title, fix").eq("audit_id", auditRow[0].id).order("priority");
    const { data: findings } = report.kind === "prospect" ? await findingQuery.in("priority", ["P0", "P1"]).limit(6) : await findingQuery.limit(6);
    audit = { score: auditRow[0].score, date: auditRow[0].created_at, findings: (findings ?? []) as { priority: string; title: string; fix: string }[] };
  }

  const lifetime = ws?.plan === "lifetime";
  let logoUrl: string | null = null;
  // Brand fields are owner-editable, so they are validated again here, at the point of use:
  // the logo must live in the workspace's own folder and the website must be a plain http(s) link.
  if (lifetime && ws?.brand_logo_path && String(ws.brand_logo_path).startsWith(`${report.workspace_id}/`)) {
    logoUrl = await signedUrl(`brand/${ws.brand_logo_path}`);
  }
  return {
    kind: report.kind,
    watermark: report.watermark,
    business: { name: business.name, city: business.city, region: business.region, category: business.primary_category, lat: businessAt?.lat ?? null, lng: businessAt?.lng ?? null, website: safeHttpUrl(business.website), language: languageName(businessLanguage(business)) },
    // White-label applies to paid workspaces only; a free check always carries RankbyAI branding.
    brand: {
      name: lifetime ? (ws?.brand_name ?? null) : null,
      logoUrl,
      color: lifetime && /^#[0-9a-f]{6}$/i.test(String(ws?.brand_color_hex ?? "")) ? String(ws!.brand_color_hex) : null,
      website: lifetime ? safeHttpUrl(ws?.brand_website) : null,
      hideRankbyai: lifetime && report.kind !== "free_check" && !!ws?.hide_rankbyai_branding,
    },
    opener: report.opener ?? null,
    defaultView: ws?.report_default_view === "grid" ? "grid" : "map",
    ai,
    maps,
    audit,
    updatedAt: [aiScan?.created_at, mapsScan?.created_at, report.updated_at].filter(Boolean).sort().reverse()[0] as string,
  };
}
