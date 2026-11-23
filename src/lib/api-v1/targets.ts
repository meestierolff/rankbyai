import "server-only";
import { z } from "zod";
import type { ApiCaller } from "@/lib/api-keys";
import { listTargetSearches, loadTargets, processTargets, startTargets, TARGETS_NOTE } from "@/lib/targets/run";
import { ownerRead, PAGE_LIMIT_MAX, PAGE_OFFSET_MAX, roundMoney, type ApiResult, type Defer } from "./core";

/**
 * Citation workflow, step 3, for the REST API and MCP: pages that link to competitors from a
 * "best / top / review" list (DataForSEO Backlinks on the user's own login), merged with the pages
 * AI answers cited, with DataForSEO's estimated traffic. Paid: confirm: false returns the estimate
 * (an upper bound) and creates nothing. RankbyAI supplies the pages; it contacts no one.
 */
const ok = (body: Record<string, unknown>, status = 200): ApiResult => ({ status, body: roundMoney(body) });
const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): ApiResult => ({ status, body: roundMoney({ error, message, ...extra }) });
const invalid = (e: z.ZodError) => fail(400, "invalid_request", e.issues.slice(0, 3).map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
const Page = { limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(50), offset: z.coerce.number().int().min(0).max(PAGE_OFFSET_MAX).default(0) };
const flag = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean()).default(false);

export const FindTargets = z.object({
  business_id: z.uuid(),
  pack_id: z.uuid().optional(),
  competitors: z.array(z.object({ name: z.string().trim().max(120).nullish(), domain: z.string().trim().min(3).max(253) })).min(1).max(3).optional(),
  url_contains: z.array(z.string().trim().min(2).max(40)).min(1).max(7).optional(),
  rows_per_site: z.number().int().min(1).max(1000).default(200),
  traffic_pages: z.number().int().min(0).max(1000).default(400),
  scope: z.enum(["local", "online"]).optional(),
  confirm: z.boolean().default(false),
});

/** Shared by the REST API, MCP and the app. */
export async function findTargets(workspaceId: string, plan: ApiCaller["plan"], b: z.infer<typeof FindTargets>) {
  return startTargets({
    workspaceId, plan, businessId: b.business_id, packId: b.pack_id, competitors: b.competitors?.map((c) => ({ name: c.name ?? null, domain: c.domain })),
    tokens: b.url_contains, rows: b.rows_per_site, trafficCap: b.traffic_pages, scope: b.scope, confirm: b.confirm,
  });
}

export async function findTargetsOp(c: ApiCaller, input: unknown, defer: Defer): Promise<ApiResult> {
  const p = FindTargets.safeParse(input);
  if (!p.success) return invalid(p.error);
  const r = await findTargets(c.workspaceId, c.plan, p.data);
  const shown = (x: { competitors?: unknown; clientDomain?: string | null; tokens?: string[] }) => ({ competitors: x.competitors, client_domain: x.clientDomain ?? null, url_contains: x.tokens });
  if (!r.ok) {
    if (r.error === "confirmation_required") {
      return ok({ confirm_required: true, estimate: r.estimate, ...shown(r), message: "This search costs money on your own DataForSEO account (an upper bound: rows are billed as returned). Check the competitors and the words the pages' addresses must contain, then send the same request with \"confirm\": true." });
    }
    return fail(r.status, r.error, r.message, { ...(r.estimate ? { estimate: r.estimate, ...shown(r) } : {}), ...(r.named ? { named_in_answers: r.named } : {}) });
  }
  defer(() => processTargets(r.listId));
  return ok({ list_id: r.listId, status: "queued", estimate: r.estimate, ...shown(r) }, 202);
}

export const GetTargets = z.object({
  ...Page,
  list_id: z.uuid().optional(),
  business_id: z.uuid().optional(),
  action: z.enum(["pitch", "directory_claim", "skip"]).optional(),
  cited_only: flag,
}).refine((x) => !!(x.list_id || x.business_id), { message: "Send list_id, or business_id for its latest search." });

export async function getTargetsOp(c: ApiCaller, q: unknown, defer?: Defer): Promise<ApiResult> {
  const p = GetTargets.safeParse(q);
  if (!p.success) return invalid(p.error);
  const f = p.data;
  const r = await loadTargets(ownerRead(c), c.workspaceId, { listId: f.list_id, businessId: f.business_id, action: f.action, citedOnly: f.cited_only, limit: f.limit, offset: f.offset });
  if (!r.ok) return fail(r.status, r.error, r.message);
  if (defer && r.continueList) defer(() => processTargets(r.list.id));
  return ok({ search: r.list, total: r.total, targets: r.targets, limit: f.limit, offset: f.offset, note: TARGETS_NOTE });
}

export const ListTargetSearches = z.object({ ...Page, business_id: z.uuid().optional() });

export async function listTargetsOp(c: ApiCaller, q: unknown): Promise<ApiResult> {
  const p = ListTargetSearches.safeParse(q);
  if (!p.success) return invalid(p.error);
  return ok({ searches: await listTargetSearches(ownerRead(c), c.workspaceId, { businessId: p.data.business_id, limit: p.data.limit, offset: p.data.offset }), limit: p.data.limit, offset: p.data.offset });
}
