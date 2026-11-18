import "server-only";
import { createAudit, processAudit, type StoredAuditInputs } from "@/lib/audit/run";
import { estimateScan, houseBudgetCheck } from "@/lib/cost-guard";
import { countryFromText, DEFAULT_COUNTRY } from "@/lib/countries";
import { randomToken } from "@/lib/crypto";
import { dbAdmin } from "@/lib/db/clients";
import { resolveCredentials, type Funding } from "@/lib/keys";
import { isMockMode } from "@/lib/mock";
import { CREDIT_COST, DATAFORSEO_BUSINESS_INFO_PER_CALL, DATAFORSEO_MAPS_PER_POINT, ENGINES, type Engine } from "@/lib/pricing-constants";
import { mapsLive, type MapsItem } from "@/lib/providers/dataforseo";
import { mockMapsItems } from "@/lib/providers/mock-data";
import { createScan, processScan } from "@/lib/scans/engine";
import { namesMatch } from "@/lib/scans/match";
import type { AiSummary, MapsSummary } from "@/lib/scans/summary";
import type { CsvRow } from "./csv";
import { pitchOpener } from "./opener";

/**
 * Prospect mode (brief 7.7): find businesses, then build a report for each one:
 * Maps 5×5 (standard queue) + AI 3×3 + a quick audit + a factual opener. 2 credits each, or own keys.
 *
 * A batch is worked on over several invocations (the Maps queue answers after minutes). One worker
 * at a time holds it; every step is safe to repeat.
 */
export const BATCH_MAX = 200;
const MAPS_GRID = 5;
const AI_GRID = 3;
const RADIUS_MILES = 2;
type BatchFunding = Extract<Funding, "byok" | "credits">;

/** What the user selected: a Google Maps listing. All fields come from the discovery or CSV lookup. */
export interface Candidate {
  name: string;
  cid: string | null;
  place_id: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  website: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  rating: number | null;
  reviews: number | null;
  /** Rank in the discovery search (search mode only). */
  rank: number | null;
}

export interface BatchRow extends Candidate {
  idx: number;
  status: "queued" | "scanning" | "auditing" | "done" | "failed";
  error?: string;
  business_id?: string;
  maps_scan_id?: string;
  ai_scan_id?: string;
  audit_id?: string;
  report_slug?: string;
  /** Filled when the report is ready (also used by the CSV export). */
  maps_top3_share?: number | null;
  ai_mention_rate?: number | null;
  top_competitor?: string | null;
  opener?: string | null;
}

export const toCandidate = (i: MapsItem): Candidate => ({
  name: i.name, cid: i.cid, place_id: i.placeId, address: i.address, city: i.city, region: i.region, country: i.country,
  website: i.url ?? (i.domain ? `https://${i.domain}` : null), phone: i.phone, lat: i.lat, lng: i.lng, category: i.category, rating: i.rating, reviews: i.reviews, rank: i.rank,
});

// ───────────────────────── discovery ─────────────────────────

/** Search mode: the first 100 Google Maps results for "{niche} in {city}". One vendor call. */
export async function discover(input: { workspaceId: string; funding: BatchFunding; niche: string; city: string; country: string }): Promise<{ candidates: Candidate[]; costUsd: number }> {
  if (isMockMode()) {
    const items = Array.from({ length: 2 }, (_, k) => mockMapsItems(30.2672 + k * 0.01, -97.7431, { businessName: `${input.niche} sample ${k}`, distance: 2 })).flat();
    const seen = new Set<string>();
    const unique = items.filter((i) => !seen.has(i.name) && seen.add(i.name)).map((i, k) => ({ ...i, rank: k + 1, cid: `mock-prospect-${k}`, city: input.city, url: `https://${i.domain}`, phone: `+1 512 555 ${String(1000 + k)}` }));
    return { candidates: unique.map(toCandidate), costUsd: 0 };
  }
  const creds = await resolveCredentials(input.workspaceId, input.funding);
  if (!creds.dataforseo) throw new Error("missing_key");
  const r = await mapsLive(creds.dataforseo, { keyword: `${input.niche} in ${input.city}`, country: input.country, depth: 100 });
  return { candidates: r.items.filter((i) => i.lat != null && i.lng != null).map(toCandidate), costUsd: r.costUsd };
}

/**
 * CSV mode: look each row up on Google Maps. Rows that cannot be matched are returned as unresolved, never guessed.
 * A row's own country column (code or English name) wins; rows without one use `country` (default US).
 */
export async function resolveRows(input: { workspaceId: string; funding: BatchFunding; rows: CsvRow[]; country?: string }): Promise<{ resolved: Candidate[]; unresolved: { name: string; city: string; reason: string }[]; costUsd: number }> {
  const creds = isMockMode() ? null : await resolveCredentials(input.workspaceId, input.funding);
  if (!isMockMode() && !creds?.dataforseo) throw new Error("missing_key");
  const resolved: Candidate[] = [];
  const unresolved: { name: string; city: string; reason: string }[] = [];
  let costUsd = 0;
  let next = 0;
  const worker = async () => {
    while (next < input.rows.length) {
      const row = input.rows[next++];
      const country = row.country.trim() ? countryFromText(row.country) : (countryFromText(input.country) ?? DEFAULT_COUNTRY);
      if (!country) {
        // Searching the wrong country would cost a lookup and match nothing useful.
        unresolved.push({ name: row.name, city: row.city, reason: `“${row.country.trim().slice(0, 60)}” is not a country we can search. Use a two-letter code such as DE, or the English name.` });
        continue;
      }
      try {
        let items: MapsItem[];
        if (isMockMode()) {
          // Deterministic simulation: names containing "closed" are not on the map.
          items = /closed/i.test(row.name) ? [] : mockMapsItems(30.2672, -97.7431, { businessName: row.name, distance: 0 }).map((i) => (i.name === row.name ? { ...i, cid: `mock-csv-${row.name}`, city: row.city } : i));
        } else {
          const r = await mapsLive(creds!.dataforseo!, { keyword: `${row.name} ${row.city}`, country, depth: 20 });
          items = r.items;
          costUsd += r.costUsd;
        }
        const hit = (row.place_id ? items.find((i) => i.placeId === row.place_id) : null) ?? items.find((i) => namesMatch(i.name, row.name));
        if (hit && hit.lat != null && hit.lng != null) resolved.push({ ...toCandidate(hit), country: hit.country ?? country, website: hit.url ?? (row.website || null) ?? (hit.domain ? `https://${hit.domain}` : null), phone: hit.phone ?? (row.phone || null), rank: null });
        else unresolved.push({ name: row.name, city: row.city, reason: "No Google Maps listing with this name was found in this city." });
      } catch {
        unresolved.push({ name: row.name, city: row.city, reason: "The lookup failed. Try this row again." });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, input.rows.length) }, worker));
  return { resolved, unresolved, costUsd };
}

// ───────────────────────── create ─────────────────────────

export interface BatchEstimate {
  reports: number;
  perReportUsd: number;
  totalUsd: number;
  credits: number;
  lines: { label: string; usd: number }[];
}

export async function estimateBatch(count: number, engines: Engine[]): Promise<BatchEstimate> {
  const ai = engines.length ? (await estimateScan({ kind: "ai", grid: AI_GRID, engines })).totalUsd : 0;
  const maps = MAPS_GRID * MAPS_GRID * DATAFORSEO_MAPS_PER_POINT.standard;
  const audit = 4 * DATAFORSEO_BUSINESS_INFO_PER_CALL;
  const per = ai + maps + audit;
  return {
    reports: count,
    perReportUsd: per,
    totalUsd: per * count,
    credits: count * CREDIT_COST.prospect_report,
    lines: [
      { label: `Google Maps grid ${MAPS_GRID}×${MAPS_GRID}, standard queue`, usd: maps * count },
      { label: `AI grid ${AI_GRID}×${AI_GRID} on ${engines.length} ${engines.length === 1 ? "engine" : "engines"}`, usd: ai * count },
      { label: "Quick audit: Google profile details of the business and its top 3 competitors", usd: audit * count },
    ],
  };
}

export interface CreateBatchInput {
  workspaceId: string;
  plan: "locked" | "lifetime";
  mode: "search" | "csv";
  niche: string;
  city: string | null;
  country: string;
  candidates: Candidate[];
  funding: BatchFunding;
  confirm: boolean;
}

export type CreateBatchResult =
  | { ok: true; batchId: string; estimate: BatchEstimate }
  | { ok: false; status: number; error: string; message: string; estimate?: BatchEstimate };

const creditRef = (batchId: string) => `prospect:${batchId}`;

export async function createBatch(input: CreateBatchInput): Promise<CreateBatchResult> {
  const admin = dbAdmin();
  const niche = input.niche.trim();
  if (niche.length < 2 || niche.length > 80) return { ok: false, status: 400, error: "invalid_niche", message: "Enter the service these businesses offer (2–80 characters), for example “dentist”." };
  const candidates = input.candidates.filter((c) => c.name && c.lat != null && c.lng != null);
  if (candidates.length === 0) return { ok: false, status: 400, error: "nothing_selected", message: "Select at least one business." };
  if (candidates.length > BATCH_MAX) return { ok: false, status: 400, error: "too_many", message: `A batch holds up to ${BATCH_MAX} businesses.` };

  const creds = await resolveCredentials(input.workspaceId, input.funding);
  const engines = ENGINES.filter((e) => !!creds[e]);
  const estimate = await estimateBatch(candidates.length, [...engines]);
  if (!input.confirm) return { ok: false, status: 409, error: "confirmation_required", message: "Review the estimate, then confirm to run.", estimate };

  if (input.plan !== "lifetime") return { ok: false, status: 403, error: "lifetime_required", message: "Prospect reports need lifetime access.", estimate };
  if (!creds.dataforseo) {
    return { ok: false, status: input.funding === "byok" ? 400 : 503, error: "missing_key", estimate,
      message: input.funding === "byok" ? "Prospect reports need your DataForSEO login (Settings → API keys), or use included scans." : "Included scans are not available right now." };
  }
  if (input.funding === "credits") {
    const budget = await houseBudgetCheck("credits", estimate.totalUsd);
    if (!budget.ok) return { ok: false, status: 429, error: "daily_cap", message: budget.message ?? "Daily capacity reached.", estimate };
  }
  const { count: running } = await admin.from("prospect_batches").select("id", { count: "exact", head: true }).eq("workspace_id", input.workspaceId).in("status", ["queued", "running"]);
  if ((running ?? 0) >= 2) return { ok: false, status: 429, error: "too_many_running", message: "Two batches are already running. Wait for one to finish.", estimate };

  const rows: BatchRow[] = candidates.map((c, idx) => ({ ...c, idx, status: "queued" }));
  const credits = input.funding === "credits" ? estimate.credits : 0;
  const { data: batch, error } = await admin
    .from("prospect_batches")
    .insert({ workspace_id: input.workspaceId, mode: input.mode, niche, city: input.city, country: input.country, funding: input.funding, total: rows.length, credits_reserved: credits, status: "queued", rows })
    .select("id").single<{ id: string }>();
  if (error || !batch) return { ok: false, status: 500, error: "server_error", message: "The batch could not be created. Nothing was charged.", estimate };

  if (credits > 0) {
    const { data: paid, error: creditError } = await admin.rpc("use_credits", { p_workspace_id: input.workspaceId, p_n: credits, p_reason: "prospect_batch", p_ref: creditRef(batch.id) });
    if (creditError || paid !== true) {
      await admin.from("prospect_batches").delete().eq("id", batch.id);
      return { ok: false, status: 402, error: "insufficient_credits", estimate, message: `This batch needs ${credits} scan credits (${CREDIT_COST.prospect_report} per report). Buy a pack on the Billing page, select fewer businesses, or run it on your own keys.` };
    }
  }
  return { ok: true, batchId: batch.id, estimate };
}

// ───────────────────────── process ─────────────────────────

interface BatchRecord {
  id: string;
  workspace_id: string;
  niche: string;
  city: string | null;
  country: string | null;
  funding: BatchFunding;
  total: number;
  credits_reserved: number;
  status: string;
  rows: BatchRow[];
}

const terminal = (r: BatchRow) => r.status === "done" || r.status === "failed";
const scanOver = (status: string | undefined) => status === "done" || status === "partial" || status === "failed";

/** Continue a batch. Safe to call from several places at once: only the caller that claims it works on it. */
export async function processBatch(batchId: string, budgetMs = 200_000): Promise<void> {
  const admin = dbAdmin();
  const { data: claimed, error } = await admin.rpc("claim_prospect_batch", { p_batch_id: batchId, p_lease_seconds: Math.ceil(budgetMs / 1000) + 60 });
  if (error) throw new Error(`claim_prospect_batch failed: ${error.message}`);
  const batch = ((claimed ?? []) as BatchRecord[])[0];
  if (!batch) return;
  const deadline = Date.now() + budgetMs;
  const rows = batch.rows;
  const save = () => admin.from("prospect_batches").update({ rows, done: rows.filter((r) => r.status === "done").length, failed: rows.filter((r) => r.status === "failed").length }).eq("id", batch.id);

  try {
    const { data: ws } = await admin.from("workspaces").select("plan").eq("id", batch.workspace_id).maybeSingle();
    const plan = (ws?.plan as "locked" | "lifetime") ?? "locked";
    const creds = await resolveCredentials(batch.workspace_id, batch.funding);
    const engines = ENGINES.filter((e) => !!creds[e]);

    let next = 0;
    const open = rows.filter((r) => !terminal(r));
    const worker = async () => {
      while (next < open.length && Date.now() < deadline) {
        const row = open[next++];
        try {
          await advance(row, batch, plan, [...engines], deadline);
        } catch (e) {
          row.status = "failed";
          row.error = "This report did not complete.";
          console.error("[prospects] row failed:", e instanceof Error ? e.name : "unknown");
        }
        await save();
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, open.length) }, worker));
  } finally {
    const allDone = rows.every(terminal);
    const failed = rows.filter((r) => r.status === "failed").length;
    if (allDone) {
      // Give back the credits of reports that failed (once).
      if (batch.funding === "credits" && failed > 0) await refundFailed(batch, failed);
      await admin.from("prospect_batches").update({
        rows, done: rows.length - failed, failed, status: failed === rows.length ? "failed" : failed > 0 ? "partial" : "done", lease_until: null, finished_at: new Date().toISOString(),
      }).eq("id", batch.id);
    } else {
      await admin.from("prospect_batches").update({ rows, done: rows.filter((r) => r.status === "done").length, failed, lease_until: null }).eq("id", batch.id);
    }
  }
}

async function refundFailed(batch: BatchRecord, failed: number) {
  const admin = dbAdmin();
  const ref = `${creditRef(batch.id)}:refund`;
  const { count } = await admin.from("credit_ledger").select("id", { count: "exact", head: true }).eq("workspace_id", batch.workspace_id).eq("ref", ref);
  if ((count ?? 0) > 0) return;
  await admin.from("credit_ledger").insert({ workspace_id: batch.workspace_id, delta: failed * CREDIT_COST.prospect_report, reason: "prospect_refund", ref });
}

/** Move one row forward as far as it can go right now. */
async function advance(row: BatchRow, batch: BatchRecord, plan: "locked" | "lifetime", engines: Engine[], deadline: number) {
  const admin = dbAdmin();

  if (!row.business_id) {
    const { data, error } = await admin.from("businesses").insert({
      workspace_id: batch.workspace_id, name: row.name, cid: row.cid, place_id: row.place_id, address: row.address, city: row.city ?? batch.city, region: row.region,
      country: row.country ?? batch.country ?? "US", lat: row.lat, lng: row.lng, website: row.website, phone: row.phone, primary_category: row.category, rating: row.rating, reviews_count: row.reviews, source: "prospect",
    }).select("id").single<{ id: string }>();
    if (error || !data) throw new Error("business insert failed");
    row.business_id = data.id;
  }

  const common = { workspaceId: batch.workspace_id, plan, businessId: row.business_id, keyword: batch.niche, radiusMiles: RADIUS_MILES, funding: batch.funding, noCharge: true, confirm: true };
  if (!row.maps_scan_id) {
    const r = await createScan({ ...common, spec: { kind: "maps", grid: MAPS_GRID, mode: "standard" } });
    if (!r.ok) throw new Error(`maps scan: ${r.error}`);
    row.maps_scan_id = r.scanId;
  }
  if (!row.ai_scan_id && engines.length) {
    const r = await createScan({ ...common, spec: { kind: "ai", grid: AI_GRID, engines } });
    if (r.ok) row.ai_scan_id = r.scanId; // without AI keys the report still has Maps and the audit
  }
  row.status = "scanning";

  const budget = Math.max(5_000, Math.min(120_000, deadline - Date.now()));
  await Promise.all([processScan(row.maps_scan_id, budget), row.ai_scan_id ? processScan(row.ai_scan_id, budget) : null]);

  const ids = [row.maps_scan_id, row.ai_scan_id].filter((x): x is string => !!x);
  const { data: scanRows } = await admin.from("scans").select("id, kind, status, summary").in("id", ids);
  const scans = (scanRows ?? []) as { id: string; kind: "ai" | "maps"; status: string; summary: Record<string, unknown> }[];
  if (!scans.length || !scans.every((s) => scanOver(s.status))) return; // the Maps queue is still working: continue on the next pass
  const maps = scans.find((s) => s.kind === "maps");
  const ai = scans.find((s) => s.kind === "ai");
  if (scans.every((s) => s.status === "failed")) {
    row.status = "failed";
    row.error = "Neither the Maps grid nor the AI grid returned results.";
    return;
  }

  // Quick audit: reuses the two scans above, reads the Google profiles and the homepage.
  row.status = "auditing";
  if (!row.audit_id) {
    const a = await createAudit({ workspaceId: batch.workspace_id, plan, businessId: row.business_id, service: batch.niche, months: 3, funding: batch.funding, confirm: true, quick: true });
    if (a.ok) row.audit_id = a.auditId;
  }
  let audit: { status: string; inputs: StoredAuditInputs } | null = null;
  if (row.audit_id) {
    await processAudit(row.audit_id);
    const { data } = await admin.from("audits").select("status, inputs").eq("id", row.audit_id).maybeSingle();
    audit = data as { status: string; inputs: StoredAuditInputs } | null;
  }

  const mapsSum = maps && maps.status !== "failed" ? (maps.summary as unknown as MapsSummary) : null;
  const aiSum = ai && ai.status !== "failed" ? (ai.summary as unknown as AiSummary) : null;
  const reviewCheck = audit?.status === "done" ? audit.inputs.checks.find((c) => c.key === "review_gap") : null;
  const rt = reviewCheck?.data as { you?: number; top3Median?: number } | undefined;
  const topCompetitor = aiSum?.top_competitors?.[0]?.name ?? null;
  const opener = pitchOpener({
    business: row.name,
    city: row.city ?? batch.city,
    ai: aiSum ? { points: aiSum.points ?? AI_GRID * AI_GRID, pointsMentioned: aiSum.points_mentioned ?? 0, topCompetitor } : null,
    maps: mapsSum ? { points: mapsSum.points_done ?? 0, top3Points: mapsSum.top3_points ?? 0, avgRank: mapsSum.avg_rank ?? null } : null,
    reviews: rt?.you != null && rt.top3Median != null ? { you: rt.you, median: rt.top3Median } : null,
  });

  if (!row.report_slug) {
    const slug = randomToken(12);
    const { error } = await admin.from("reports").insert({
      workspace_id: batch.workspace_id, business_id: row.business_id, batch_id: batch.id, kind: "prospect", scan_ids: ids,
      audit_id: audit?.status === "done" ? row.audit_id : null, share_slug: slug, opener, watermark: false, status: "ready",
    });
    if (error) throw new Error("report insert failed");
    row.report_slug = slug;
  }
  row.maps_top3_share = mapsSum && mapsSum.points_done ? Math.round(((mapsSum.top3_points ?? 0) / mapsSum.points_done) * 100) : null;
  row.ai_mention_rate = aiSum && aiSum.points ? Math.round(((aiSum.points_mentioned ?? 0) / aiSum.points) * 100) : null;
  row.top_competitor = topCompetitor;
  row.opener = opener;
  row.status = "done";
  delete row.error;
}

/** Batches with open rows and no live worker. Called by cron. */
export async function findOpenBatches(limit = 3): Promise<string[]> {
  const now = new Date().toISOString();
  const { data } = await dbAdmin().from("prospect_batches").select("id").in("status", ["queued", "running"]).or(`lease_until.is.null,lease_until.lt.${now}`).order("created_at").limit(limit);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

// ───────────────────────── export ─────────────────────────

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // neutralise spreadsheet formulas
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Brief 7.7: business, website, phone, maps score, AI mention rate, top competitor, opener, report URL. */
export function batchCsv(rows: BatchRow[], siteUrl: string): string {
  const header = "business,website,phone,maps_top3_share_pct,ai_mention_rate_pct,top_competitor,opener,report_url,status";
  const lines = rows.map((r) => [r.name, r.website, r.phone, r.maps_top3_share, r.ai_mention_rate, r.top_competitor, r.opener, r.report_slug ? `${siteUrl}/r/${r.report_slug}` : "", r.status].map(csvCell).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}
