import "server-only";
import { createHmac } from "node:crypto";
import { creditsFor, estimateScan, houseBudgetCheck, houseCapUsd, logHouseSpend, runningScanCount, validateSpec, BYOK_MAX_RUNNING_SCANS, type Estimate, type HouseFunding, type ScanSpec } from "@/lib/cost-guard";
import { withinCap } from "@/lib/cost/credits";
import { dataforseoPingbackEnv, publicEnv } from "@/lib/env";
import { resolveCredentials, type Funding } from "@/lib/keys";
import { isMockMode } from "@/lib/mock";
import { AI_SAMPLE_EST_USD, DATAFORSEO_MAPS_PER_POINT, ENGINE_LABEL, GEMINI, LLM_PARSE_BUDGET_USD, type Engine, type MapsMode } from "@/lib/pricing-constants";
import { getMapsTask, mapsLive, postMapsTasks, type MapsItem } from "@/lib/providers/dataforseo";
import { askGemini } from "@/lib/providers/gemini";
import { mockAiAnswer, mockMapsItems, type MockCtx } from "@/lib/providers/mock-data";
import { askOpenAi, openAiJson } from "@/lib/providers/openai";
import { askPerplexity } from "@/lib/providers/perplexity";
import { ProviderError, type AiAnswer, type GeoContext, type ProviderCredentials } from "@/lib/providers/types";
import { dbAdmin } from "@/lib/db/clients";
import { putObject } from "@/lib/storage";
import { buildGrid, MAX_CENTRE_MILES, milesBetween, validCoord } from "./grid";
import { findInMaps, mentionedInText, namesMatch, positionInNames, type BusinessIdentity } from "./match";
import { PARSE_INSTRUCTIONS, PARSE_SCHEMA, parseNamedBusinesses } from "./parse";
import { fetchPlaces, labelPoints } from "./places";
import { buildPrompt, defaultQuestionFor, validateTemplate } from "./prompt";
import { businessLanguage } from "@/lib/countries";
import { normalizeSkip } from "./skip";
import { summarizeAi, summarizeMaps, type AiSampleRow, type MapsPointRow } from "./summary";
import { parseRunLabel, RUN_ROLES, runLabel } from "./consistency";
import { validatePackPrompt } from "@/lib/packs/prompts";

/**
 * Scan engine (brief 7.2, 7.3, 10.2).
 *
 * createScan  — validates, estimates, charges credits (house funding) and writes the scan, its
 *               grid points and (for AI) one pending sample per active point per engine. Points the
 *               user skipped get a row with status 'skipped' and nothing else: no sample, no task.
 * processScan — does the work. Idempotent and resumable: it claims a short lease, processes whatever
 *               is still pending, and can be called again (after a timeout, from a status poll, from a
 *               DataForSEO pingback or from cron) until nothing is pending. Then it finalises.
 */

export interface BusinessRow extends BusinessIdentity {
  id: string;
  workspace_id: string;
  name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  website: string | null;
  phone: string | null;
  cid: string | null;
  place_id: string | null;
  primary_category: string | null;
  /** Language setting (null = the country's) and whether AI assistants are asked in it. */
  language?: string | null;
  ask_in_language?: boolean | null;
}

export interface CreateScanInput {
  workspaceId: string;
  plan: "locked" | "lifetime";
  businessId: string;
  spec: ScanSpec;
  /** Maps keyword, or the {service} for AI prompts. */
  keyword: string;
  promptTemplate?: string | null;
  radiusMiles: number;
  funding: Funding;
  trackedQueryId?: string | null;
  /**
   * Where the grid is centred. Default: the business's map point (and, for a scheduled run, the
   * schedule's own centre when it has one). For a service-area business or a pin in the wrong place.
   */
  center?: { lat: number; lng: number } | null;
  /** Part of another paid action (an audit's 1×1 check, a prospect report): house keys and caps apply, but no extra credit is taken and the running-scan limit does not apply. */
  noCharge?: boolean;
  /** Stored in scans.label, e.g. a consistency run's "consistency:<group>:<role>" (lib/scans/consistency). */
  label?: string | null;
  /**
   * A run of a consistency group. The group checks room for one running scan before it starts and
   * runs its scans one after another, so the per-scan running-scan limit does not apply to it.
   */
  groupMember?: boolean;
  /**
   * How promptTemplate is checked. "template" (default): a question asked around the business, with
   * {service} and a place (run_ai_scan). "pack": a buyer prompt from a prompt pack, asked as written
   * (lib/packs/prompts validatePackPrompt), so "Who is the best dentist near me?" is allowed.
   */
  promptCheck?: "template" | "pack";
  /**
   * "online": a question with no place in it, for a business that sells online. Asked once (1×1),
   * without location settings, Gemini grounded on Google Search. The business needs no map point.
   */
  geoMode?: "local" | "online";
  confirm: boolean;
}

export type CreateScanResult =
  | { ok: true; scanId: string; estimate: Estimate }
  | { ok: false; status: number; error: string; message: string; estimate?: Estimate };

const fail = (status: number, error: string, message: string, estimate?: Estimate): CreateScanResult => ({ ok: false, status, error, message, estimate });

const ENGINE_KEY: Record<Engine, keyof ProviderCredentials> = { openai: "openai", perplexity: "perplexity", gemini: "gemini" };

/** Upper bound for one house-funded sample: twice the published estimate (Gemini: beyond its free allowance) plus a parse call. */
const WORST_CASE_SAMPLE_USD: Record<Engine, number> = {
  openai: AI_SAMPLE_EST_USD.openai * 2 + LLM_PARSE_BUDGET_USD,
  perplexity: AI_SAMPLE_EST_USD.perplexity * 2 + LLM_PARSE_BUDGET_USD,
  gemini: AI_SAMPLE_EST_USD.geminiPaid * 2 + LLM_PARSE_BUDGET_USD,
};

export async function createScan(input: CreateScanInput): Promise<CreateScanResult> {
  const admin = dbAdmin();
  let { spec } = input;

  // A scheduled run keeps the points its schedule skips and its grid centre, unless the caller sends its own.
  let chosenCentre = input.center ?? null;
  if (input.trackedQueryId && (spec.skip === undefined || !chosenCentre)) {
    const { data: tq } = await admin.from("tracked_queries").select("skip_points, center_lat, center_lng").eq("id", input.trackedQueryId)
      .maybeSingle<{ skip_points: number[] | null; center_lat: number | null; center_lng: number | null }>();
    if (spec.skip === undefined && tq?.skip_points?.length) spec = { ...spec, skip: tq.skip_points };
    if (!chosenCentre && tq?.center_lat != null && tq?.center_lng != null) chosenCentre = { lat: tq.center_lat, lng: tq.center_lng };
  }
  if (chosenCentre && !validCoord(chosenCentre)) return fail(400, "invalid_center", "The grid centre is not a valid map point.");
  const specError = validateSpec(spec);
  if (specError) return fail(400, "invalid_spec", specError);
  const online = input.geoMode === "online";
  if (online && (spec.kind !== "ai" || spec.grid !== 1)) return fail(400, "invalid_spec", "An online question is asked once, without a place: use a 1×1 AI scan.");
  const skip = normalizeSkip(spec.skip);
  spec = { ...spec, skip };
  const keyword = input.keyword.trim();
  if (keyword.length < 2 || keyword.length > 120) return fail(400, "invalid_keyword", "Enter a service or keyword (2–120 characters).");
  if (!(input.radiusMiles > 0 && input.radiusMiles <= 50)) return fail(400, "invalid_radius", "The radius must be between 0.1 and 50 miles.");
  const customTemplate = spec.kind === "ai" ? (input.promptTemplate?.trim() || null) : null;
  if (customTemplate) {
    const tErr = input.promptCheck === "pack" ? validatePackPrompt(customTemplate) : validateTemplate(customTemplate);
    if (tErr) return fail(400, "invalid_prompt", tErr);
  }

  const { data: business } = await admin.from("businesses").select("*").eq("id", input.businessId).maybeSingle<BusinessRow>();
  if (!business || business.workspace_id !== input.workspaceId) return fail(404, "business_not_found", "That business was not found in this workspace.");
  // The question: the user's own wording, else the default for this business (its language, when it
  // is asked in it; see lib/scans/prompt). Stored with the scan, so a scan always shows what was asked.
  const template = spec.kind === "ai" ? (customTemplate ?? defaultQuestionFor({ ask_in_language: business.ask_in_language, language: businessLanguage(business) })) : null;
  const businessAt = business.lat != null && business.lng != null ? { lat: Number(business.lat), lng: Number(business.lng) } : null;
  if (!online && !chosenCentre && !businessAt) return fail(400, "business_has_no_location", "This business has no map location yet. Set it on the business page, or choose where to centre the grid.");
  if (chosenCentre && businessAt) {
    const away = milesBetween(chosenCentre, businessAt);
    if (away > MAX_CENTRE_MILES) return fail(400, "center_too_far", `The grid centre is ${Math.round(away)} miles from the business. Keep it within ${MAX_CENTRE_MILES} miles, or correct the business's location on its page.`);
  }

  const estimate = await estimateScan(spec);
  if (!input.confirm) return fail(409, "confirmation_required", "Review the estimate, then confirm to run.", estimate);

  const paidFunding = input.funding === "byok" || input.funding === "credits";
  if (paidFunding && input.plan !== "lifetime") return fail(403, "lifetime_required", "Running scans needs lifetime access.", estimate);

  const creds = await resolveCredentials(input.workspaceId, input.funding);
  if (spec.kind === "maps" && !creds.dataforseo) {
    return fail(input.funding === "byok" ? 400 : 503, "missing_key", input.funding === "byok" ? "Add your DataForSEO login in Settings → API keys, or use included scans." : "Included scans are not available right now.", estimate);
  }
  if (spec.kind === "ai") {
    const missing = spec.engines.filter((e) => !creds[ENGINE_KEY[e]]);
    if (missing.length === spec.engines.length || (input.funding === "byok" && missing.length)) {
      return fail(input.funding === "byok" ? 400 : 503, "missing_key",
        input.funding === "byok" ? `Add a key for ${missing.map((e) => ENGINE_LABEL[e].short).join(", ")} in Settings → API keys, untick it, or use included scans.` : "Included scans are not available right now.", estimate);
    }
  }

  if (input.funding === "byok" && !input.noCharge && !input.groupMember && (await runningScanCount(input.workspaceId)) >= BYOK_MAX_RUNNING_SCANS) {
    return fail(429, "too_many_running", `You already have ${BYOK_MAX_RUNNING_SCANS} scans running. Wait for one to finish.`, estimate);
  }
  const credits = input.funding === "credits" && !input.noCharge ? creditsFor(spec) : 0;
  if (input.funding !== "byok") {
    const budget = await houseBudgetCheck(input.funding as HouseFunding, estimate.highUsd);
    if (!budget.ok) return fail(429, "daily_cap", budget.message ?? "Daily capacity reached.", estimate);
  }

  // An online scan without a map point stores 0,0: no place is sent to any engine for it.
  const center = chosenCentre ?? businessAt ?? { lat: 0, lng: 0 };
  const points = buildGrid(center, spec.grid, input.radiusMiles);
  const skipped = new Set(skip);
  const mode: MapsMode = spec.kind === "maps" ? spec.mode : "standard";

  const { data: scan, error } = await admin
    .from("scans")
    .insert({
      workspace_id: input.workspaceId,
      business_id: business.id,
      tracked_query_id: input.trackedQueryId ?? null,
      kind: spec.kind,
      keyword: spec.kind === "maps" ? keyword : null,
      niche: spec.kind === "ai" ? keyword : null,
      prompt_template: template,
      engines: spec.kind === "ai" ? spec.engines : [],
      grid_size: spec.grid,
      skip_points: skip,
      radius_miles: input.radiusMiles,
      center_lat: center.lat,
      center_lng: center.lng,
      mode,
      funding: input.funding,
      status: "queued",
      credits_used: credits,
      est_cost_usd: estimate.totalUsd,
      summary: isMockMode() ? { mock: true } : {},
      label: input.label ?? null,
      geo_mode: online ? "online" : "local",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !scan) return fail(500, "server_error", "The scan could not be created. Nothing was charged.", estimate);

  if (credits > 0) {
    const { data: paid, error: creditError } = await admin.rpc("use_credits", { p_workspace_id: input.workspaceId, p_n: credits, p_scan_id: scan.id, p_reason: `${spec.kind}_scan` });
    if (creditError || paid !== true) {
      await admin.from("scans").delete().eq("id", scan.id);
      return fail(402, "insufficient_credits", `This needs ${credits} scan ${credits === 1 ? "credit" : "credits"}. Buy a pack on the Billing page, or run it on your own keys.`, estimate);
    }
  }

  let labels: (string | null)[] = points.map(() => null);
  if (spec.kind === "ai" && !online) labels = labelPoints(points, await fetchPlaces(center, input.radiusMiles));

  // Skipped points are stored (so results can show them as not checked) but get no sample and no task.
  await admin.from("scan_points").insert(points.map((p, i) => ({
    scan_id: scan.id, idx: p.idx, row: p.row, col: p.col, lat: p.lat, lng: p.lng, label: labels[i],
    status: skipped.has(p.idx) ? "skipped" : spec.kind === "ai" ? "done" : "pending",
  })));
  if (spec.kind === "ai" && template) {
    const engines = spec.engines;
    const rows = points.flatMap((p, i) =>
      skipped.has(p.idx) ? [] : engines.map((engine) => ({
        scan_id: scan.id,
        point_idx: p.idx,
        engine,
        prompt: buildPrompt(template, { neighbourhood: labels[i], city: business.city, service: keyword, lat: p.lat, lng: p.lng }),
        status: "pending",
      })),
    );
    await admin.from("ai_samples").insert(rows);
  }
  return { ok: true, scanId: scan.id, estimate };
}

// ───────────────────────── processing ─────────────────────────

interface ScanRow {
  id: string;
  workspace_id: string;
  business_id: string;
  kind: "ai" | "maps";
  keyword: string | null;
  niche: string | null;
  engines: Engine[];
  grid_size: number;
  /** idx of the points the user skipped (never sent to a vendor). */
  skip_points: number[] | null;
  radius_miles: number;
  center_lat: number;
  center_lng: number;
  mode: MapsMode;
  funding: Funding;
  status: string;
  credits_used: number;
  est_cost_usd: number | null;
  actual_cost_usd: number | null;
  summary: Record<string, unknown>;
  created_at: string;
  /** "online": asked without location settings (lib/packs online packs). */
  geo_mode?: "local" | "online";
}

const LEASE_SECONDS = 120;
/** DataForSEO accepts at most 100 tasks per task_post request (lib/providers/dataforseo postMapsTasks). */
const MAPS_TASKS_PER_POST = 100;

/** Atomic claim in the database (see db/migrations/0002_claim_scan.sql). Null when another worker holds it. */
async function claim(scanId: string): Promise<ScanRow | null> {
  const { data, error } = await dbAdmin().rpc("claim_scan", { p_scan_id: scanId, p_lease_seconds: LEASE_SECONDS });
  if (error) throw new Error(`claim_scan failed: ${error.message}`);
  return ((data ?? []) as ScanRow[])[0] ?? null;
}

const extendLease = (scanId: string) =>
  dbAdmin().from("scans").update({ lease_until: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString() }).eq("id", scanId);

/**
 * Parallel calls per engine. Perplexity's rate limit on a new key is far lower than the others'
 * (it refused 7 of 9 parallel calls on 18 Nov 2026), so it gets two at a time.
 */
const ENGINE_CONCURRENCY: Record<Engine, number> = { openai: 5, gemini: 5, perplexity: 2 };

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await worker(items[i++]);
  }));
}

/** Run (or continue) a scan. Safe to call concurrently and repeatedly. `budgetMs` keeps us inside the function timeout. */
export async function processScan(scanId: string, budgetMs = 240_000): Promise<void> {
  // A consistency check's runs go one after another: whoever resumes a later run (the cron, polling
  // a scan, the group's own worker) leaves it queued while an earlier run is still queued or running.
  if (await waitsForEarlierRun(scanId)) return;
  const scan = await claim(scanId);
  if (!scan) return;
  const admin = dbAdmin();
  const deadline = Date.now() + budgetMs;
  try {
    const { data: business } = await admin.from("businesses").select("*").eq("id", scan.business_id).maybeSingle<BusinessRow>();
    if (!business) {
      await admin.from("scans").update({ status: "failed", error: "The business was deleted.", finished_at: new Date().toISOString(), lease_until: null }).eq("id", scan.id);
      return;
    }
    const creds = await resolveCredentials(scan.workspace_id, scan.funding);
    if (scan.kind === "ai") await runAi(scan, business, creds, deadline);
    else await runMaps(scan, business, creds, deadline);
    await finalizeIfComplete(scan, business);
  } catch (err) {
    console.error("[scan] processing error:", scan.kind, err instanceof ProviderError ? `${err.provider}:${err.kind}` : "internal");
  } finally {
    await admin.from("scans").update({ lease_until: null }).eq("id", scan.id).in("status", ["queued", "running"]);
  }
}

/** True for a later run of a consistency check whose earlier runs have not finished (lib/scans/consistency). */
export async function waitsForEarlierRun(scanId: string): Promise<boolean> {
  const admin = dbAdmin();
  const { data } = await admin.from("scans").select("label, workspace_id").eq("id", scanId).maybeSingle<{ label: string | null; workspace_id: string }>();
  const run = parseRunLabel(data?.label);
  if (!data || !run || run.role === "A1") return false;
  const earlier = RUN_ROLES.slice(0, RUN_ROLES.indexOf(run.role)).map((r) => runLabel(run.group, r));
  const { data: open } = await admin.from("scans").select("id").eq("workspace_id", data.workspace_id).in("label", earlier).in("status", ["queued", "running"]).limit(1);
  return (open ?? []).length > 0;
}

const identity = (b: BusinessRow): BusinessIdentity => ({ name: b.name, website: b.website, phone: b.phone, cid: b.cid, placeId: b.place_id });

function mockCtx(scan: ScanRow, business: BusinessRow, lat: number, lng: number): MockCtx {
  const d = milesBetween({ lat: scan.center_lat, lng: scan.center_lng }, { lat, lng });
  const fail = process.env.RANKBYAI_MOCK_FAIL_ENGINE as Engine | undefined;
  return { businessName: business.name, distance: Math.min(1, d / (Number(scan.radius_miles) * Math.SQRT2 || 1)), failEngine: fail ?? null };
}

/** `online`: ask without location settings (the engines get no place). */
async function askEngine(engine: Engine, creds: ProviderCredentials, prompt: string, geoAt: GeoContext, mock: MockCtx | null, online = false): Promise<AiAnswer> {
  if (mock) {
    if (mock.failEngine === engine) throw new ProviderError(engine, "auth", "Simulated engine failure (mock mode).", 401);
    return mockAiAnswer(engine, prompt, geoAt, mock);
  }
  const geo = online ? null : geoAt;
  if (engine === "openai") return askOpenAi(creds.openai!, prompt, geo);
  if (engine === "perplexity") return askPerplexity(creds.perplexity!, prompt, geo);
  return askGemini(creds.gemini!, prompt, geo);
}

async function runAi(scan: ScanRow, business: BusinessRow, creds: ProviderCredentials, deadline: number) {
  const admin = dbAdmin();
  const [{ data: pending }, { data: pointRows }, { data: spentRows }] = await Promise.all([
    admin.from("ai_samples").select("id, point_idx, engine, prompt").eq("scan_id", scan.id).eq("status", "pending"),
    admin.from("scan_points").select("idx, lat, lng").eq("scan_id", scan.id),
    admin.from("ai_samples").select("cost_usd").eq("scan_id", scan.id).eq("status", "done"),
  ]);
  const samples = (pending ?? []) as { id: string; point_idx: number; engine: Engine; prompt: string }[];
  if (!samples.length) return;
  const pointAt = new Map(((pointRows ?? []) as { idx: number; lat: number; lng: number }[]).map((p) => [p.idx, p]));
  const who = identity(business);
  const house = scan.funding !== "byok";
  const cap = house ? houseCapUsd(scan.funding as HouseFunding, scan.credits_used) : Number.POSITIVE_INFINITY;
  let spent = ((spentRows ?? []) as { cost_usd: number | null }[]).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  let inFlight = 0; // the part of `spent` that is reservations of calls not yet settled
  const perProvider: Record<string, number> = {};
  const geminiBeyondFree = await geminiBeyondAllowance(scan);
  const mock = isMockMode();
  let lastBeat = Date.now();

  const byEngine = new Map<Engine, typeof samples>();
  for (const s of samples) byEngine.set(s.engine, [...(byEngine.get(s.engine) ?? []), s]);

  await Promise.all([...byEngine.entries()].map(async ([engine, list]) => {
    if (!creds[ENGINE_KEY[engine]]) {
      await admin.from("ai_samples").update({ status: "failed", error: "Engine unavailable: no API key." }).in("id", list.map((s) => s.id));
      return;
    }
    let dead: string | null = null; // set after an auth/quota error: stop hammering this engine
    await pool(list, ENGINE_CONCURRENCY[engine], async (s) => {
      if (Date.now() > deadline) return; // left pending; a later call continues
      if (dead) {
        await admin.from("ai_samples").update({ status: "failed", error: dead }).eq("id", s.id);
        return;
      }
      // Reserve this sample's worst-case cost before the call, so parallel workers cannot overshoot the cap.
      // `spent` = settled costs + reservations of calls still in flight. When only the reservations
      // are in the way, wait for them to settle (real costs are usually far below the worst case);
      // skip only when the settled costs themselves leave no room.
      const reserve = house ? WORST_CASE_SAMPLE_USD[engine] : 0;
      while (spent + reserve > cap) {
        if (spent - inFlight + reserve > cap || inFlight <= 0 || Date.now() > deadline) {
          await admin.from("ai_samples").update({ status: "skipped", error: "Skipped: the cost cap for this included scan was reached." }).eq("id", s.id);
          return;
        }
        await new Promise((r) => setTimeout(r, 40));
      }
      spent += reserve;
      inFlight += reserve;
      const pt = pointAt.get(s.point_idx) ?? { lat: scan.center_lat, lng: scan.center_lng };
      const geo: GeoContext = { lat: pt.lat, lng: pt.lng, city: business.city, region: business.region, country: business.country };
      try {
        const answer = await askEngine(engine, creds, s.prompt, geo, mock ? mockCtx(scan, business, pt.lat, pt.lng) : null, scan.geo_mode === "online");
        let cost = answer.costUsd + (engine === "gemini" && geminiBeyondFree ? GEMINI.groundedPer1000 / 1000 : 0);

        let named = parseNamedBusinesses(answer.text);
        if (named.length === 0 && answer.places.length) named = answer.places.slice(0, 10).map((p, i) => ({ name: p.name, position: i + 1 }));
        if (named.length === 0 && answer.text.length > 80 && creds.openai && !mock) {
          try {
            const parsed = await openAiJson<{ businesses: { name: string }[] }>(creds.openai, {
              instructions: PARSE_INSTRUCTIONS, input: answer.text.slice(0, 6000), schemaName: "named_businesses", schema: PARSE_SCHEMA, maxOutputTokens: 300, timeoutMs: 30_000,
            });
            named = parsed.data.businesses.slice(0, 10).map((b, i) => ({ name: b.name, position: i + 1 }));
            cost += Math.min(parsed.costUsd, LLM_PARSE_BUDGET_USD);
          } catch {
            // keep the sample: the raw answer is stored and the text check below still applies
          }
        }
        let position = positionInNames(named.map((n) => n.name), who);
        if (position == null && answer.places.length) {
          const idx = answer.places.findIndex((p) => (who.cid && p.cid === who.cid) || (who.placeId && p.placeId === who.placeId));
          if (idx !== -1) position = idx + 1;
        }
        const mentioned = position != null || mentionedInText(answer.text, who);

        const rawPath = `${scan.id}/${engine}-${s.point_idx}.json`;
        void putObject(`ai-raw/${rawPath}`, JSON.stringify(answer.raw), "application/json"); // best effort

        await admin.from("ai_samples").update({
          status: "done", engine_variant: answer.variant ?? null, model: answer.model, answer_text: answer.text.slice(0, 20_000),
          mentioned, mention_position: position,
          named_businesses: named.map((n) => ({ ...n, you: namesMatch(n.name, who.name) })),
          sources: answer.sources.slice(0, 25), cost_usd: cost, raw_path: rawPath, error: null,
        }).eq("id", s.id);
        spent += cost - reserve;
        inFlight -= reserve;
        perProvider[engine] = (perProvider[engine] ?? 0) + cost;
      } catch (err) {
        spent -= reserve;
        inFlight -= reserve;
        const pe = err instanceof ProviderError ? err : null;
        const message = `Engine unavailable: ${pe ? pe.message : "unexpected error"}`.slice(0, 300);
        if (pe && (pe.kind === "auth" || pe.kind === "quota")) dead = message;
        await admin.from("ai_samples").update({ status: "failed", error: message }).eq("id", s.id);
      }
      if (Date.now() - lastBeat > 30_000) {
        lastBeat = Date.now();
        await extendLease(scan.id);
      }
    });
  }));

  if (house) await logHouseSpend(scan.funding as HouseFunding, scan.id, perProvider);
}

/** Has this key owner used up the month's 5,000 free grounded Gemini requests (as far as we can see)? */
async function geminiBeyondAllowance(scan: ScanRow): Promise<boolean> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  let q = dbAdmin().from("ai_samples").select("id, scans!inner(workspace_id, funding)", { count: "exact", head: true }).eq("engine", "gemini").eq("status", "done").gte("created_at", start.toISOString());
  q = scan.funding === "byok" ? q.eq("scans.workspace_id", scan.workspace_id).eq("scans.funding", "byok") : q.neq("scans.funding", "byok");
  const { count } = await q;
  return (count ?? 0) >= GEMINI.freeGroundedRequestsPerMonth;
}

const compactTop = (items: MapsItem[]) => items.slice(0, 20).map((i) => ({ rank: i.rank, name: i.name, cid: i.cid, place_id: i.placeId, domain: i.domain, rating: i.rating, reviews: i.reviews }));

async function storeMapsPoint(scanId: string, idx: number, items: MapsItem[], who: BusinessIdentity, costUsd?: number) {
  const hit = findInMaps(items, who);
  await dbAdmin().from("scan_points").update({ status: "done", rank: hit ? hit.rank : null, top: compactTop(items), error: null, ...(costUsd !== undefined ? { cost_usd: costUsd } : {}) }).eq("scan_id", scanId).eq("idx", idx);
}

/**
 * Per-task pingback signature. The URL is visible in the DataForSEO account that ran the task (a
 * customer's account for BYOK scans), so it must never carry the global secret: each URL carries
 * HMAC(secret, tag), which is valid for that one task only.
 */
export function pingbackSignature(tag: string): string {
  return createHmac("sha256", dataforseoPingbackEnv.get().DATAFORSEO_PINGBACK_SECRET).update(tag).digest("hex");
}

function pingbackUrl(tag: string): string | undefined {
  if (!dataforseoPingbackEnv.isConfigured() || !publicEnv.siteUrl.startsWith("https://")) return undefined;
  return `${publicEnv.siteUrl}/api/webhooks/dataforseo?id=$id&tag=$tag&s=${pingbackSignature(tag)}`;
}

async function runMaps(scan: ScanRow, business: BusinessRow, creds: ProviderCredentials, deadline: number) {
  const admin = dbAdmin();
  const who = identity(business);
  const keyword = scan.keyword ?? business.primary_category ?? business.name;
  const { data } = await admin.from("scan_points").select("idx, lat, lng, status, dfs_task_id").eq("scan_id", scan.id).in("status", ["pending", "posted"]);
  const open = (data ?? []) as { idx: number; lat: number; lng: number; status: string; dfs_task_id: string | null }[];
  if (!open.length) return;
  const perProvider: Record<string, number> = {};
  const house = scan.funding !== "byok";
  // House-funded Maps scans: the whole grid's cost is known up front, so check the cap before spending anything.
  if (house) {
    const pending = open.filter((p) => p.status === "pending").length;
    const { data: paidRows } = await admin.from("scan_points").select("cost_usd").eq("scan_id", scan.id).not("cost_usd", "is", null);
    const already = ((paidRows ?? []) as { cost_usd: number }[]).reduce((s, r) => s + Number(r.cost_usd), 0);
    if (!withinCap(already + pending * DATAFORSEO_MAPS_PER_POINT[scan.mode], houseCapUsd(scan.funding as HouseFunding, scan.credits_used))) {
      await admin.from("scan_points").update({ status: "failed", error: "Skipped: the cost cap for this included scan was reached." }).eq("scan_id", scan.id).eq("status", "pending");
      return;
    }
  }

  if (isMockMode()) {
    for (const p of open) await storeMapsPoint(scan.id, p.idx, mockMapsItems(p.lat, p.lng, mockCtx(scan, business, p.lat, p.lng)), who, DATAFORSEO_MAPS_PER_POINT[scan.mode]);
    return;
  }
  if (!creds.dataforseo) {
    await admin.from("scan_points").update({ status: "failed", error: "No DataForSEO login." }).eq("scan_id", scan.id).in("status", ["pending", "posted"]);
    return;
  }
  const dfs = creds.dataforseo;

  if (scan.mode === "live") {
    // A large live grid (225 points, six at a time, about 6 s each) outlasts the lease: renew it, so
    // a status poll does not start a second worker on the same points.
    let lastBeat = Date.now();
    await pool(open.filter((p) => p.status === "pending"), 6, async (p) => {
      if (Date.now() > deadline) return;
      try {
        const r = await mapsLive(dfs, { keyword, lat: p.lat, lng: p.lng, country: business.country });
        await storeMapsPoint(scan.id, p.idx, r.items, who, r.costUsd);
        perProvider.dataforseo = (perProvider.dataforseo ?? 0) + r.costUsd;
      } catch (err) {
        await admin.from("scan_points").update({ status: "failed", error: (err instanceof Error ? err.message : "Lookup failed").slice(0, 300) }).eq("scan_id", scan.id).eq("idx", p.idx);
      }
      if (Date.now() - lastBeat > 30_000) {
        lastBeat = Date.now();
        await extendLease(scan.id);
      }
    });
  } else {
    const toPost = open.filter((p) => p.status === "pending");
    // DataForSEO takes at most MAPS_TASKS_PER_POST tasks per request; an 11×11 grid and up needs several.
    for (let i = 0; i < toPost.length; i += MAPS_TASKS_PER_POST) {
      const batch = toPost.slice(i, i + MAPS_TASKS_PER_POST);
      try {
        const posted = await postMapsTasks(dfs, batch.map((p) => {
          const tag = `${scan.id}:${p.idx}`;
          return { keyword, lat: p.lat, lng: p.lng, country: business.country, tag, pingbackUrl: pingbackUrl(tag) };
        }), scan.mode);
        for (const t of posted) {
          const idx = Number(t.tag.split(":")[1]);
          await admin.from("scan_points").update(t.taskId ? { status: "posted", dfs_task_id: t.taskId, cost_usd: t.costUsd } : { status: "failed", error: (t.error ?? "Task was not created").slice(0, 300) }).eq("scan_id", scan.id).eq("idx", idx);
          perProvider.dataforseo = (perProvider.dataforseo ?? 0) + t.costUsd;
        }
      } catch (err) {
        await admin.from("scan_points").update({ status: "failed", error: (err instanceof Error ? err.message : "Could not queue the scan").slice(0, 300) }).eq("scan_id", scan.id).eq("status", "pending").in("idx", batch.map((p) => p.idx));
      }
      await extendLease(scan.id);
    }
    // Collect results until the deadline; whatever is still queued is picked up by a pingback, a status poll or cron.
    const wait = scan.mode === "priority" ? 5_000 : 15_000;
    while (Date.now() + wait < deadline) {
      const { data: still } = await admin.from("scan_points").select("idx, dfs_task_id").eq("scan_id", scan.id).eq("status", "posted");
      const posted = (still ?? []) as { idx: number; dfs_task_id: string }[];
      if (!posted.length) break;
      await new Promise((r) => setTimeout(r, wait));
      await pool(posted, 6, async (p) => {
        try {
          const r = await getMapsTask(dfs, p.dfs_task_id);
          if (!r.ready) return;
          if (r.failed) await admin.from("scan_points").update({ status: "failed", error: r.failed.slice(0, 300) }).eq("scan_id", scan.id).eq("idx", p.idx);
          else await storeMapsPoint(scan.id, p.idx, r.items, who);
        } catch {
          // transient: try again on the next round
        }
      });
      await extendLease(scan.id);
    }
  }
  if (house) await logHouseSpend(scan.funding as HouseFunding, scan.id, perProvider);
}

/** A DataForSEO pingback for one task: store that point, then finalise if it was the last. */
export async function ingestMapsTask(taskId: string, tag: string): Promise<boolean> {
  const admin = dbAdmin();
  const [scanId, idx] = tag.split(":");
  const { data: point } = await admin.from("scan_points").select("scan_id, idx, status, dfs_task_id").eq("scan_id", scanId).eq("idx", Number(idx)).maybeSingle<{ scan_id: string; idx: number; status: string; dfs_task_id: string | null }>();
  if (!point || point.status !== "posted" || point.dfs_task_id !== taskId) return false;
  const { data: scan } = await admin.from("scans").select("*").eq("id", point.scan_id).maybeSingle<ScanRow>();
  if (!scan) return false;
  const { data: business } = await admin.from("businesses").select("*").eq("id", scan.business_id).maybeSingle<BusinessRow>();
  const creds = await resolveCredentials(scan.workspace_id, scan.funding);
  if (!business || !creds.dataforseo) return false;
  const r = await getMapsTask(creds.dataforseo, taskId);
  if (!r.ready) return false;
  if (r.failed) await admin.from("scan_points").update({ status: "failed", error: r.failed.slice(0, 300) }).eq("scan_id", scan.id).eq("idx", point.idx);
  else await storeMapsPoint(scan.id, point.idx, r.items, identity(business));
  await finalizeIfComplete(scan, business);
  return true;
}

async function finalizeIfComplete(scan: ScanRow, business: BusinessRow) {
  const admin = dbAdmin();
  const house = scan.funding !== "byok";
  const base = { mock: scan.summary?.mock === true ? true : undefined };

  if (scan.kind === "ai") {
    const { data } = await admin.from("ai_samples").select("point_idx, engine, status, mentioned, mention_position, named_businesses, sources, cost_usd").eq("scan_id", scan.id);
    const samples = (data ?? []) as AiSampleRow[];
    if (samples.some((s) => s.status === "pending")) return;
    const summary = summarizeAi(samples, scan.grid_size * scan.grid_size, scan.skip_points ?? []);
    const cost = samples.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    const status = summary.samples_done === 0 ? "failed" : summary.samples_done === summary.samples_total ? "done" : "partial";
    // Included scans: the credit is kept only if at least 80% of the samples completed.
    if (house && scan.credits_used > 0 && summary.samples_done / Math.max(1, summary.samples_total) < 0.8) await admin.rpc("refund_credits", { p_scan_id: scan.id });
    await admin.from("scans").update({
      status, summary: { ...base, ...summary }, actual_cost_usd: cost, finished_at: new Date().toISOString(), lease_until: null,
      error: status === "failed" ? "No engine returned an answer. Check your API keys." : null,
    }).eq("id", scan.id).in("status", ["queued", "running"]);
    return;
  }

  const { data } = await admin.from("scan_points").select("idx, status, rank, top, cost_usd, lat, lng").eq("scan_id", scan.id);
  const points = (data ?? []) as (MapsPointRow & { cost_usd: number | null })[];
  if (points.some((p) => p.status === "pending" || p.status === "posted")) return;
  // Skipped points are not part of the result: `points` in the summary counts the active ones only,
  // so the 80% refund rule and the done/partial status are measured against what was asked for.
  // Reach is measured from the business's own pin, not from a grid centre that may have been moved.
  const summary = summarizeMaps(points, business.name, business.lat != null && business.lng != null ? { lat: business.lat, lng: business.lng } : null);
  const cost = points.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const status = summary.points_done === 0 ? "failed" : summary.points_failed === 0 ? "done" : "partial";
  if (house && scan.credits_used > 0 && summary.points_done / Math.max(1, summary.points) < 0.8) await admin.rpc("refund_credits", { p_scan_id: scan.id });
  await admin.from("scans").update({
    status, summary: { ...base, ...summary }, actual_cost_usd: cost, finished_at: new Date().toISOString(), lease_until: null,
    error: status === "failed" ? "No point returned results. Check your DataForSEO login and balance." : null,
  }).eq("id", scan.id).in("status", ["queued", "running"]);
}

/** Scans that are queued or running with no live worker (timeout, deploy, crash). Called by cron. */
export async function findStalledScans(limit = 10): Promise<string[]> {
  const now = new Date().toISOString();
  const { data } = await dbAdmin().from("scans").select("id").in("status", ["queued", "running"]).or(`lease_until.is.null,lease_until.lt.${now}`).order("created_at").limit(limit);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/** Country → DataForSEO location code (business search and prospect discovery). */
/** DataForSEO country location codes: one table for every country, in lib/countries. */
export { locationCodeFor } from "@/lib/countries";
