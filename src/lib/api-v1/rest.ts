import "server-only";
import { RATE_LIMIT_PER_MINUTE, verifyApiKey, withinRateLimit, type ApiCaller } from "@/lib/api-keys";
import { MissingEnvError } from "@/lib/env";
import { publicEnv } from "@/lib/env-public";
import * as core from "./core";

/** REST front of the public API: Bearer key, 60 requests a minute per key, JSON in and out. */
const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-RateLimit-Limit": String(RATE_LIMIT_PER_MINUTE) };
const send = (r: core.ApiResult, extra: Record<string, string> = {}) => new Response(JSON.stringify(r.body), { status: r.status, headers: { ...headers, ...extra } });
const error = (status: number, code: string, message: string, extra: Record<string, string> = {}) => send({ status, body: { error: code, message } }, extra);

export const bearer = (request: Request) => {
  const h = request.headers.get("authorization") ?? "";
  return /^Bearer\s+/i.test(h) ? h.replace(/^Bearer\s+/i, "").trim() : null;
};

/** Shared by REST and MCP: who is calling, and are they inside their rate limit? */
export async function authenticate(request: Request): Promise<{ caller: ApiCaller } | { response: Response }> {
  const caller = await verifyApiKey(bearer(request));
  if (!caller) return { response: error(401, "unauthorized", "Send your API key as: Authorization: Bearer rbai_live_…  Create one in the app under API & MCP.", { "WWW-Authenticate": 'Bearer realm="RankbyAI API"' }) };
  if (!(await withinRateLimit(caller.keyId))) {
    return { response: error(429, "rate_limited", `Limit: ${RATE_LIMIT_PER_MINUTE} requests a minute per key. Try again shortly.`, { "Retry-After": String(60 - new Date().getUTCSeconds()) }) };
  }
  return { caller };
}

export async function handleRest(request: Request, path: string[], defer: core.Defer): Promise<Response> {
  try {
    const auth = await authenticate(request);
    if ("response" in auth) return auth.response;
    const c = auth.caller;
    const method = request.method.toUpperCase();
    const url = new URL(request.url);
    const q = Object.fromEntries(url.searchParams);
    const body = async () => (method === "POST" ? await request.json().catch(() => null) : null);
    if (path.length > 3) return error(404, "not_found", "Unknown endpoint. The reference is at /api/v1/openapi.json.");
    const [a, b, d] = path;
    const route = `${method} /${[a, b ? ":id" : null, d].filter(Boolean).join("/")}`;

    if (route === "GET /businesses") return send(await core.listBusinesses(c, q));
    if (route === "POST /businesses") return send(await core.addBusiness(c, await body()));
    if (route === "GET /businesses/:id") return send(await core.getBusiness(c, b));
    if (route === "POST /scans") return send(await core.createScanOp(c, await body(), defer));
    if (route === "GET /scans/:id" && b === "compare") return send(await core.compareScans(c, q));
    if (route === "GET /scans/:id") return send(await core.getScan(c, b, defer));
    if (route === "GET /scans/:id/points") return send(await core.getScanPoints(c, b));
    if (route === "POST /audits") return send(await core.createAuditOp(c, await body(), defer));
    if (route === "GET /audits/:id") return send(await core.getAudit(c, b));
    if (route === "GET /audits/:id/fix-kit") return send(await core.getFixKit(c, b, q));
    if (route === "POST /prospects") return send(await core.createProspectsOp(c, await body(), defer));
    if (route === "GET /prospects/:id") return send(await core.getProspects(c, b, publicEnv.siteUrl, defer));
    if (route === "GET /usage") return send(await core.getUsage(c));
    return error(404, "not_found", "Unknown endpoint. The reference is at /api/v1/openapi.json.");
  } catch (e) {
    if (e instanceof MissingEnvError) return error(503, "not_configured", "This feature is not configured on this deployment yet.");
    console.error("[api/v1] unexpected error:", e instanceof Error ? e.name : "unknown");
    return error(500, "server_error", "Something went wrong. Nothing was charged.");
  }
}
