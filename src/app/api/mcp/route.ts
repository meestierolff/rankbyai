import { createMcpHandler } from "@modelcontextprotocol/server";
import { after } from "next/server";
import type { ApiCaller } from "@/lib/api-keys";
import { buildMcpServer } from "@/lib/api-v1/mcp";
import { authenticate, rateHeaders } from "@/lib/api-v1/rest";
import { publicEnv } from "@/lib/env-public";

export const maxDuration = 300;

/**
 * MCP server: stateless Streamable HTTP, POST only. Every POST is answered on its own; there are no
 * sessions (no Mcp-Session-Id) and no GET notification stream, so GET and DELETE answer 405.
 * Authentication is the same API key as the REST API, sent as a Bearer token; the SDK handler
 * itself trusts its caller, so the key is checked here first.
 */
const handler = createMcpHandler((ctx) => {
  const caller = ctx.authInfo?.extra?.caller as ApiCaller | undefined;
  if (!caller) throw new Error("unauthenticated");
  return buildMcpServer(caller, (work) => after(work), publicEnv.siteUrl);
});

async function route(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  const rate = rateHeaders(auth.rate);
  try {
    const res = await handler.fetch(request, { authInfo: { token: "redacted", clientId: auth.caller.keyId, scopes: [], extra: { caller: auth.caller } } });
    const headers = new Headers(res.headers);
    for (const [name, value] of Object.entries(rate)) headers.set(name, value);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch (e) {
    console.error("[api/mcp] unexpected error:", e instanceof Error ? e.name : "unknown");
    return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error." }, id: null }, { status: 500, headers: { ...rate, "Cache-Control": "no-store" } });
  }
}

export { route as GET, route as POST, route as DELETE };
