import "server-only";
import { aiCellColors, mapsCellColors, pointName, type CellView } from "@/components/brand/grid";
import { ENGINE_LABEL, type Engine } from "@/lib/pricing-constants";
import type { AiSummary, MapsSummary } from "@/lib/scans/summary";
import { dbAdmin } from "@/lib/db/clients";
import { signedUrl } from "@/lib/storage";

/**
 * Public report view for /r/{slug} (brief 7.6). Read with the service role on the server and reduced
 * to exactly what the page shows: no workspace ids, no owner identity, no keys, no costs.
 */
export interface ReportView {
  kind: "share" | "prospect" | "free_check";
  watermark: boolean;
  business: { name: string; city: string | null; region: string | null; category: string | null };
  brand: { name: string | null; logoUrl: string | null; color: string | null; website: string | null; hideRankbyai: boolean };
  opener: string | null;
  ai: {
    date: string;
    service: string | null;
    n: number;
    cells: CellView[];
    engines: { key: Engine; label: string; available: boolean; mentioned: number; done: number }[];
    pointsMentioned: number;
    namedInstead: { name: string; mentions: number }[];
    sources: { domain: string; count: number }[];
    /** 1×1 checks: the named businesses per engine, in order. */
    single: { engine: string; available: boolean; mentioned: boolean; position: number | null; names: { name: string; you: boolean }[] }[] | null;
  } | null;
  maps: {
    date: string;
    keyword: string | null;
    n: number;
    cells: CellView[];
    avgRank: number | null;
    top3Points: number;
    pointsDone: number;
    /** Free check: one point only. */
    single: { rank: number | null; top: { rank: number; name: string }[] } | null;
  } | null;
  audit: { score: number; date: string; findings: { priority: string; title: string; fix: string }[] } | null;
  updatedAt: string;
}

/** Only absolute http(s) URLs may become links on a public page (blocks javascript:, data: and friends). */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

interface ScanLite {
  id: string;
  kind: "ai" | "maps";
  grid_size: number;
  keyword: string | null;
  niche: string | null;
  engines: Engine[];
  status: string;
  summary: Record<string, unknown>;
  created_at: string;
}

export async function getReportView(slug: string): Promise<ReportView | null> {
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(slug)) return null;
  const admin = dbAdmin();
  const { data: report } = await admin.from("reports").select("*").eq("share_slug", slug).eq("revoked", false).maybeSingle();
  if (!report || !report.business_id) return null;

  const [{ data: business }, { data: ws }] = await Promise.all([
    admin.from("businesses").select("id, name, city, region, primary_category").eq("id", report.business_id).maybeSingle(),
    report.workspace_id
      ? admin.from("workspaces").select("brand_name, brand_logo_path, brand_color_hex, brand_website, hide_rankbyai_branding, plan").eq("id", report.workspace_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!business) return null;

  // A live share link always shows the latest scans; prospect and free-check reports show their own.
  let scans: ScanLite[] = [];
  const cols = "id, kind, grid_size, keyword, niche, engines, status, summary, created_at";
  if (report.kind === "share") {
    const { data } = await admin.from("scans").select(cols).eq("business_id", business.id).in("status", ["done", "partial"]).order("created_at", { ascending: false }).limit(20);
    scans = (data ?? []) as ScanLite[];
  } else if ((report.scan_ids ?? []).length) {
    const { data } = await admin.from("scans").select(cols).in("id", report.scan_ids).in("status", ["done", "partial"]).order("created_at", { ascending: false });
    scans = (data ?? []) as ScanLite[];
  }
  const aiScan = scans.find((s) => s.kind === "ai") ?? null;
  const mapsScan = scans.find((s) => s.kind === "maps") ?? null;

  let ai: ReportView["ai"] = null;
  if (aiScan) {
    const [{ data: pts }, { data: smp }] = await Promise.all([
      admin.from("scan_points").select("idx, row, col").eq("scan_id", aiScan.id).order("idx"),
      admin.from("ai_samples").select("point_idx, engine, status, mentioned, mention_position, named_businesses").eq("scan_id", aiScan.id),
    ]);
    const samples = (smp ?? []) as { point_idx: number; engine: Engine; status: string; mentioned: boolean | null; mention_position: number | null; named_businesses: { name: string; position: number; you?: boolean }[] }[];
    const sum = aiScan.summary as unknown as AiSummary;
    const cells: CellView[] = ((pts ?? []) as { idx: number; row: number; col: number }[]).map((p) => {
      const done = samples.filter((s) => s.point_idx === p.idx && s.status === "done");
      const hits = done.filter((s) => s.mentioned);
      const best = hits.length ? Math.min(...hits.map((s) => s.mention_position ?? 5)) : null;
      return { key: String(p.idx), ...aiCellColors(best), label: done.length ? `${hits.length}/${done.length}` : "!", title: `Point ${pointName(p.row, p.col)}: named by ${hits.length} of ${done.length} AI engines` };
    });
    ai = {
      date: aiScan.created_at,
      service: aiScan.niche,
      n: aiScan.grid_size,
      cells,
      engines: aiScan.engines.map((e) => ({ key: e, label: ENGINE_LABEL[e].short, available: sum.engines?.[e]?.available ?? false, mentioned: sum.engines?.[e]?.mentioned ?? 0, done: sum.engines?.[e]?.done ?? 0 })),
      pointsMentioned: sum.points_mentioned ?? 0,
      namedInstead: (sum.top_competitors ?? []).slice(0, 6),
      sources: (sum.top_sources ?? []).slice(0, 6).map((s) => ({ domain: s.domain, count: s.count })),
      single: aiScan.grid_size === 1
        ? aiScan.engines.map((e) => {
            const s = samples.find((x) => x.engine === e);
            return { engine: ENGINE_LABEL[e].short, available: s?.status === "done", mentioned: !!s?.mentioned, position: s?.mention_position ?? null, names: (s?.named_businesses ?? []).slice(0, 5).map((n) => ({ name: n.name, you: !!n.you })) };
          })
        : null,
    };
  }

  let maps: ReportView["maps"] = null;
  if (mapsScan) {
    const { data: pts } = await admin.from("scan_points").select("idx, row, col, rank, status").eq("scan_id", mapsScan.id).order("idx");
    const sum = mapsScan.summary as unknown as MapsSummary;
    maps = {
      date: mapsScan.created_at,
      keyword: mapsScan.keyword,
      n: mapsScan.grid_size,
      cells: ((pts ?? []) as { idx: number; row: number; col: number; rank: number | null; status: string }[]).map((p) =>
        p.status === "done"
          ? { key: String(p.idx), ...mapsCellColors(p.rank), title: `Point ${pointName(p.row, p.col)}: ${p.rank ? `rank #${p.rank}` : "not in the top 20"}` }
          : { key: String(p.idx), bg: "var(--rb-well)", fg: "var(--rb-faint)", label: "!", title: `Point ${pointName(p.row, p.col)}: no result` },
      ),
      avgRank: sum.avg_rank ?? null,
      top3Points: sum.top3_points ?? 0,
      pointsDone: sum.points_done ?? 0,
      single: null,
    };
  } else if (report.kind === "free_check" && report.data?.maps?.checked) {
    const m = report.data.maps as { keyword: string; rank: number | null; top: { rank: number; name: string }[] };
    maps = { date: report.created_at, keyword: m.keyword, n: 1, cells: [], avgRank: null, top3Points: 0, pointsDone: 1, single: { rank: m.rank, top: m.top ?? [] } };
  }

  let audit: ReportView["audit"] = null;
  const auditQuery = admin.from("audits").select("id, score, created_at").eq("status", "done").order("created_at", { ascending: false }).limit(1);
  const { data: auditRow } = report.audit_id ? await auditQuery.eq("id", report.audit_id) : report.kind === "share" ? await auditQuery.eq("business_id", business.id) : { data: null };
  if (auditRow?.[0]) {
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
    business: { name: business.name, city: business.city, region: business.region, category: business.primary_category },
    // White-label applies to paid workspaces only; a free check always carries RankbyAI branding.
    brand: {
      name: lifetime ? (ws?.brand_name ?? null) : null,
      logoUrl,
      color: lifetime ? (ws?.brand_color_hex ?? null) : null,
      website: lifetime ? safeHttpUrl(ws?.brand_website) : null,
      hideRankbyai: lifetime && report.kind !== "free_check" && !!ws?.hide_rankbyai_branding,
    },
    opener: report.opener ?? null,
    ai,
    maps,
    audit,
    updatedAt: [aiScan?.created_at, mapsScan?.created_at, report.updated_at].filter(Boolean).sort().reverse()[0] as string,
  };
}
