import { createMcpHandler } from "@modelcontextprotocol/server";
import { after } from "next/server";
import type { ApiCaller } from "@/lib/api-keys";
import { buildMcpServer } from "@/lib/api-v1/mcp";
import { authenticate, bearer, rateHeaders, rateLimit, type RateState } from "@/lib/api-v1/rest";
import { publicEnv } from "@/lib/env-public";
import { oauthOpen } from "@/lib/oauth/config";
import { bearerChallenge } from "@/lib/oauth/metadata";
import { PREFIX } from "@/lib/oauth/secrets";
import { verifyAccessToken } from "@/lib/oauth/tokens";

export const maxDuration = 300;

/**
 * MCP server: stateless Streamable HTTP, POST only. Every POST is answered on its own; there are no
 * sessions (no Mcp-Session-Id) and no GET notification stream, so GET and DELETE answer 405.
 *
 * Two ways in, both as `Authorization: Bearer`:
 *   - an API key (rbai_live_…), exactly as before and as on the REST API;
 *   - an OAuth access token (rbai_at_…) issued for THIS resource, when MCP_OAUTH is on. A 401 then
 *     names the protected resource metadata, so MCP clients can start the OAuth flow by themselves.
 * The SDK handler itself trusts its caller, so the credential is checked here first.
 *
 * CORS is open: callers authenticate with a header, never a cookie, and browser-based MCP clients
 * (MCP Inspector, web IDEs) need to read the 401 challenge.
 */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
  "Access-Control-Max-Age": "86400",
};

const handler = createMcpHandler((ctx) => {
  const caller = ctx.authInfo?.extra?.caller as ApiCaller | undefined;
  if (!caller) throw new Error("unauthenticated");
  return buildMcpServer(caller, (work) => after(work), publicEnv.siteUrl);
});

const withHeaders = (res: Response, extra: Record<string, string>) => {
  const headers = new Headers(res.headers);
  for (const [name, value] of Object.entries({ ...CORS, ...extra })) headers.set(name, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

function oauthUnauthorized(tokenSent: boolean): Response {
  return Response.json(
    { error: "unauthorized", message: "Connect through your MCP client's sign-in (OAuth), or send an API key as: Authorization: Bearer rbai_live_…  Create one in the app under API & MCP." },
    { status: 401, headers: { ...CORS, "Cache-Control": "no-store", "WWW-Authenticate": bearerChallenge(tokenSent ? "invalid_token" : undefined) } },
  );
}

async function authenticateMcp(request: Request): Promise<{ caller: ApiCaller; rate: RateState } | { response: Response }> {
  if (!oauthOpen()) return authenticate(request);
  const token = bearer(request);
  if (token?.startsWith(PREFIX.access)) {
    const caller = await verifyAccessToken(token);
    return caller ? rateLimit(caller) : { response: oauthUnauthorized(true) };
  }
  const auth = await authenticate(request);
  // An API key that does not verify, or no credential at all: point the client at OAuth.
  if ("response" in auth && auth.response.status === 401) return { response: oauthUnauthorized(!!token) };
  return auth;
}

async function route(request: Request): Promise<Response> {
  const auth = await authenticateMcp(request);
  if ("response" in auth) return withHeaders(auth.response, {});
  const rate = rateHeaders(auth.rate);
  try {
    const res = await handler.fetch(request, { authInfo: { token: "redacted", clientId: auth.caller.keyId, scopes: [], extra: { caller: auth.caller } } });
    return withHeaders(res, rate);
  } catch (e) {
    console.error("[api/mcp] unexpected error:", e instanceof Error ? e.name : "unknown");
    return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error." }, id: null }, { status: 500, headers: { ...CORS, ...rate, "Cache-Control": "no-store" } });
  }
}

const preflight = () => new Response(null, { status: 204, headers: CORS });

export { route as GET, route as POST, route as DELETE, preflight as OPTIONS };
