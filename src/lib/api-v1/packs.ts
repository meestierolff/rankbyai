import "server-only";
import { z } from "zod";
import type { ApiCaller } from "@/lib/api-keys";
import { normalizeUrl, type PageType } from "@/lib/citations/classify";
import { pageHistory } from "@/lib/citations/inventory";
import { resolveCredentials } from "@/lib/keys";
import { ENGINE_LABEL, ENGINES, type Engine } from "@/lib/pricing-constants";
import { PACK_MAX_PROMPTS, PACK_MAX_REPEATS, PACK_PROMPT_MAX, suggestBuyerPrompts, suggestOnlinePrompts } from "@/lib/packs/prompts";
import { listPacks, loadInventory, loadPack, processPackRun, startPack, suggestionInputs } from "@/lib/packs/run";
import { ownerRead, PAGE_LIMIT_MAX, PAGE_OFFSET_MAX, roundMoney, type ApiResult, type Defer } from "./core";

/**
 * Citation workflow, steps 1 and 2, for the REST API and MCP (both call these, as for core.ts):
 * buyer prompt suggestions, prompt pack runs, and the inventory of pages the answers cited.
 *
 * Money rule as everywhere: run_prompt_pack returns the estimate and creates nothing until
 * confirm: true. Prompt packs run on the user's own keys only.
 */
const ok = (body: Record<string, unknown>, status = 200): ApiResult => ({ status, body: roundMoney(body) });
const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): ApiResult => ({ status, body: roundMoney({ error, message, ...extra }) });
const invalid = (e: z.ZodError) => fail(400, "invalid_request", e.issues.slice(0, 3).map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
const reads = (c: ApiCaller) => {
  const read = ownerRead(c);
  return { ws: read, rows: read };
};
const Page = { limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(50), offset: z.coerce.number().int().min(0).max(PAGE_OFFSET_MAX).default(0) };
/** true/false from JSON, "true"/"false" from a query string. */
const flag = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean()).default(false);

export const SUGGEST_NOTE =
  "Written from the business's stored fields and the businesses its stored answers named; nothing was invented and nothing ran. The suggestions are in English: edit them, add your own or write them in your client's language before running. Free.";
export const MISSING_NOTE =
  "missing.basis says how \"missing\" was decided. page: RankbyAI read the page, it names a business the answers also named, and the business's name (or a link to its site) is not on it. answers: counted from the stored answers that cited the page; the page was not read, could not be read, or the read was not conclusive (missing.note says which). A page read never overrules an answer that named the business. Google Maps listings and the business's own site are never listed as missing.";

// ───────────────────────── step 1: prompts ─────────────────────────

export const SuggestPrompts = z.object({ business_id: z.uuid(), service: z.string().trim().min(2).max(120).optional(), scope: z.enum(["local", "online"]).default("local") });

export async function suggestPromptsOp(c: ApiCaller, q: unknown): Promise<ApiResult> {
  const p = SuggestPrompts.safeParse(q);
  if (!p.success) return invalid(p.error);
  const inp = await suggestionInputs(reads(c), c.workspaceId, p.data.business_id);
  if (!inp) return fail(404, "not_found", "Unknown business.");
  const service = p.data.service ?? inp.service ?? inp.business.primary_category;
  if (!service) return fail(400, "invalid_request", "Send service: what people search for, for example \"dentist\". This business has no AI scan or Google category to take it from.");
  const suggestions = p.data.scope === "online"
    ? suggestOnlinePrompts({ service, category: inp.business.primary_category, competitors: inp.competitors })
    : suggestBuyerPrompts({ service, city: inp.business.city, neighbourhood: inp.neighbourhood, category: inp.business.primary_category, competitors: inp.competitors });
  return ok({ business_id: inp.business.id, business: inp.business.name, service, scope: p.data.scope, suggestions, note: SUGGEST_NOTE });
}

export const RunPack = z.object({
  business_id: z.uuid().optional(),
  pack_id: z.uuid().optional(),
  name: z.string().trim().max(120).optional(),
  service: z.string().trim().min(2).max(120).optional(),
  prompts: z.array(z.string().max(PACK_PROMPT_MAX)).min(1).max(PACK_MAX_PROMPTS).optional(),
  engines: z.array(z.enum(["openai", "perplexity", "gemini"])).min(1).max(3).optional(),
  location: z.enum(["pin", "grid"]).default("pin"),
  grid_size: z.union([z.literal(3), z.literal(5)]).default(3),
  radius_miles: z.number().positive().max(50).default(2),
  repeats: z.number().int().min(1).max(PACK_MAX_REPEATS).default(1),
  /** "online": prompts with no place in them ("best SEO tools"), asked once without location settings. */
  scope: z.enum(["local", "online"]).default("local"),
  confirm: z.boolean().default(false),
}).refine((x) => !!x.pack_id || (!!x.business_id && !!x.service && !!x.prompts), { message: "Send pack_id (run a saved pack again), or business_id with service and prompts (a new pack)." })
  .refine((x) => !(x.scope === "online" && x.location === "grid"), { message: "An online pack asks each prompt once, without a place: leave location at pin.", path: ["location"] });

const keyNames = (engines: Engine[]) => engines.map((e) => ENGINE_LABEL[e].short).join(", ");

/** Shared by the REST API, MCP and the app: parsed input → a started (or estimated) pack run. */
export async function runPack(workspaceId: string, plan: ApiCaller["plan"], b: z.infer<typeof RunPack>) {
  let engines = b.engines;
  if (!b.pack_id && !engines) {
    const creds = await resolveCredentials(workspaceId, "byok");
    engines = ENGINES.filter((e) => !!creds[e]);
    if (!engines.length) return { ok: false as const, status: 400, error: "missing_key", message: "Step 1 (run the prompt pack) needs at least one of your own AI keys (OpenAI, Perplexity or Gemini). Add one in Settings → API keys. Prompt packs run on your own keys only." };
  }
  return startPack({
    workspaceId, plan, businessId: b.business_id, packId: b.pack_id, name: b.name, service: b.service, prompts: b.prompts, engines,
    grid: b.location === "pin" ? 1 : b.grid_size, radiusMiles: b.radius_miles, repeats: b.repeats, scope: b.pack_id ? undefined : b.scope, confirm: b.confirm,
  });
}

export async function runPackOp(c: ApiCaller, input: unknown, defer: Defer): Promise<ApiResult> {
  const p = RunPack.safeParse(input);
  if (!p.success) return invalid(p.error);
  const r = await runPack(c.workspaceId, c.plan, p.data);
  if (!r.ok) {
    if (r.error === "confirmation_required" && "estimate" in r) {
      const missing = ("missingKeys" in r ? r.missingKeys : undefined) ?? [];
      return ok({
        confirm_required: true, estimate: r.estimate, missing_keys: missing,
        message: `This prompt pack costs money on your own API keys. Review the estimate (alternatives prices the same pack at the map point and on the grids), then send the same request with "confirm": true.${missing.length ? ` First add a key for ${keyNames(missing)} in Settings → API keys, or leave ${missing.length === 1 ? "that engine" : "those engines"} out: the run will not start without it.` : ""}`,
      });
    }
    return fail(r.status, r.error, r.message, "estimate" in r && r.estimate ? { estimate: r.estimate } : {});
  }
  defer(() => processPackRun(r.runId));
  return ok({ pack_id: r.packId, run_id: r.runId, scan_ids: r.scanIds, status: "queued", estimate: r.estimate }, 202);
}

export const ListPacks = z.object({ ...Page, business_id: z.uuid().optional() });

export async function listPacksOp(c: ApiCaller, q: unknown): Promise<ApiResult> {
  const p = ListPacks.safeParse(q);
  if (!p.success) return invalid(p.error);
  const packs = await listPacks(ownerRead(c), c.workspaceId, { businessId: p.data.business_id, limit: p.data.limit, offset: p.data.offset });
  return ok({ packs, limit: p.data.limit, offset: p.data.offset });
}

export async function getPackOp(c: ApiCaller, id: string, q: { run_id?: unknown }, defer?: Defer): Promise<ApiResult> {
  const p = z.object({ id: z.uuid(), run_id: z.uuid().optional() }).safeParse({ id, run_id: q.run_id || undefined });
  if (!p.success) return fail(400, "invalid_request", "pack_id and run_id must be UUIDs.");
  const r = await loadPack(reads(c), c.workspaceId, { packId: p.data.id, runId: p.data.run_id });
  if (!r.ok) return fail(r.status, r.error, r.message);
  // Polling continues a run whose work has no live worker, as get_scan does.
  if (defer && r.continueRun) defer(() => processPackRun(r.continueRun!));
  return ok(r.report);
}

// ───────────────────────── step 2: cited pages ─────────────────────────

const PAGE_TYPES = ["listicle", "review", "directory", "official_site", "forum", "social", "maps_listing", "other"] as const;
/** Never "missing": the business cannot be added to a Maps listing it does not own, nor be absent from its own site. */
const NOT_A_TARGET = new Set<PageType>(["maps_listing", "official_site"]);

export const ListCitedSources = z.object({
  ...Page,
  business_id: z.uuid().optional(),
  pack_id: z.uuid().optional(),
  run_id: z.uuid().optional(),
  group_by: z.enum(["url", "domain"]).default("url"),
  missing_only: flag,
  page_type: z.enum(PAGE_TYPES).optional(),
  url: z.string().max(2048).optional(),
  domain: z.string().max(253).optional(),
}).refine((x) => !!(x.business_id || x.pack_id || x.run_id), { message: "Send business_id, pack_id or run_id." });

export async function listCitedSourcesOp(c: ApiCaller, q: unknown): Promise<ApiResult> {
  const p = ListCitedSources.safeParse(q);
  if (!p.success) return invalid(p.error);
  const f = p.data;
  const r = await loadInventory(reads(c), c.workspaceId, { businessId: f.business_id, packId: f.pack_id, runId: f.run_id });
  if (!r.ok) return fail(r.status, r.error, r.message);
  const inv = r.inventory;
  const scope = { business_id: r.business.id, business: r.business.name, pack_id: f.pack_id ?? null, run_id: f.run_id ?? null, runs: inv.runs, answers: inv.answers, answers_with_sources: inv.answers_with_sources };

  // History of one page or one domain, run by run.
  if (f.url || f.domain) {
    const key = f.url ? normalizeUrl(f.url)?.key : undefined;
    if (f.url && !key) return fail(400, "invalid_request", "url: send a full http(s) address.");
    const domain = f.domain?.trim().toLowerCase().replace(/^www\./, "");
    const history = pageHistory(r.runs, r.samples, key ? { key } : { domain });
    const page = key ? inv.urls.find((u) => u.key === key) ?? null : null;
    const site = domain ? inv.domains.find((d) => d.domain === domain) ?? null : null;
    return ok({ scope, ...(key ? { page } : { domain: site }), history, note: MISSING_NOTE });
  }

  if (f.group_by === "domain") {
    let rows = inv.domains;
    if (f.missing_only) rows = rows.filter((d) => d.client_absent && !d.page_types.every((t) => NOT_A_TARGET.has(t)));
    if (f.page_type) rows = rows.filter((d) => d.page_types.includes(f.page_type!));
    return ok({ scope, group_by: "domain", total: rows.length, domains: rows.slice(f.offset, f.offset + f.limit), limit: f.limit, offset: f.offset, note: MISSING_NOTE });
  }
  let rows = inv.urls;
  if (f.missing_only) rows = rows.filter((u) => u.missing.client_absent && !NOT_A_TARGET.has(u.page_type));
  if (f.page_type) rows = rows.filter((u) => u.page_type === f.page_type);
  return ok({ scope, group_by: "url", total: rows.length, urls: rows.slice(f.offset, f.offset + f.limit), limit: f.limit, offset: f.offset, note: MISSING_NOTE });
}
