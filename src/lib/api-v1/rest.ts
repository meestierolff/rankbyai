import "server-only";
import { RATE_LIMIT_PER_MINUTE, verifyApiKey, withinRateLimit, type ApiCaller } from "@/lib/api-keys";
import { dbAdmin } from "@/lib/db/clients";
import { MissingEnvError } from "@/lib/env";
import * as core from "./core";
import { reportOriginForAuthorisedWorkspace } from "@/lib/domains-origin";

/**
 * REST front of the public API: Bearer key, 60 requests a minute per key, JSON in and out.
 * Meant for servers and agents: no CORS headers are sent, so browsers on other origins cannot call it.
 */
const baseHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-RateLimit-Limit": String(RATE_LIMIT_PER_MINUTE) };
const send = (r: core.ApiResult, extra: Record<string, string> = {}, withBody = true) => new Response(withBody ? JSON.stringify(r.body) : null, { status: r.status, headers: { ...baseHeaders, ...extra } });
const error = (status: number, code: string, message: string, extra: Record<string, string> = {}, withBody = true) => send({ status, body: { error: code, message } }, extra, withBody);
const UNKNOWN_ENDPOINT = "Unknown endpoint. The reference is at /api/v1/openapi.json.";

export const bearer = (request: Request) => {
  const h = request.headers.get("authorization") ?? "";
  return /^Bearer\s+/i.test(h) ? h.replace(/^Bearer\s+/i, "").trim() : null;
};

// ───────────────────────── rate limit ─────────────────────────

/** Where a key stands in its current one-minute window. `reset` is a Unix time in seconds. */
export interface RateState { limit: number; remaining: number; reset: number }

export const rateHeaders = (r: RateState): Record<string, string> => ({
  "X-RateLimit-Limit": String(r.limit),
  "X-RateLimit-Remaining": String(r.remaining),
  "X-RateLimit-Reset": String(r.reset),
});

/**
 * Read the counter that `withinRateLimit` has just incremented. The newest row of a key is its
 * current window, on the database clock. If the read fails the request still goes through: the
 * headers then report the next minute boundary and no requests left, the cautious answer.
 */
async function rateState(keyId: string): Promise<RateState> {
  const now = Math.floor(Date.now() / 1000);
  const fallback: RateState = { limit: RATE_LIMIT_PER_MINUTE, remaining: 0, reset: (Math.floor(now / 60) + 1) * 60 };
  try {
    const { data, error: readError } = await dbAdmin().from("rate_limits").select("count, window_start").eq("key", `api:${keyId}`).order("window_start", { ascending: false }).limit(1).maybeSingle();
    const start = data ? Math.floor(new Date(data.window_start as string).getTime() / 1000) : Number.NaN;
    if (readError || !data || !Number.isFinite(start)) return fallback;
    return { limit: RATE_LIMIT_PER_MINUTE, remaining: Math.max(0, RATE_LIMIT_PER_MINUTE - Number(data.count)), reset: start + 60 };
  } catch {
    return fallback;
  }
}

/** Shared by REST and MCP: who is calling, and are they inside their rate limit? */
export async function authenticate(request: Request): Promise<{ caller: ApiCaller; rate: RateState } | { response: Response }> {
  const caller = await verifyApiKey(bearer(request));
  if (!caller) return { response: error(401, "unauthorized", "Send your API key as: Authorization: Bearer rbai_live_…  Create one in the app under API & MCP.", { "WWW-Authenticate": 'Bearer realm="RankbyAI API"' }) };
  const allowed = await withinRateLimit(caller.keyId);
  const rate = await rateState(caller.keyId);
  if (!allowed) {
    const wait = Math.min(60, Math.max(1, rate.reset - Math.floor(Date.now() / 1000)));
    return { response: error(429, "rate_limited", `Limit: ${RATE_LIMIT_PER_MINUTE} requests a minute per key. Try again shortly.`, { ...rateHeaders({ ...rate, remaining: 0 }), "Retry-After": String(wait) }) };
  }
  return { caller, rate };
}

// ───────────────────────── routes ─────────────────────────

interface Call {
  c: ApiCaller;
  /** The `:id` segment of the path, when the route has one. */
  id: string;
  q: Record<string, string>;
  body: () => Promise<unknown>;
  defer: core.Defer;
  /** HEAD request: answer as GET would, but start no work and build nothing. */
  head: boolean;
}
type Handler = (x: Call) => Promise<core.ApiResult>;
type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Route = { path: string } & Partial<Record<Method, Handler>>;

/** Every endpoint. A literal segment wins over `:id`, so /scans/compare is listed before /scans/:id. */
const ROUTES: Route[] = [
  { path: "businesses", GET: (x) => core.listBusinesses(x.c, x.q), POST: async (x) => core.addBusiness(x.c, await x.body()) },
  { path: "businesses/:id", GET: (x) => core.getBusiness(x.c, x.id), PATCH: async (x) => core.updateBusiness(x.c, x.id, await x.body()), DELETE: (x) => core.deleteBusiness(x.c, x.id) },
  { path: "scans", GET: (x) => core.listScans(x.c, x.q), POST: async (x) => core.createScanOp(x.c, await x.body(), x.defer) },
  { path: "scans/compare", GET: (x) => core.compareScans(x.c, x.q) },
  { path: "scans/:id", GET: (x) => core.getScan(x.c, x.id, x.head ? undefined : x.defer) },
  { path: "scans/:id/points", GET: (x) => core.getScanPoints(x.c, x.id) },
  { path: "audits", GET: (x) => core.listAudits(x.c, x.q), POST: async (x) => core.createAuditOp(x.c, await x.body(), x.defer) },
  { path: "audits/:id", GET: (x) => core.getAudit(x.c, x.id) },
  { path: "audits/:id/fix-kit", GET: (x) => core.getFixKit(x.c, x.id, x.q, { readOnly: x.head }) },
  { path: "prospects", GET: (x) => core.listProspectBatches(x.c, x.q), POST: async (x) => core.createProspectsOp(x.c, await x.body(), x.defer) },
  { path: "prospects/:id", GET: async (x) => core.getProspects(x.c, x.id, await reportOriginForAuthorisedWorkspace(x.c.workspaceId), x.head ? undefined : x.defer) },
  { path: "branding", GET: (x) => core.getBranding(x.c), PATCH: async (x) => core.updateBranding(x.c, await x.body()) },
  { path: "usage", GET: (x) => core.getUsage(x.c) },
];

function matchRoute(path: string[]): { route: Route; id: string } | null {
  for (const route of ROUTES) {
    const parts = route.path.split("/");
    if (parts.length !== path.length) continue;
    if (parts.every((part, i) => (part === ":id" ? path[i].length > 0 : part === path[i]))) return { route, id: path[parts.indexOf(":id")] ?? "" };
  }
  return null;
}

/** The methods a path answers. HEAD is served wherever GET is. */
const allowOf = (route: Route) => [...(["GET", "POST", "PATCH", "DELETE"] as const).filter((m) => route[m]), ...(route.GET ? ["HEAD"] : []), "OPTIONS"].sort().join(", ");

/** OPTIONS: the methods of this path, and nothing else. No CORS headers: the API is not for browsers. */
export function handleOptions(path: string[]): Response {
  const m = matchRoute(path);
  if (!m) return error(404, "not_found", UNKNOWN_ENDPOINT);
  return new Response(null, { status: 204, headers: { Allow: allowOf(m.route), "Cache-Control": "no-store" } });
}

export async function handleRest(request: Request, path: string[], defer: core.Defer): Promise<Response> {
  const method = request.method.toUpperCase();
  const head = method === "HEAD";
  let rate: Record<string, string> = {};
  try {
    const auth = await authenticate(request);
    if ("response" in auth) return head ? new Response(null, { status: auth.response.status, headers: auth.response.headers }) : auth.response;
    rate = rateHeaders(auth.rate);
    const m = matchRoute(path);
    if (!m) return error(404, "not_found", UNKNOWN_ENDPOINT, rate, !head);
    const handler = m.route[(head ? "GET" : method) as Method];
    if (!handler) return error(405, "method_not_allowed", `${method} is not available on this endpoint. Allowed: ${allowOf(m.route)}.`, { ...rate, Allow: allowOf(m.route) }, !head);
    const result = await handler({
      c: auth.caller, id: m.id, q: Object.fromEntries(new URL(request.url).searchParams), defer, head,
      body: async () => (method === "POST" || method === "PATCH" ? await request.json().catch(() => null) : null),
    });
    return send(result, rate, !head);
  } catch (e) {
    if (e instanceof MissingEnvError) return error(503, "not_configured", "This feature is not configured on this deployment yet.", rate, !head);
    console.error("[api/v1] unexpected error:", e instanceof Error ? e.name : "unknown");
    return error(500, "server_error", "Something went wrong. Nothing was charged.", rate, !head);
  }
}
