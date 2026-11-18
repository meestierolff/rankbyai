import "server-only";
import { z } from "zod";
import type { ApiCaller } from "@/lib/api-keys";
import { generateFixKit } from "@/lib/audit/fixkit";
import { createAudit, processAudit } from "@/lib/audit/run";
import type { ScanSpec } from "@/lib/cost-guard";
import { dbAdmin, dbUser } from "@/lib/db/clients";
import { resolveCredentials } from "@/lib/keys";
import { isMockMode } from "@/lib/mock";
import { DATAFORSEO_MAPS_PER_POINT, FAIR_USE, LLM_FIX_KIT_BUDGET_USD } from "@/lib/pricing-constants";
import { createBatch, discover, estimateBatch, processBatch, resolveRows, type BatchRow } from "@/lib/prospects/batch";
import { compareAi, compareHeadline, compareMaps, type AiCompareSample, type MapsComparePoint } from "@/lib/scans/compare";
import { createScan, processScan } from "@/lib/scans/engine";
import { MAX_POINT_IDX } from "@/lib/scans/skip";
import { ENGINES } from "@/lib/pricing-constants";
import { COUNTRY_CODES, DEFAULT_COUNTRY } from "@/lib/countries";

/**
 * The public API's operations (brief 7.8). REST routes and MCP tools both call these, so the two
 * cannot drift apart. Reads go through row-level security as the workspace owner; writes use the
 * same library functions as the app, which authorise against the caller's workspace.
 *
 * Money rule: anything that calls a vendor returns an estimate first and runs only with confirm: true.
 */
export interface ApiResult { status: number; body: Record<string, unknown> }
/** Runs work after the response is sent (Next.js `after`); tests run it inline. */
export type Defer = (work: () => Promise<unknown>) => void;

/**
 * Money in responses: every US-dollar amount (any numeric field whose name contains "usd") is
 * rounded to 6 decimal places, so sums of vendor prices never leak binary-float noise.
 */
export function roundMoney<T>(value: T, isMoney = false): T {
  if (typeof value === "number") return (isMoney && Number.isFinite(value) ? Number(value.toFixed(6)) : value) as T;
  if (Array.isArray(value)) return value.map((v) => roundMoney(v, isMoney)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundMoney(v, /usd/i.test(k))])) as T;
  return value;
}

const ok = (body: Record<string, unknown>, status = 200): ApiResult => ({ status, body: roundMoney(body) });
const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): ApiResult => ({ status, body: roundMoney({ error, message, ...extra }) });
const needsConfirm = (estimate: unknown, what: string): ApiResult => ok({ confirm_required: true, estimate, message: `This ${what} costs money. Review the estimate, then send the same request with "confirm": true.` });
/**
 * Estimate for a single vendor call. Estimates use camelCase keys everywhere (`totalUsd`, `lines`);
 * `total_usd` is the old name of `totalUsd` on these two estimates, kept for one release.
 */
const singleCallEstimate = (provider: string, label: string, usd: number) => ({ totalUsd: usd, total_usd: usd, lines: [{ provider, label, usd }] });
const uuid = z.uuid();
const badId = (what: string) => fail(404, "not_found", `Unknown ${what}.`);
/** An id that is not a UUID can never exist: that is a malformed request (400), not a missing resource (404). */
const invalidId = (what: string) => fail(400, "invalid_request", `id: the ${what} id must be a UUID.`);
const invalid = (e: z.ZodError) => fail(400, "invalid_request", e.issues.slice(0, 3).map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** Paging shared by every list endpoint. */
export const PAGE_LIMIT_MAX = 200;
export const PAGE_OFFSET_MAX = 100_000;
const Page = { limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(50), offset: z.coerce.number().int().min(0).max(PAGE_OFFSET_MAX).default(0) };

const BUSINESS_COLS = "id, client_id, name, address, city, region, country, lat, lng, website, phone, primary_category, rating, reviews_count, source, created_at";

// ───────────────────────── businesses ─────────────────────────

export async function listBusinesses(c: ApiCaller, q: { limit?: unknown; offset?: unknown }): Promise<ApiResult> {
  const p = z.object(Page).safeParse(q);
  if (!p.success) return invalid(p.error);
  const { data, error } = await dbUser(c.ownerId).from("businesses").select(BUSINESS_COLS).eq("workspace_id", c.workspaceId).neq("source", "prospect").order("created_at", { ascending: false }).range(p.data.offset, p.data.offset + p.data.limit - 1);
  if (error) return fail(500, "server_error", "The businesses could not be loaded.");
  return ok({ businesses: data ?? [], limit: p.data.limit, offset: p.data.offset });
}

export const AddBusiness = z.object({
  name: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(120).optional(),
  country: z.enum(COUNTRY_CODES).default(DEFAULT_COUNTRY),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().max(400).optional(),
  website: z.string().max(500).regex(/^https?:\/\//i, "must start with http:// or https://").optional(),
  phone: z.string().max(40).optional(),
  primary_category: z.string().max(120).optional(),
  confirm: z.boolean().default(false),
});

/** With coordinates the business is stored as given (free). With a name and a city it is looked up on Google Maps (one paid lookup). */
export async function addBusiness(c: ApiCaller, input: unknown): Promise<ApiResult> {
  const p = AddBusiness.safeParse(input);
  if (!p.success) return invalid(p.error);
  if (c.plan !== "lifetime") return fail(403, "lifetime_required", "Adding businesses needs lifetime access.");
  const b = p.data;
  const admin = dbAdmin();
  const { count } = await admin.from("businesses").select("id", { count: "exact", head: true }).eq("workspace_id", c.workspaceId);
  if ((count ?? 0) >= FAIR_USE.businesses) return fail(409, "limit_reached", `The fair-use limit is ${FAIR_USE.businesses} businesses per workspace.`);

  let row: Record<string, unknown>;
  if (b.lat != null && b.lng != null) {
    row = { name: b.name, city: b.city ?? null, country: b.country, lat: b.lat, lng: b.lng, address: b.address ?? null, website: b.website ?? null, phone: b.phone ?? null, primary_category: b.primary_category ?? null, source: "manual" };
  } else {
    if (!b.city) return fail(400, "invalid_request", "Send either lat and lng, or a city so the business can be looked up on Google Maps.");
    if (!b.confirm) return needsConfirm(singleCallEstimate("dataforseo", "One Google Maps lookup on your DataForSEO key", DATAFORSEO_MAPS_PER_POINT.live), "lookup");
    try {
      const r = await resolveRows({ workspaceId: c.workspaceId, funding: "byok", rows: [{ name: b.name, city: b.city, country: b.country, address: "", region: "", website: b.website ?? "", phone: b.phone ?? "", place_id: "" }] });
      const hit = r.resolved[0];
      if (!hit) return fail(404, "listing_not_found", r.unresolved[0]?.reason ?? "No Google Maps listing with this name was found in this city.");
      row = { name: hit.name, cid: hit.cid, place_id: hit.place_id, address: hit.address, city: hit.city ?? b.city, region: hit.region, country: hit.country ?? b.country, lat: hit.lat, lng: hit.lng, website: hit.website, phone: hit.phone, primary_category: hit.category, rating: hit.rating, reviews_count: hit.reviews, source: "search" };
    } catch (e) {
      if (e instanceof Error && e.message === "missing_key") return fail(400, "missing_key", "Looking a business up needs your DataForSEO login (Settings → API keys). Or send lat and lng.");
      return fail(502, "lookup_failed", "The Google Maps lookup did not complete.");
    }
  }
  if (row.cid) {
    const { data: dup } = await admin.from("businesses").select(BUSINESS_COLS).eq("workspace_id", c.workspaceId).eq("cid", row.cid as string).maybeSingle();
    if (dup) return ok({ business: dup, existing: true });
  }
  const { data, error } = await admin.from("businesses").insert({ ...row, workspace_id: c.workspaceId }).select(BUSINESS_COLS).single();
  if (error || !data) return fail(500, "server_error", "The business could not be saved.");
  return ok({ business: data, existing: false }, 201);
}

export async function getBusiness(c: ApiCaller, id: string): Promise<ApiResult> {
  if (!uuid.safeParse(id).success) return invalidId("business");
  const db = dbUser(c.ownerId);
  const { data } = await db.from("businesses").select(BUSINESS_COLS).eq("id", id).eq("workspace_id", c.workspaceId).maybeSingle();
  if (!data) return badId("business");
  const { data: scans } = await db.from("scans").select("id, kind, grid_size, status, keyword, niche, created_at").eq("business_id", id).eq("workspace_id", c.workspaceId).order("created_at", { ascending: false }).limit(10);
  return ok({ business: data, recent_scans: scans ?? [] });
}

export const UpdateBusiness = z.strictObject({
  name: z.string().trim().min(1).max(300).optional(),
  address: z.preprocess(blankToNull, z.string().trim().max(400).nullable()).optional(),
  city: z.preprocess(blankToNull, z.string().trim().max(120).nullable()).optional(),
  /** A client of this workspace (clients are made in the app), or null to take the business out of its client. */
  client_id: z.uuid().nullable().optional(),
});

/** Change the name, address, city or client of a business. Free. Only the fields that are sent change. */
export async function updateBusiness(c: ApiCaller, id: string, input: unknown): Promise<ApiResult> {
  if (!uuid.safeParse(id).success) return invalidId("business");
  const p = UpdateBusiness.safeParse(input);
  if (!p.success) return invalid(p.error);
  const patch = Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined));
  if (!Object.keys(patch).length) return fail(400, "invalid_request", "Send at least one of: name, address, city, client_id.");
  const admin = dbAdmin();
  if (typeof patch.client_id === "string") {
    const { data: client } = await admin.from("clients").select("id").eq("id", patch.client_id).eq("workspace_id", c.workspaceId).maybeSingle();
    if (!client) return fail(400, "invalid_client", "That client does not belong to this workspace.");
  }
  const { data, error } = await admin.from("businesses").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", c.workspaceId).select(BUSINESS_COLS);
  if (error) return fail(500, "server_error", "The business could not be updated.");
  return data?.[0] ? ok({ business: data[0] }) : badId("business");
}

/**
 * Delete a business. The same single delete as the app's own route (DELETE /api/businesses/{id}):
 * the database removes the business's scans, audits, Fix Kits, schedules and reports with it, so
 * its share links stop working. Free, and it cannot be undone.
 */
export async function deleteBusiness(c: ApiCaller, id: string): Promise<ApiResult> {
  if (!uuid.safeParse(id).success) return invalidId("business");
  const { error, count } = await dbAdmin().from("businesses").delete({ count: "exact" }).eq("id", id).eq("workspace_id", c.workspaceId);
  if (error) return fail(500, "server_error", "The business could not be deleted.");
  return count ? ok({ deleted: true, id }) : badId("business");
}

// ───────────────────────── scans ─────────────────────────

export const CreateScan = z.object({
  business_id: z.uuid(),
  kind: z.enum(["ai", "maps"]),
  /** The service people ask for (AI) or the Maps keyword. `prompt` is accepted as an alias for AI scans. */
  keyword: z.string().trim().min(2).max(120).optional(),
  prompt: z.string().trim().min(2).max(120).optional(),
  prompt_template: z.string().max(400).optional(),
  grid_size: z.number().int(),
  radius_miles: z.number().positive().max(50).default(2),
  engines: z.array(z.enum(["openai", "perplexity", "gemini"])).min(1).max(3).optional(),
  mode: z.enum(["standard", "priority", "live"]).default("priority"),
  /** Grid points not to check. Range, repeats and "at least one point stays active" are checked against grid_size (lib/scans/skip). */
  skip_points: z.array(z.number().int().min(0).max(MAX_POINT_IDX)).max(MAX_POINT_IDX).optional(),
  funding: z.enum(["byok", "credits"]).default("byok"),
  confirm: z.boolean().default(false),
});

export async function createScanOp(c: ApiCaller, input: unknown, defer: Defer): Promise<ApiResult> {
  const p = CreateScan.safeParse(input);
  if (!p.success) return invalid(p.error);
  const b = p.data;
  const keyword = b.keyword ?? b.prompt;
  if (!keyword) return fail(400, "invalid_request", "Send `keyword`: the service people search for, for example \"dentist\".");
  let engines = b.engines;
  if (b.kind === "ai" && !engines) {
    const creds = await resolveCredentials(c.workspaceId, b.funding);
    engines = ENGINES.filter((e) => !!creds[e]);
    if (!engines.length) return fail(400, "missing_key", "No AI engine key is available. Add a key in Settings → API keys, or use \"funding\": \"credits\".");
  }
  const spec = (b.kind === "ai" ? { kind: "ai", grid: b.grid_size, engines, skip: b.skip_points } : { kind: "maps", grid: b.grid_size, mode: b.mode, skip: b.skip_points }) as ScanSpec;
  const r = await createScan({ workspaceId: c.workspaceId, plan: c.plan, businessId: b.business_id, spec, keyword, promptTemplate: b.prompt_template, radiusMiles: b.radius_miles, funding: b.funding, confirm: b.confirm });
  if (!r.ok) {
    if (r.error === "confirmation_required") return needsConfirm(r.estimate, "scan");
    return fail(r.status, r.error, r.message, r.estimate ? { estimate: r.estimate } : {});
  }
  defer(() => processScan(r.scanId));
  return ok({ scan_id: r.scanId, status: "queued", estimate: r.estimate }, 202);
}

const SCAN_COLS = "id, business_id, kind, keyword, niche, engines, grid_size, skip_points, radius_miles, mode, funding, status, credits_used, est_cost_usd, actual_cost_usd, summary, error, created_at, finished_at";

const ListScans = z.object({ ...Page, business_id: z.uuid().optional(), kind: z.enum(["ai", "maps"]).optional(), status: z.enum(["queued", "running", "done", "partial", "failed"]).optional() });

/** Every scan of the workspace, newest first, optionally narrowed to a business, a kind or a status. */
export async function listScans(c: ApiCaller, q: Record<string, unknown>): Promise<ApiResult> {
  const p = ListScans.safeParse(q);
  if (!p.success) return invalid(p.error);
  const f = p.data;
  let query = dbUser(c.ownerId).from("scans").select(SCAN_COLS).eq("workspace_id", c.workspaceId);
  if (f.business_id) query = query.eq("business_id", f.business_id);
  if (f.kind) query = query.eq("kind", f.kind);
  if (f.status) query = query.eq("status", f.status);
  const { data, error } = await query.order("created_at", { ascending: false }).range(f.offset, f.offset + f.limit - 1);
  if (error) return fail(500, "server_error", "The scans could not be loaded.");
  return ok({ scans: data ?? [], limit: f.limit, offset: f.offset });
}

export async function getScan(c: ApiCaller, id: string, defer?: Defer): Promise<ApiResult> {
  if (!uuid.safeParse(id).success) return invalidId("scan");
  const { data } = await dbUser(c.ownerId).from("scans").select(`${SCAN_COLS}, lease_until`).eq("id", id).eq("workspace_id", c.workspaceId).maybeSingle();
  if (!data) return badId("scan");
  const { lease_until, ...scan } = data as Record<string, unknown> & { lease_until: string | null; status: string };
  // Polling continues a scan that has no live worker (for example while the Maps queue is answering).
  if (defer && (scan.status === "queued" || scan.status === "running") && (!lease_until || new Date(lease_until).getTime() < Date.now())) defer(() => processScan(id));
  return ok({ scan });
}

export async function getScanPoints(c: ApiCaller, id: string): Promise<ApiResult> {
  if (!uuid.safeParse(id).success) return invalidId("scan");
  const db = dbUser(c.ownerId);
  const { data: scan } = await db.from("scans").select("id, kind, grid_size, status").eq("id", id).eq("workspace_id", c.workspaceId).maybeSingle();
  if (!scan) return badId("scan");
  const [{ data: points }, { data: samples }] = await Promise.all([
    db.from("scan_points").select("idx, row, col, lat, lng, label, rank, top, status, error").eq("scan_id", id).order("idx"),
    scan.kind === "ai"
      ? db.from("ai_samples").select("point_idx, engine, prompt, answer_text, mentioned, mention_position, named_businesses, sources, status, error").eq("scan_id", id).order("point_idx")
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  return ok({ scan_id: id, kind: scan.kind, grid_size: scan.grid_size, status: scan.status, points: points ?? [], ...(scan.kind === "ai" ? { samples: samples ?? [] } : {}), note: scan.kind === "ai" ? "AI answers vary between runs, places and time; API results can differ from what people see in the consumer apps." : undefined });
}

export async function compareScans(c: ApiCaller, q: { a?: unknown; b?: unknown }): Promise<ApiResult> {
  const p = z.object({ a: z.uuid(), b: z.uuid() }).safeParse(q);
  if (!p.success) return fail(400, "invalid_request", "Send two scan ids: a (earlier) and b (later).");
  const db = dbUser(c.ownerId);
  const { data: rows } = await db.from("scans").select("id, business_id, kind, grid_size, status, created_at").in("id", [p.data.a, p.data.b]).eq("workspace_id", c.workspaceId);
  const a = (rows ?? []).find((s) => s.id === p.data.a);
  const b = (rows ?? []).find((s) => s.id === p.data.b);
  if (!a || !b) return badId("scan");
  if (a.kind !== b.kind || a.business_id !== b.business_id) return fail(400, "not_comparable", "Both scans must be of the same business and the same kind.");
  if (![a, b].every((s) => s.status === "done" || s.status === "partial")) return fail(409, "not_finished", "Both scans must be finished.");
  if (a.kind === "ai") {
    const { data } = await db.from("ai_samples").select("scan_id, point_idx, engine, status, mentioned, mention_position").in("scan_id", [a.id, b.id]);
    const all = (data ?? []) as (AiCompareSample & { scan_id: string })[];
    const cmp = compareAi(all.filter((s) => s.scan_id === a.id), all.filter((s) => s.scan_id === b.id), a.grid_size, b.grid_size);
    return ok({ kind: "ai", a: a.id, b: b.id, headline: compareHeadline("ai", cmp), comparison: cmp as unknown as Record<string, unknown> });
  }
  const { data } = await db.from("scan_points").select("scan_id, idx, row, col, rank, status").in("scan_id", [a.id, b.id]).order("idx");
  const all = (data ?? []) as (MapsComparePoint & { scan_id: string })[];
  const cmp = compareMaps(all.filter((s) => s.scan_id === a.id), all.filter((s) => s.scan_id === b.id));
  return ok({ kind: "maps", a: a.id, b: b.id, headline: compareHeadline("maps", cmp), comparison: cmp as unknown as Record<string, unknown> });
}

// ───────────────────────── audits ─────────────────────────

export const CreateAudit = z.object({
  business_id: z.uuid(),
  service: z.string().trim().min(2).max(80),
  months: z.number().int().min(1).max(12).default(3),
  funding: z.enum(["byok", "credits"]).default("byok"),
  confirm: z.boolean().default(false),
});

export async function createAuditOp(c: ApiCaller, input: unknown, defer: Defer): Promise<ApiResult> {
  const p = CreateAudit.safeParse(input);
  if (!p.success) return invalid(p.error);
  const b = p.data;
  const r = await createAudit({ workspaceId: c.workspaceId, plan: c.plan, businessId: b.business_id, service: b.service, months: b.months, funding: b.funding, confirm: b.confirm });
  if (!r.ok) {
    if (r.error === "confirmation_required") return needsConfirm(r.estimate, "audit");
    return fail(r.status, r.error, r.message, r.estimate ? { estimate: r.estimate } : {});
  }
  defer(() => processAudit(r.auditId));
  return ok({ audit_id: r.auditId, status: "queued", estimate: r.estimate }, 202);
}

const ListAudits = z.object({ ...Page, business_id: z.uuid().optional(), status: z.enum(["queued", "running", "done", "failed"]).optional() });

/** Every audit of the workspace, newest first. Findings are on GET /audits/{id}. */
export async function listAudits(c: ApiCaller, q: Record<string, unknown>): Promise<ApiResult> {
  const p = ListAudits.safeParse(q);
  if (!p.success) return invalid(p.error);
  const f = p.data;
  // `inputs` also holds internal check state: only the service and the months are read from it.
  let query = dbUser(c.ownerId).from("audits").select("id, business_id, status, score, category_scores, checks_ran, checks_total, funding, est_cost_usd, cost_usd, error, created_at, finished_at, service:inputs->>service, months:inputs->months").eq("workspace_id", c.workspaceId);
  if (f.business_id) query = query.eq("business_id", f.business_id);
  if (f.status) query = query.eq("status", f.status);
  const { data, error } = await query.order("created_at", { ascending: false }).range(f.offset, f.offset + f.limit - 1);
  if (error) return fail(500, "server_error", "The audits could not be loaded.");
  return ok({ audits: data ?? [], limit: f.limit, offset: f.offset });
}

export async function getAudit(c: ApiCaller, id: string): Promise<ApiResult> {
  if (!uuid.safeParse(id).success) return invalidId("audit");
  const db = dbUser(c.ownerId);
  const { data: audit } = await db.from("audits").select("id, business_id, status, score, category_scores, checks_ran, checks_total, funding, est_cost_usd, cost_usd, error, created_at, finished_at, inputs").eq("id", id).eq("workspace_id", c.workspaceId).maybeSingle();
  if (!audit) return badId("audit");
  const { inputs, ...rest } = audit as Record<string, unknown> & { inputs: { service?: string; months?: number; checks?: { key: string; title: string; status: string; reason?: string }[] } };
  const { data: findings } = await db.from("audit_findings").select("priority, category, title, evidence, fix, impact_note, check_key").eq("audit_id", id).order("priority");
  return ok({
    audit: { ...rest, service: inputs?.service ?? null, months: inputs?.months ?? null },
    findings: findings ?? [],
    not_checked: (inputs?.checks ?? []).filter((x) => x.status === "not_checked").map((x) => ({ check: x.key, title: x.title, reason: x.reason ?? null })),
  });
}

/** `readOnly` (HEAD requests) returns a stored Fix Kit and never builds one. */
export async function getFixKit(c: ApiCaller, id: string, q: { confirm?: unknown }, opts: { readOnly?: boolean } = {}): Promise<ApiResult> {
  if (!uuid.safeParse(id).success) return invalidId("audit");
  const db = dbUser(c.ownerId);
  const { data: audit } = await db.from("audits").select("id, status, funding").eq("id", id).eq("workspace_id", c.workspaceId).maybeSingle();
  if (!audit) return badId("audit");
  const cols = "id, audit_id, description, faqs, jsonld_localbusiness, jsonld_faq, llms_txt, checklist, created_at";
  const { data: existing } = await db.from("fix_kits").select(cols).eq("audit_id", id).order("created_at", { ascending: false }).limit(1);
  if (existing?.[0]) return ok({ fix_kit: existing[0] });
  if (audit.status !== "done") return fail(409, "audit_not_done", "The audit has not finished yet.");
  if (opts.readOnly) return fail(404, "not_built", "The Fix Kit has not been built yet. Send a GET request to build it.");
  if (c.plan !== "lifetime") return fail(403, "lifetime_required", "The Fix Kit needs lifetime access.");
  // Building it makes one model call. On own keys that is the caller's money, so it needs a confirm.
  const confirmed = q.confirm === true || q.confirm === "true";
  if (audit.funding === "byok" && !confirmed && !isMockMode()) {
    return needsConfirm(singleCallEstimate("openai", "One OpenAI call to draft the description and FAQs (upper bound)", LLM_FIX_KIT_BUDGET_USD), "Fix Kit");
  }
  const r = await generateFixKit(id, c.workspaceId);
  if (!r.ok) return fail(r.status, r.error, r.message);
  const { data: saved } = await db.from("fix_kits").select(cols).eq("id", r.kit.id).maybeSingle();
  return ok({ fix_kit: saved ?? r.kit, ...(r.note ? { note: r.note } : {}) });
}

// ───────────────────────── prospects ─────────────────────────

export const NamedBusiness = z.object({
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(120),
  country: z.enum(COUNTRY_CODES).optional(),
  website: z.string().trim().max(300).optional(),
});

export const CreateProspects = z.object({
  /** The service the AI assistants are asked about and the Google Maps keyword, e.g. "dentist" or "seo agency". */
  niche: z.string().trim().min(2).max(80),
  /** Search mode: the city to search. Not needed with `businesses`. */
  city: z.string().trim().min(2).max(120).optional(),
  country: z.enum(COUNTRY_CODES).default(DEFAULT_COUNTRY),
  /** Search mode: how many reports to build, taken from the businesses outside the top 3. */
  max_reports: z.number().int().min(1).max(50).default(10),
  /** Named mode: report on these businesses instead of searching. Each is looked up on Google Maps by name and city. */
  businesses: z.array(NamedBusiness).min(1).max(20).optional(),
  funding: z.enum(["byok", "credits"]).default("byok"),
  confirm: z.boolean().default(false),
}).refine((b) => !!b.businesses?.length || !!b.city, { message: "Give a city to search, or a businesses list.", path: ["city"] });

/**
 * Prospect reports over the API. Search mode: find businesses for a niche and a city, and report on the
 * first N outside the top 3. Named mode (`businesses`): look each business up by name and city and report
 * on the ones found, wherever they rank.
 */
export async function createProspectsOp(c: ApiCaller, input: unknown, defer: Defer): Promise<ApiResult> {
  const p = CreateProspects.safeParse(input);
  if (!p.success) return invalid(p.error);
  const b = p.data;
  if (c.plan !== "lifetime") return fail(403, "lifetime_required", "Prospect reports need lifetime access.");
  if (b.businesses?.length) return createNamedProspects(c, { ...b, businesses: b.businesses }, defer);
  const city = b.city!;
  if (!b.confirm) {
    const creds = await resolveCredentials(c.workspaceId, b.funding);
    const est = await estimateBatch(b.max_reports, ENGINES.filter((e) => !!creds[e]));
    const search = DATAFORSEO_MAPS_PER_POINT.live;
    return needsConfirm({ ...est, totalUsd: est.totalUsd + search, lines: [{ provider: "dataforseo", label: "One Google Maps search to find the businesses", usd: search }, ...est.lines], note: `Up to ${b.max_reports} reports; fewer when the search finds fewer businesses outside the top 3.` }, "prospect batch");
  }
  let candidates;
  try {
    candidates = (await discover({ workspaceId: c.workspaceId, funding: b.funding, niche: b.niche, city, country: b.country })).candidates;
  } catch (e) {
    if (e instanceof Error && e.message === "missing_key") return fail(400, "missing_key", "Prospect mode needs your DataForSEO login (Settings → API keys), or \"funding\": \"credits\".");
    return fail(502, "lookup_failed", "The Google Maps search did not complete.");
  }
  const picked = candidates.filter((x) => (x.rank ?? 99) > 3).slice(0, b.max_reports);
  if (!picked.length) return fail(404, "no_businesses", "The search found no businesses outside the top 3.");
  const r = await createBatch({ workspaceId: c.workspaceId, plan: c.plan, mode: "search", niche: b.niche, city, country: b.country, candidates: picked, funding: b.funding, confirm: true });
  if (!r.ok) return fail(r.status, r.error, r.message, r.estimate ? { estimate: r.estimate } : {});
  defer(() => processBatch(r.batchId));
  return ok({ batch_id: r.batchId, status: "queued", reports: picked.length, businesses_found: candidates.length, estimate: r.estimate }, 202);
}

/** Named mode: one Google Maps lookup per business, then a report for each one found. A name that is not found is reported back, never guessed. */
async function createNamedProspects(
  c: ApiCaller,
  b: { niche: string; city?: string; country: string; businesses: z.infer<typeof NamedBusiness>[]; funding: "byok" | "credits"; confirm: boolean },
  defer: Defer,
): Promise<ApiResult> {
  const lookup = DATAFORSEO_MAPS_PER_POINT.live;
  if (!b.confirm) {
    const creds = await resolveCredentials(c.workspaceId, b.funding);
    const est = await estimateBatch(b.businesses.length, ENGINES.filter((e) => !!creds[e]));
    const lookups = lookup * b.businesses.length;
    return needsConfirm({ ...est, totalUsd: est.totalUsd + lookups, lines: [{ provider: "dataforseo", label: "One Google Maps lookup per named business", usd: lookups }, ...est.lines], note: "One report per business found on Google Maps; a business that is not found is not charged." }, "prospect batch");
  }
  let resolved, unresolved;
  try {
    const rows = b.businesses.map((x) => ({ name: x.name, address: "", city: x.city, region: "", country: x.country ?? "", website: x.website ?? "", phone: "", place_id: "" }));
    ({ resolved, unresolved } = await resolveRows({ workspaceId: c.workspaceId, funding: b.funding, rows, country: b.country }));
  } catch (e) {
    if (e instanceof Error && e.message === "missing_key") return fail(400, "missing_key", "Prospect mode needs your DataForSEO login (Settings → API keys), or \"funding\": \"credits\".");
    return fail(502, "lookup_failed", "The Google Maps lookup did not complete.");
  }
  if (!resolved.length) return fail(404, "no_businesses", "None of the businesses was found on Google Maps.", { unresolved });
  const r = await createBatch({ workspaceId: c.workspaceId, plan: c.plan, mode: "csv", niche: b.niche, city: b.city ?? b.businesses[0].city, country: b.country, candidates: resolved, funding: b.funding, confirm: true });
  if (!r.ok) return fail(r.status, r.error, r.message, r.estimate ? { estimate: r.estimate } : {});
  defer(() => processBatch(r.batchId));
  return ok({ batch_id: r.batchId, status: "queued", reports: resolved.length, unresolved, estimate: r.estimate }, 202);
}

/** Every prospect batch of the workspace, newest first. The reports of a batch are on GET /prospects/{id}. */
export async function listProspectBatches(c: ApiCaller, q: Record<string, unknown>): Promise<ApiResult> {
  const p = z.object({ ...Page, status: z.enum(["queued", "running", "done", "partial", "failed"]).optional() }).safeParse(q);
  if (!p.success) return invalid(p.error);
  const f = p.data;
  let query = dbUser(c.ownerId).from("prospect_batches").select("id, mode, niche, city, country, funding, total, done, failed, status, created_at, finished_at").eq("workspace_id", c.workspaceId);
  if (f.status) query = query.eq("status", f.status);
  const { data, error } = await query.order("created_at", { ascending: false }).range(f.offset, f.offset + f.limit - 1);
  if (error) return fail(500, "server_error", "The prospect batches could not be loaded.");
  return ok({ batches: data ?? [], limit: f.limit, offset: f.offset });
}

export async function getProspects(c: ApiCaller, id: string, siteUrl: string, defer?: Defer): Promise<ApiResult> {
  if (!uuid.safeParse(id).success) return invalidId("batch");
  const { data } = await dbUser(c.ownerId).from("prospect_batches").select("id, mode, niche, city, funding, total, done, failed, status, rows, created_at, finished_at, lease_until").eq("id", id).eq("workspace_id", c.workspaceId).maybeSingle();
  if (!data) return badId("batch");
  const { rows, lease_until, ...batch } = data as Record<string, unknown> & { rows: BatchRow[]; lease_until: string | null; status: string };
  if (defer && (batch.status === "queued" || batch.status === "running") && (!lease_until || new Date(lease_until).getTime() < Date.now())) defer(() => processBatch(id, 150_000));
  return ok({
    batch,
    reports: rows.map((r) => ({
      business: r.name, website: r.website, phone: r.phone, status: r.status, error: r.error ?? null,
      maps_top3_share_pct: r.maps_top3_share ?? null, ai_mention_rate_pct: r.ai_mention_rate ?? null, top_competitor: r.top_competitor ?? null, opener: r.opener ?? null,
      report_url: r.report_slug ? `${siteUrl}/r/${r.report_slug}` : null, business_id: r.business_id ?? null,
    })),
  });
}

// ───────────────────────── branding ─────────────────────────

const BRANDING_COLS = "brand_name, brand_color_hex, brand_website, reply_to_email, hide_rankbyai_branding";
const httpUrl = z.string().trim().max(300).refine((v) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}, "must be a full web address starting with https://");

/** The white-label fields of the app's Branding page (same rules as POST /api/branding). The logo is uploaded in the app. */
export const UpdateBranding = z.strictObject({
  brand_name: z.preprocess(blankToNull, z.string().trim().max(80).nullable()).optional(),
  brand_color_hex: z.preprocess(blankToNull, z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a colour like #1a2b3c").nullable()).optional(),
  brand_website: z.preprocess(blankToNull, httpUrl.nullable()).optional(),
  reply_to_email: z.preprocess(blankToNull, z.email().max(254).nullable()).optional(),
  hide_rankbyai_branding: z.boolean().optional(),
});

const brandingOf = (row: Record<string, unknown>) => {
  const { brand_logo_path, ...branding } = row;
  return { ...branding, has_logo: !!brand_logo_path };
};

/** What share links and PDF reports show as the agency. */
export async function getBranding(c: ApiCaller): Promise<ApiResult> {
  const { data, error } = await dbUser(c.ownerId).from("workspaces").select(`${BRANDING_COLS}, brand_logo_path`).eq("id", c.workspaceId).maybeSingle();
  if (error || !data) return fail(500, "server_error", "The branding could not be loaded.");
  return ok({ branding: brandingOf(data) });
}

/** Change white-label fields. Free. Only the fields that are sent change; null or "" clears a field. */
export async function updateBranding(c: ApiCaller, input: unknown): Promise<ApiResult> {
  const p = UpdateBranding.safeParse(input);
  if (!p.success) return invalid(p.error);
  if (c.plan !== "lifetime") return fail(403, "lifetime_required", "White-label branding needs lifetime access.");
  const patch = Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined));
  if (!Object.keys(patch).length) return fail(400, "invalid_request", "Send at least one of: brand_name, brand_color_hex, brand_website, reply_to_email, hide_rankbyai_branding.");
  const { data, error } = await dbAdmin().from("workspaces").update(patch).eq("id", c.workspaceId).select(`${BRANDING_COLS}, brand_logo_path`);
  if (error || !data?.[0]) return fail(500, "server_error", "The branding could not be saved.");
  return ok({ branding: brandingOf(data[0]) });
}

// ───────────────────────── usage ─────────────────────────

export async function getUsage(c: ApiCaller): Promise<ApiResult> {
  const admin = dbAdmin();
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [{ data: rows, error }, { data: balance }] = await Promise.all([
    admin.rpc("workspace_usage", { p_workspace_id: c.workspaceId, p_since: since }),
    admin.rpc("credit_balance", { p_workspace_id: c.workspaceId }),
  ]);
  if (error) return fail(500, "server_error", "Usage could not be loaded.");
  const own = ((rows ?? []) as { provider: string; funding: string; usd: number; calls: number }[]).filter((r) => r.funding === "byok");
  return ok({
    period_start: since,
    own_keys: { total_usd: Number(own.reduce((s, r) => s + Number(r.usd), 0).toFixed(5)), by_provider: own.map((r) => ({ provider: r.provider, usd: Number(Number(r.usd).toFixed(5)), calls: Number(r.calls) })) },
    included_scans: { credits_left: (balance as number | null) ?? 0 },
    note: "own_keys is what your API vendors billed you for scans and audits this month, as reported or estimated per call. Included scans are paid in credits; their API cost is ours.",
  });
}
