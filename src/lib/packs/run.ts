import "server-only";
import { estimateScan, validateSpec } from "@/lib/cost-guard";
import { dbAdmin } from "@/lib/db/clients";
import { resolveCredentials } from "@/lib/keys";
import { ENGINE_LABEL, type Engine } from "@/lib/pricing-constants";
import { buildInventory, packResults, topCompetitors, type InvRun, type InvSample, type PageCheck } from "@/lib/citations/inventory";
import { pool, readCitedPage, type PageRead } from "@/lib/citations/pages";
import type { BusinessIdentity } from "@/lib/scans/match";
import { normalizeDomain } from "@/lib/scans/match";
import type { Read } from "@/lib/scans/change-note-data";
import { createScan, processScan } from "@/lib/scans/engine";
import { milesBetween } from "@/lib/scans/grid";
import { fetchPlaces } from "@/lib/scans/places";
import { alternativeOf, packEstimate, type PackEstimate } from "./estimate";
import { packLabel, parsePackLabel } from "./label";
import { PACK_MAX_REPEATS, validatePackPrompts } from "./prompts";

/**
 * Prompt packs (citation workflow, step 1): starting a run, working through it, reading it.
 *
 * Money rules, all checked before the first scan exists: the estimate is one AI scan's estimate ×
 * prompts × repeats (lib/packs/estimate); the user's own keys only, every engine asked for must have
 * one; lifetime access; one pack running per workspace (a pack counts as one job, so its scans do not
 * block other scans). If a scan cannot be created after all, the scans already created, the run and
 * a new pack are removed: nothing half-started is left behind.
 */

export type PackGrid = 1 | 3 | 5;
export const PACK_GRIDS: readonly PackGrid[] = [1, 3, 5];
/** Cited pages read per run, most cited first. Reading is free (no vendor), but each page is a request to someone's site. */
export const PAGE_CHECK_MAX = 40;
/** A page read within this many days is not read again. */
export const PAGE_CHECK_FRESH_DAYS = 7;
/** Runs read for an inventory: the latest ones (first seen and disappeared on are measured over these). */
export const INVENTORY_MAX_RUNS = 12;

export const PACK_COLS = "id, workspace_id, business_id, name, service, prompts, engines, grid_size, radius_miles, repeats, created_at, updated_at";
export const RUN_COLS = "id, workspace_id, pack_id, business_id, prompts, engines, grid_size, repeats, status, est_cost_usd, actual_cost_usd, trigger, pages_checked_at, pages_lease_until, created_at, finished_at";

export interface PackRow {
  id: string; workspace_id: string; business_id: string; name: string; service: string; prompts: string[]; engines: Engine[];
  grid_size: PackGrid; radius_miles: number | string; repeats: number; created_at: string; updated_at: string;
}
export interface RunRow {
  id: string; workspace_id: string; pack_id: string; business_id: string; prompts: string[]; engines: Engine[]; grid_size: number; repeats: number;
  status: "queued" | "running" | "done" | "partial" | "failed"; est_cost_usd: number | string | null; actual_cost_usd: number | string | null;
  trigger: "manual" | "schedule"; pages_checked_at: string | null; pages_lease_until: string | null; created_at: string; finished_at: string | null;
}
interface ScanLite { id: string; status: string; label: string | null; lease_until: string | null; actual_cost_usd: number | string | null }

export interface StartPackInput {
  workspaceId: string;
  plan: "locked" | "lifetime";
  /** Required for a new pack; for a re-run it must match the pack's business when sent. */
  businessId?: string | null;
  /** Run an existing pack again with its own prompts and settings. */
  packId?: string | null;
  name?: string | null;
  service?: string | null;
  prompts?: string[] | null;
  engines?: Engine[] | null;
  grid?: number;
  radiusMiles?: number;
  repeats?: number;
  trigger?: "manual" | "schedule";
  confirm: boolean;
}

export type PackStart =
  | { ok: true; packId: string; runId: string; scanIds: string[]; estimate: PackEstimate }
  | { ok: false; status: number; error: string; message: string; estimate?: PackEstimate; missingKeys?: Engine[] };

const fail = (status: number, error: string, message: string, extra: { estimate?: PackEstimate; missingKeys?: Engine[] } = {}): PackStart => ({ ok: false, status, error, message, ...extra });
const names = (engines: Engine[]) => engines.map((e) => ENGINE_LABEL[e].short).join(", ");
const finishedStatus = (s: string) => s === "done" || s === "partial" || s === "failed";

export async function startPack(input: StartPackInput): Promise<PackStart> {
  const admin = dbAdmin();
  let existing: PackRow | null = null;
  if (input.packId) {
    const { data } = await admin.from("prompt_packs").select(PACK_COLS).eq("id", input.packId).eq("workspace_id", input.workspaceId).maybeSingle<PackRow>();
    if (!data) return fail(404, "not_found", "Unknown prompt pack.");
    if (input.businessId && input.businessId !== data.business_id) return fail(400, "invalid_request", "That prompt pack belongs to another business.");
    existing = data;
  }
  const businessId = existing?.business_id ?? input.businessId;
  if (!businessId) return fail(400, "invalid_request", "Send business_id (a new pack) or pack_id (run a saved pack again).");

  const service = (existing?.service ?? input.service ?? "").trim();
  if (service.length < 2 || service.length > 120) return fail(400, "invalid_request", "Send service: what people search for, for example \"dentist\" (2–120 characters).");
  const checked = validatePackPrompts(existing?.prompts ?? input.prompts ?? []);
  if ("error" in checked) return fail(400, "invalid_prompt", checked.error);
  const prompts = checked.prompts;
  const engines = [...new Set(existing?.engines ?? input.engines ?? [])] as Engine[];
  const grid = (existing?.grid_size ?? input.grid ?? 1) as PackGrid;
  const radiusMiles = Number(existing?.radius_miles ?? input.radiusMiles ?? 2);
  const repeats = existing?.repeats ?? input.repeats ?? 1;
  if (!PACK_GRIDS.includes(grid)) return fail(400, "invalid_spec", "A pack runs at the business's map point (1) or on a 3×3 or 5×5 grid.");
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > PACK_MAX_REPEATS) return fail(400, "invalid_request", `repeats is 1 to ${PACK_MAX_REPEATS}.`);
  const spec = { kind: "ai" as const, grid, engines };
  const specError = validateSpec(spec);
  if (specError) return fail(400, "invalid_spec", specError);

  // A dry run of the first scan checks the business, its map point and the prompt, and prices one scan.
  const common = { workspaceId: input.workspaceId, plan: input.plan, businessId, spec, keyword: service, radiusMiles, funding: "byok" as const, promptCheck: "pack" as const };
  const dry = await createScan({ ...common, promptTemplate: prompts[0], confirm: false });
  if (dry.ok) return fail(500, "server_error", "Unexpected run.");
  if (dry.error !== "confirmation_required" || !dry.estimate) return fail(dry.status, dry.error, dry.message);
  const estimate: PackEstimate = {
    ...packEstimate(dry.estimate, prompts.length, repeats),
    alternatives: await Promise.all(PACK_GRIDS.map(async (g) => alternativeOf(packEstimate(await estimateScan({ kind: "ai", grid: g, engines }), prompts.length, repeats), g))),
  };
  const creds = await resolveCredentials(input.workspaceId, "byok");
  const missingKeys = engines.filter((e) => !creds[e]);
  if (!input.confirm) return fail(409, "confirmation_required", "Review the estimate, then confirm to run.", { estimate, missingKeys });

  if (input.plan !== "lifetime") return fail(403, "lifetime_required", "Running prompt packs needs lifetime access.", { estimate });
  if (missingKeys.length) {
    return fail(400, "missing_key", `Step 1 (run the prompt pack) needs your own key for ${names(missingKeys)}. Add it in Settings → API keys, or leave ${missingKeys.length === 1 ? "that engine" : "those engines"} out. Prompt packs run on your own keys only.`, { estimate, missingKeys });
  }
  // One pack at a time. Runs whose scans all ended are closed first, so a stale status never blocks.
  const { data: open } = await admin.from("prompt_pack_runs").select("id").eq("workspace_id", input.workspaceId).in("status", ["queued", "running"]);
  let stillOpen = 0;
  for (const r of (open ?? []) as { id: string }[]) if (!finishedStatus(await refreshRunStatus(r.id))) stillOpen++;
  if (stillOpen) return fail(429, "pack_running", "A prompt pack is already running in this workspace. Wait for it to finish (get_prompt_pack shows its progress).", { estimate });

  let packId = existing?.id ?? null;
  if (!packId) {
    const name = (input.name ?? "").trim() || `${service}: buyer prompts`;
    const { data, error } = await admin.from("prompt_packs").insert({
      workspace_id: input.workspaceId, business_id: businessId, name: name.slice(0, 120), service, prompts, engines, grid_size: grid, radius_miles: radiusMiles, repeats,
    }).select("id").single<{ id: string }>();
    if (error || !data) return fail(500, "server_error", "The prompt pack could not be saved. Nothing was charged.", { estimate });
    packId = data.id;
  }
  const { data: run, error: runError } = await admin.from("prompt_pack_runs").insert({
    workspace_id: input.workspaceId, pack_id: packId, business_id: businessId, prompts, engines, grid_size: grid, repeats,
    status: "queued", est_cost_usd: estimate.totalUsd, trigger: input.trigger ?? "manual",
  }).select("id").single<{ id: string }>();
  const undoPack = async () => { if (!existing && packId) await admin.from("prompt_packs").delete().eq("id", packId); };
  if (runError || !run) {
    await undoPack();
    return fail(500, "server_error", "The run could not be created. Nothing was charged.", { estimate });
  }

  const scanIds: string[] = [];
  for (const [i, prompt] of prompts.entries()) {
    for (let r = 1; r <= repeats; r++) {
      const created = await createScan({ ...common, promptTemplate: prompt, label: packLabel(run.id, i, r), groupMember: true, confirm: true });
      if (!created.ok) {
        // All or nothing: no BYOK scan has spent anything yet (work starts after this returns).
        if (scanIds.length) await admin.from("scans").delete().in("id", scanIds);
        await admin.from("prompt_pack_runs").delete().eq("id", run.id);
        await undoPack();
        return fail(created.status, created.error, `${created.message} No scan of this pack was started.`, { estimate });
      }
      scanIds.push(created.scanId);
    }
  }
  return { ok: true, packId, runId: run.id, scanIds, estimate };
}

async function scansOf(runId: string): Promise<ScanLite[]> {
  const { data } = await dbAdmin().from("scans").select("id, status, label, lease_until, actual_cost_usd").like("label", `pack:${runId}:%`);
  return ((data ?? []) as ScanLite[]).filter((s) => parsePackLabel(s.label)?.run === runId);
}

/** The run's status and cost from its scans, written back when they changed. Returns the status. */
export async function refreshRunStatus(runId: string): Promise<string> {
  const admin = dbAdmin();
  const { data: run } = await admin.from("prompt_pack_runs").select("status, actual_cost_usd, finished_at").eq("id", runId).maybeSingle<{ status: string; actual_cost_usd: number | null; finished_at: string | null }>();
  if (!run) return "failed";
  const scans = await scansOf(runId);
  if (!scans.length) return run.status;
  const open = scans.some((s) => s.status === "queued" || s.status === "running");
  const status = open
    ? (scans.some((s) => s.status !== "queued") ? "running" : "queued")
    : scans.every((s) => s.status === "failed") ? "failed" : scans.every((s) => s.status === "done") ? "done" : "partial";
  const cost = scans.reduce((sum, s) => sum + Number(s.actual_cost_usd ?? 0), 0);
  if (status !== run.status || Math.abs(cost - Number(run.actual_cost_usd ?? 0)) > 1e-9) {
    await admin.from("prompt_pack_runs").update({
      status, actual_cost_usd: cost, finished_at: open ? null : (run.finished_at ?? new Date().toISOString()),
    }).eq("id", runId);
  }
  return status;
}

export interface ProcessOptions {
  budgetMs?: number;
  /** Reads one cited page; tests replace it, so nothing reaches third-party sites. */
  reader?: (url: string, client: BusinessIdentity, competitors: readonly string[]) => Promise<PageRead>;
}

/**
 * Works through a run within the time budget: its scans (three at a time at the map point, one at
 * a time on a grid, so Perplexity's low rate limit on new keys holds), then, once every scan ended,
 * reading the most-cited pages. Safe to call again and concurrently: scans and the page reading each
 * take a lease. Later calls (a poll, the cron) continue whatever is left.
 */
export async function processPackRun(runId: string, opts: ProcessOptions = {}): Promise<void> {
  const end = Date.now() + (opts.budgetMs ?? 270_000);
  const { data: run } = await dbAdmin().from("prompt_pack_runs").select("id, grid_size, pages_checked_at").eq("id", runId).maybeSingle<{ id: string; grid_size: number; pages_checked_at: string | null }>();
  if (!run) return;
  const open = (await scansOf(runId)).filter((s) => s.status === "queued" || s.status === "running");
  await pool(open, run.grid_size === 1 ? 3 : 1, async (s) => {
    const left = end - Date.now();
    if (left < 45_000) return;
    await processScan(s.id, Math.min(150_000, left - 15_000));
  });
  const status = await refreshRunStatus(runId);
  if (finishedStatus(status) && status !== "failed" && !run.pages_checked_at && end - Date.now() > 20_000) await checkRunPages(runId, end, opts.reader ?? readCitedPage);
}

const CHUNK = 100;
const PAGE = 1000;

/** Every answer of the given pack scans, in pages (the Data API returns at most one page per request). */
async function readSamples(read: Read, scans: { id: string; run: string; prompt: number }[]): Promise<InvSample[]> {
  const of = new Map(scans.map((s) => [s.id, s]));
  const out: InvSample[] = [];
  for (let i = 0; i < scans.length; i += CHUNK) {
    const ids = scans.slice(i, i + CHUNK).map((s) => s.id);
    for (let from = 0; ; from += PAGE) {
      const rows = (await read<(Omit<InvSample, "run_id" | "prompt_idx"> & { scan_id: string })[]>("AI answers", (db) =>
        db.from("ai_samples").select("scan_id, engine, status, mentioned, mention_position, named_businesses, sources").in("scan_id", ids).order("id").range(from, from + PAGE - 1),
      )) ?? [];
      for (const { scan_id, ...r } of rows) {
        const s = of.get(scan_id);
        if (s) out.push({ ...r, run_id: s.run, prompt_idx: s.prompt });
      }
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

const adminRead: Read = async (what, run) => {
  const { data, error } = await run(dbAdmin());
  if (error) throw new Error(`${what} could not be loaded`);
  return data;
};

interface BusinessLite { id: string; name: string; website: string | null; phone: string | null; cid: string | null; place_id: string | null; city: string | null; lat: number | null; lng: number | null; primary_category: string | null }
const BUSINESS_COLS = "id, name, website, phone, cid, place_id, city, lat, lng, primary_category";
const identityOf = (b: BusinessLite): BusinessIdentity => ({ name: b.name, website: b.website, phone: b.phone, cid: b.cid, placeId: b.place_id });

/** Reads the run's most-cited pages once its answers are in, and stores what each page names. */
async function checkRunPages(runId: string, end: number, reader: NonNullable<ProcessOptions["reader"]>): Promise<void> {
  const admin = dbAdmin();
  // One worker at a time: a conditional UPDATE claims the lease when it is empty or expired. Two
  // plain filters, not one or(): PostgREST rejects an or() filter on a column the UPDATE also sets.
  const lease = { pages_lease_until: new Date(Date.now() + 240_000).toISOString() };
  const cols = "id, workspace_id, business_id, created_at";
  type Claimed = { id: string; workspace_id: string; business_id: string; created_at: string };
  let { data: claimed } = await admin.from("prompt_pack_runs").update(lease).eq("id", runId).is("pages_checked_at", null).is("pages_lease_until", null).select(cols).maybeSingle<Claimed>();
  if (!claimed) ({ data: claimed } = await admin.from("prompt_pack_runs").update(lease).eq("id", runId).is("pages_checked_at", null).lt("pages_lease_until", new Date().toISOString()).select(cols).maybeSingle<Claimed>());
  if (!claimed) return;
  let complete = false;
  try {
    const { data: business } = await admin.from("businesses").select(BUSINESS_COLS).eq("id", claimed.business_id).maybeSingle<BusinessLite>();
    if (!business) return;
    const scans = (await scansOf(runId)).map((s) => ({ id: s.id, run: runId, prompt: parsePackLabel(s.label)!.prompt }));
    const samples = await readSamples(adminRead, scans);
    const competitors = topCompetitors(samples, business.name, 10).map((c) => c.name);
    const inv = buildInventory([{ id: runId, created_at: claimed.created_at, finished: true }], samples, new Map(), { clientName: business.name, clientDomain: normalizeDomain(business.website) });
    const candidates = inv.urls.filter((u) => !["maps_listing", "social", "official_site"].includes(u.page_type)).slice(0, PAGE_CHECK_MAX);
    const fresh = new Date(Date.now() - PAGE_CHECK_FRESH_DAYS * 86_400_000).toISOString();
    const { data: recent } = candidates.length
      ? await admin.from("cited_pages").select("url_key").eq("business_id", business.id).gte("fetched_at", fresh).in("url_key", candidates.map((u) => u.key))
      : { data: [] };
    const skip = new Set(((recent ?? []) as { url_key: string }[]).map((r) => r.url_key));
    const todo = candidates.filter((u) => !skip.has(u.key));
    let done = 0;
    await pool(todo, 4, async (u) => {
      if (Date.now() > end - 12_000) return;
      const r = await reader(u.url, identityOf(business), competitors);
      const { error } = await admin.from("cited_pages").upsert({
        workspace_id: claimed.workspace_id, business_id: business.id, url_key: u.key, url: u.url, status: r.status, http_status: r.http_status,
        title: r.title, client_named: r.client_named, competitors_named: r.competitors_named, fetched_at: new Date().toISOString(),
      }, { onConflict: "business_id,url_key" });
      // A page whose result was not stored is not done: the next pass reads it again.
      if (!error) done++;
    });
    complete = done === todo.length;
  } finally {
    await admin.from("prompt_pack_runs").update(complete ? { pages_checked_at: new Date().toISOString(), pages_lease_until: null } : { pages_lease_until: null }).eq("id", runId);
  }
}

// ───────────────────────── reading ─────────────────────────

const runOut = (r: RunRow) => ({
  id: r.id, pack_id: r.pack_id, status: r.status, trigger: r.trigger, created_at: r.created_at, finished_at: r.finished_at,
  est_cost_usd: r.est_cost_usd == null ? null : Number(r.est_cost_usd), actual_cost_usd: r.actual_cost_usd == null ? null : Number(r.actual_cost_usd),
  pages_checked: !!r.pages_checked_at, grid_size: r.grid_size, repeats: r.repeats, engines: r.engines,
});
export const packOut = (p: PackRow) => ({
  id: p.id, business_id: p.business_id, name: p.name, service: p.service, prompts: p.prompts, engines: p.engines,
  location: p.grid_size === 1 ? "pin" : "grid", grid_size: p.grid_size, radius_miles: Number(p.radius_miles), repeats: p.repeats, created_at: p.created_at,
});

export const PACK_DISCLAIMER = "AI answers vary between runs, places and time, and API answers can differ from what people see in the consumer apps. One run is an observation, not a ranking.";

export type PackResult =
  | { ok: true; report: Record<string, unknown>; continueRun: string | null }
  | { ok: false; status: number; error: string; message: string };

/** A pack, one of its runs (default: the latest) with per-prompt results and the run's most-cited pages. */
export async function loadPack(read: { ws: Read; rows: Read }, workspaceId: string, q: { packId: string; runId?: string }): Promise<PackResult> {
  const pack = await read.ws<PackRow>("Prompt pack", (db) => db.from("prompt_packs").select(PACK_COLS).eq("id", q.packId).eq("workspace_id", workspaceId).maybeSingle());
  if (!pack) return { ok: false, status: 404, error: "not_found", message: "Unknown prompt pack." };
  const runs = (await read.ws<RunRow[]>("Pack runs", (db) => db.from("prompt_pack_runs").select(RUN_COLS).eq("pack_id", pack.id).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(26))) ?? [];
  const run = q.runId ? runs.find((r) => r.id === q.runId) : runs[0];
  if (q.runId && !run) return { ok: false, status: 404, error: "not_found", message: "Unknown run of this prompt pack." };
  const business = await read.ws<BusinessLite>("Business", (db) => db.from("businesses").select(BUSINESS_COLS).eq("id", pack.business_id).eq("workspace_id", workspaceId).maybeSingle());
  const base = { pack: packOut(pack), business: business?.name ?? "the business", runs: runs.map((r) => ({ id: r.id, status: r.status, created_at: r.created_at, trigger: r.trigger })), disclaimer: PACK_DISCLAIMER };
  if (!run) return { ok: true, report: { ...base, run: null, results: null, top_sources: [] }, continueRun: null };

  const scans = ((await read.ws<ScanLite[]>("Pack scans", (db) => db.from("scans").select("id, status, label, lease_until, actual_cost_usd").eq("workspace_id", workspaceId).like("label", `pack:${run.id}:%`))) ?? [])
    .flatMap((s) => {
      const l = parsePackLabel(s.label);
      return l && l.run === run.id ? [{ ...s, prompt: l.prompt, repeat: l.repeat }] : [];
    })
    .sort((a, b) => a.prompt - b.prompt || a.repeat - b.repeat);
  const samples = await readSamples(read.rows, scans.map((s) => ({ id: s.id, run: run.id, prompt: s.prompt })));
  const clientName = business?.name ?? "";
  const checks = await pageChecks(read.ws, workspaceId, pack.business_id);
  const inv = buildInventory([{ id: run.id, created_at: run.created_at, finished: true }], samples, checks, { clientName, clientDomain: normalizeDomain(business?.website) });
  const leaseFree = (s: ScanLite) => !s.lease_until || new Date(s.lease_until).getTime() < Date.now();
  const unfinished = scans.filter((s) => s.status === "queued" || s.status === "running");
  const pagesPending = !run.pages_checked_at && (run.status === "done" || run.status === "partial") && (!run.pages_lease_until || new Date(run.pages_lease_until).getTime() < Date.now());
  return {
    ok: true,
    report: {
      ...base,
      run: { ...runOut(run), scans: scans.map((s) => ({ prompt: s.prompt, repeat: s.repeat, scan_id: s.id, status: s.status })) },
      results: packResults(run.prompts, samples, run.engines, clientName),
      top_sources: inv.urls.slice(0, 10).map((u) => ({ url: u.url, domain: u.domain, title: u.title, page_type: u.page_type, answers: u.answers, answers_naming_client: u.answers_naming_client, missing: u.missing })),
    },
    continueRun: unfinished.some(leaseFree) || (unfinished.length === 0 && pagesPending) || (run.status !== "done" && run.status !== "partial" && run.status !== "failed" && unfinished.length === 0) ? run.id : null,
  };
}

/** Packs of the workspace (or one business), newest first, each with its latest run. */
export async function listPacks(read: Read, workspaceId: string, q: { businessId?: string; limit: number; offset: number }) {
  const packs = (await read<PackRow[]>("Prompt packs", (db) => {
    let query = db.from("prompt_packs").select(PACK_COLS).eq("workspace_id", workspaceId);
    if (q.businessId) query = query.eq("business_id", q.businessId);
    return query.order("created_at", { ascending: false }).range(q.offset, q.offset + q.limit - 1);
  })) ?? [];
  const runs = packs.length
    ? ((await read<RunRow[]>("Pack runs", (db) => db.from("prompt_pack_runs").select(RUN_COLS).eq("workspace_id", workspaceId).in("pack_id", packs.map((p) => p.id)).order("created_at", { ascending: false }).limit(500))) ?? [])
    : [];
  return packs.map((p) => {
    const mine = runs.filter((r) => r.pack_id === p.id);
    return { ...packOut(p), runs: mine.length, latest_run: mine[0] ? runOut(mine[0]) : null };
  });
}

async function pageChecks(read: Read, workspaceId: string, businessId: string): Promise<Map<string, PageCheck>> {
  const rows = (await read<PageCheck[]>("Cited pages", (db) => db.from("cited_pages").select("url_key, status, fetched_at, title, client_named, competitors_named").eq("workspace_id", workspaceId).eq("business_id", businessId).limit(2000))) ?? [];
  return new Map(rows.map((r) => [r.url_key, r]));
}

export interface InventoryScope { businessId?: string; packId?: string; runId?: string }

export type InventoryLoad =
  | { ok: true; business: { id: string; name: string; website: string | null }; runs: InvRun[]; samples: InvSample[]; checks: Map<string, PageCheck>; inventory: ReturnType<typeof buildInventory> }
  | { ok: false; status: number; error: string; message: string };

/**
 * The cited-page inventory over pack runs: one run, every run of a pack, or every pack run of a
 * business (the latest INVENTORY_MAX_RUNS runs).
 */
export async function loadInventory(read: { ws: Read; rows: Read }, workspaceId: string, scope: InventoryScope): Promise<InventoryLoad> {
  const runs = (await read.ws<RunRow[]>("Pack runs", (db) => {
    let query = db.from("prompt_pack_runs").select(RUN_COLS).eq("workspace_id", workspaceId);
    if (scope.runId) query = query.eq("id", scope.runId);
    else if (scope.packId) query = query.eq("pack_id", scope.packId);
    else if (scope.businessId) query = query.eq("business_id", scope.businessId);
    return query.order("created_at", { ascending: false }).limit(INVENTORY_MAX_RUNS);
  })) ?? [];
  const businessId = scope.businessId ?? runs[0]?.business_id;
  if (scope.runId && !runs.length) return { ok: false, status: 404, error: "not_found", message: "Unknown prompt pack run." };
  if (scope.packId && !runs.length) {
    const pack = await read.ws<{ id: string }>("Prompt pack", (db) => db.from("prompt_packs").select("id").eq("id", scope.packId!).eq("workspace_id", workspaceId).maybeSingle());
    if (!pack) return { ok: false, status: 404, error: "not_found", message: "Unknown prompt pack." };
  }
  if (!businessId) return { ok: false, status: 404, error: "no_runs", message: "This prompt pack has no runs yet. Run it first (run_prompt_pack)." };
  const business = await read.ws<BusinessLite>("Business", (db) => db.from("businesses").select(BUSINESS_COLS).eq("id", businessId).eq("workspace_id", workspaceId).maybeSingle());
  if (!business) return { ok: false, status: 404, error: "not_found", message: "Unknown business." };
  const runIds = new Set(runs.map((r) => r.id));
  const scans = runs.length
    ? ((await read.ws<ScanLite[]>("Pack scans", (db) => db.from("scans").select("id, status, label, lease_until, actual_cost_usd").eq("workspace_id", workspaceId).eq("business_id", business.id).like("label", "pack:%").limit(5000))) ?? [])
        .flatMap((s) => {
          const l = parsePackLabel(s.label);
          return l && runIds.has(l.run) ? [{ id: s.id, run: l.run, prompt: l.prompt }] : [];
        })
    : [];
  const samples = await readSamples(read.rows, scans);
  const checks = await pageChecks(read.ws, workspaceId, business.id);
  const invRuns: InvRun[] = runs.map((r) => ({ id: r.id, created_at: r.created_at, finished: r.status === "done" || r.status === "partial" }));
  const inventory = buildInventory(invRuns, samples, checks, { clientName: business.name, clientDomain: normalizeDomain(business.website) });
  return { ok: true, business: { id: business.id, name: business.name, website: business.website }, runs: invRuns, samples, checks, inventory };
}

// ───────────────────────── suggestions ─────────────────────────

/** What get_buyer_prompts works from: the business's stored fields, its stored answers, and one cached place-name lookup. */
export async function suggestionInputs(read: { ws: Read; rows: Read }, workspaceId: string, businessId: string): Promise<{ business: BusinessLite; service: string | null; neighbourhood: string | null; competitors: string[] } | null> {
  const business = await read.ws<BusinessLite>("Business", (db) => db.from("businesses").select(BUSINESS_COLS).eq("id", businessId).eq("workspace_id", workspaceId).maybeSingle());
  if (!business) return null;
  const scans = (await read.ws<{ id: string; niche: string | null; label: string | null }[]>("AI scans", (db) =>
    db.from("scans").select("id, niche, label").eq("workspace_id", workspaceId).eq("business_id", businessId).eq("kind", "ai").in("status", ["done", "partial"]).order("created_at", { ascending: false }).limit(20),
  )) ?? [];
  // The service of the latest tracked AI scan (not a pack scan, which repeats the pack's own service).
  const service = scans.find((s) => !parsePackLabel(s.label) && s.niche)?.niche ?? scans.find((s) => s.niche)?.niche ?? null;
  const recent = scans.slice(0, 6).map((s) => ({ id: s.id, run: "", prompt: 0 }));
  const competitors = topCompetitors(await readSamples(read.rows, recent), business.name, 2).map((c) => c.name);
  let neighbourhood: string | null = null;
  if (business.lat != null && business.lng != null) {
    const at = { lat: Number(business.lat), lng: Number(business.lng) };
    const places = await fetchPlaces(at, 1, "suburb|neighbourhood|quarter", 4_000).catch(() => []);
    const nearest = places.map((p) => ({ p, d: milesBetween(at, p) })).sort((a, b) => a.d - b.d)[0];
    if (nearest && nearest.d <= 1.5) neighbourhood = nearest.p.name;
  }
  return { business, service, neighbourhood, competitors };
}
