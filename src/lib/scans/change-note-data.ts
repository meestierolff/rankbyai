import "server-only";
import type { Db } from "@/lib/db/clients";
import { changeNote, type ChangeNote, type NoteExtras, type NoteSample, type NoteScan } from "./change-note";
import { samePlace } from "./compare";
import { withoutSideRuns } from "./consistency";
import { DEFAULT_PROMPT_TEMPLATE } from "./prompt";

/**
 * Loads what a "why it changed" note needs, for one workspace, and builds it. Reads only: no scan is
 * ever started here. Two readers, so the app can use its own signed-in reads and the API its key's:
 *  - `ws` reads tables with a workspace_id column (every such query here filters by it);
 *  - `rows` reads rows that hang off a scan or an audit (ai_samples, audit_findings).
 * A reader throws when a read fails, so a failure never looks like "nothing changed".
 */
export type Read = <T>(what: string, run: (db: Db) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>) => Promise<T | null>;

export type NoteResult = { ok: true; note: ChangeNote } | { ok: false; status: number; error: string; message: string };

const SCAN_COLS = "id, business_id, kind, status, created_at, niche, keyword, prompt_template, grid_size, engines, center_lat, center_lng, radius_miles, tracked_query_id, label";
type ScanRow = NoteScan & { business_id: string; kind: string; tracked_query_id: string | null; label: string | null };

const finished = (s: { status: string }) => s.status === "done" || s.status === "partial";
const serviceOf = (s: NoteScan) => (s.niche ?? s.keyword ?? "").trim().toLowerCase();

/** Two scans whose answers can be compared point by point: same service, question, grid, engines and place. */
export function comparableScans(a: NoteScan, b: NoteScan): boolean {
  return serviceOf(a) === serviceOf(b)
    && (a.prompt_template ?? DEFAULT_PROMPT_TEMPLATE) === (b.prompt_template ?? DEFAULT_PROMPT_TEMPLATE)
    && a.grid_size === b.grid_size
    && a.engines.length === b.engines.length && a.engines.every((e) => b.engines.includes(e))
    && samePlace(a, b);
}

/**
 * The default pair for a business: its latest finished AI scan, and the latest earlier one it can be
 * compared with (the previous run of the same schedule first). `scans` is newest first.
 */
export function pickPair<T extends NoteScan & { tracked_query_id?: string | null; label?: string | null }>(scans: T[]): { before: T; after: T } | null {
  // A repeat or second-language run of a consistency check is never "the latest" or "the previous" scan.
  const done = withoutSideRuns(scans).filter(finished);
  const after = done[0];
  if (!after) return null;
  const earlier = done.slice(1).filter((s) => comparableScans(s, after));
  const before = (after.tracked_query_id ? earlier.find((s) => s.tracked_query_id === after.tracked_query_id) : null) ?? earlier[0];
  return before ? { before, after } : null;
}

export async function loadChangeNote(read: { ws: Read; rows: Read }, workspaceId: string, q: { a?: string; b?: string; businessId?: string }): Promise<NoteResult> {
  let pair: { before: ScanRow; after: ScanRow } | null = null;
  if (q.a && q.b) {
    const rows = (await read.ws<ScanRow[]>("Scans", (db) => db.from("scans").select(SCAN_COLS).in("id", [q.a!, q.b!]).eq("workspace_id", workspaceId))) ?? [];
    const a = rows.find((s) => s.id === q.a);
    const b = rows.find((s) => s.id === q.b);
    if (!a || !b) return { ok: false, status: 404, error: "not_found", message: "Unknown scan." };
    if (a.kind !== "ai" || b.kind !== "ai" || a.business_id !== b.business_id) return { ok: false, status: 400, error: "not_comparable", message: "Both scans must be AI scans of the same business." };
    pair = new Date(a.created_at) <= new Date(b.created_at) ? { before: a, after: b } : { before: b, after: a };
  } else if (q.businessId) {
    const rows = (await read.ws<ScanRow[]>("Scans", (db) => db.from("scans").select(SCAN_COLS).eq("workspace_id", workspaceId).eq("business_id", q.businessId!).eq("kind", "ai").in("status", ["done", "partial"]).order("created_at", { ascending: false }).limit(60))) ?? [];
    pair = pickPair(rows);
    if (!pair) {
      return {
        ok: false, status: 404, error: "no_comparable_scans",
        message: rows.length
          ? "This business has no two finished AI scans that asked the same question on the same grid. Run or schedule the same scan again (it costs money: estimate it first), or pick two scans with a and b."
          : "This business has no finished AI scan yet. Run or schedule one (it costs money: estimate it first), then again later to compare.",
      };
    }
  } else return { ok: false, status: 400, error: "invalid_request", message: "Send business_id, or two scan ids a and b." };

  const { before, after } = pair;
  const business = await read.ws<{ name: string }>("Business", (db) => db.from("businesses").select("name").eq("id", after.business_id).eq("workspace_id", workspaceId).maybeSingle());
  const samples = (await read.rows<(NoteSample & { scan_id: string })[]>("AI answers", (db) =>
    db.from("ai_samples").select("scan_id, point_idx, engine, status, prompt, mentioned, mention_position, named_businesses, sources").in("scan_id", [before.id, after.id]),
  )) ?? [];

  // Dated evidence for "possible reasons": the latest audit up to the later scan, and Google Maps scans of the same service.
  const extras: NoteExtras = {};
  const audit = (await read.ws<{ id: string; created_at: string }[]>("Audit", (db) =>
    db.from("audits").select("id, created_at").eq("workspace_id", workspaceId).eq("business_id", after.business_id).eq("status", "done").lte("created_at", after.created_at).order("created_at", { ascending: false }).limit(1),
  ))?.[0];
  if (audit) {
    const findings = (await read.rows<{ title: string; priority: string }[]>("Audit findings", (db) =>
      db.from("audit_findings").select("title, priority").eq("audit_id", audit.id).in("check_key", ["ai_crawlers", "crawler_http"]),
    )) ?? [];
    extras.audit = { created_at: audit.created_at, crawlerFindings: findings };
  }
  const maps = (await read.ws<{ created_at: string; keyword: string | null; summary: { avg_rank?: number | null; top3_points?: number; points_done?: number } | null }[]>("Maps scans", (db) =>
    db.from("scans").select("created_at, keyword, summary").eq("workspace_id", workspaceId).eq("business_id", after.business_id).eq("kind", "maps").in("status", ["done", "partial"]).lte("created_at", after.created_at).order("created_at", { ascending: false }).limit(30),
  )) ?? [];
  const sameService = maps.filter((m) => (m.keyword ?? "").trim().toLowerCase() === serviceOf(after));
  const mAfter = sameService[0];
  const mBefore = sameService.find((m) => new Date(m.created_at) <= new Date(before.created_at));
  if (mAfter && mBefore && mAfter.created_at !== mBefore.created_at && mAfter.summary?.points_done && mBefore.summary?.points_done) {
    const point = (m: typeof mAfter) => ({ created_at: m.created_at, avg_rank: m.summary?.avg_rank ?? null, top3_points: m.summary?.top3_points ?? 0, points_done: m.summary?.points_done ?? 0 });
    extras.maps = { before: point(mBefore), after: point(mAfter) };
  }

  const note = changeNote(business?.name ?? "the business", before, after, samples.filter((s) => s.scan_id === before.id), samples.filter((s) => s.scan_id === after.id), extras);
  return { ok: true, note };
}
