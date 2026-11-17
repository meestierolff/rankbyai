import { createMcpHandler } from "@modelcontextprotocol/server";
import { after } from "next/server";
import type { ApiCaller } from "@/lib/api-keys";
import { buildMcpServer } from "@/lib/api-v1/mcp";
import { authenticate } from "@/lib/api-v1/rest";
import { publicEnv } from "@/lib/env-public";

export const maxDuration = 300;

/**
 * MCP server (Streamable HTTP, stateless). Authentication is the same API key as the REST API,
 * sent as a Bearer token; the SDK handler itself trusts its caller, so the key is checked here first.
 */
const handler = createMcpHandler((ctx) => {
  const caller = ctx.authInfo?.extra?.caller as ApiCaller | undefined;
  if (!caller) throw new Error("unauthenticated");
  return buildMcpServer(caller, (work) => after(work), publicEnv.siteUrl);
});

async function route(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  return handler.fetch(request, { authInfo: { token: "redacted", clientId: auth.caller.keyId, scopes: [], extra: { caller: auth.caller } } });
}

export { route as GET, route as POST, route as DELETE };
