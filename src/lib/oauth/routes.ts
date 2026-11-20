import "server-only";
import { clientIp } from "@/lib/request";
import { dbAdmin } from "@/lib/db/clients";
import { authenticateClient, registerClient } from "./clients";
import { oauthOpen } from "./config";
import { jsonOk, metadataOk, notFound, oauthError, preflight, readParams } from "./http";
import { authorizationServerMetadata, protectedResourceMetadata } from "./metadata";
import { exchangeCode, refresh, revoke } from "./tokens";

/** The OAuth HTTP endpoints. Route files under src/app re-export these. All answer 404 while MCP_OAUTH is off. */

export { preflight };

export function protectedResourceGET(): Response {
  return oauthOpen() ? metadataOk(protectedResourceMetadata()) : notFound();
}

export function authorizationServerGET(): Response {
  return oauthOpen() ? metadataOk(authorizationServerMetadata()) : notFound();
}

export async function registerPOST(request: Request): Promise<Response> {
  if (!oauthOpen()) return notFound();
  const text = await request.text().catch(() => null);
  if (text === null || text.length > 16_384) return oauthError(400, "invalid_client_metadata", "Send at most 16 KB of JSON.");
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return oauthError(400, "invalid_client_metadata", "The body must be JSON.");
  }
  const r = await registerClient(body, clientIp(request.headers));
  return r.ok ? jsonOk(r.body, 201) : oauthError(r.status, r.error, r.description);
}

/** 60 token requests a minute per client is generous for refreshes and stops guessing. */
async function tokenRateOk(clientId: string): Promise<boolean> {
  const { data, error } = await dbAdmin().rpc("rate_limit_hit", { p_key: `oauth-token:${clientId}`, p_window_seconds: 60, p_limit: 60 });
  return !error && data === true;
}

export async function tokenPOST(request: Request): Promise<Response> {
  if (!oauthOpen()) return notFound();
  const p = await readParams(request);
  if (!p) return oauthError(400, "invalid_request", "Send the parameters as application/x-www-form-urlencoded.");
  const auth = await authenticateClient(request, p);
  if (!auth.ok) return oauthError(auth.status, auth.error, auth.description, auth.status === 401 ? { "WWW-Authenticate": 'Basic realm="RankbyAI OAuth"' } : {});
  if (!(await tokenRateOk(auth.client.client_id))) return oauthError(429, "slow_down", "Too many token requests. Try again in a minute.", { "Retry-After": "60" });
  const r = p.grant_type === "authorization_code" ? await exchangeCode(p, auth.client)
    : p.grant_type === "refresh_token" ? await refresh(p, auth.client)
    : { ok: false as const, status: 400, error: "unsupported_grant_type", description: "Use authorization_code or refresh_token." };
  return r.ok ? jsonOk(r.body) : oauthError(r.status, r.error, r.description);
}

export async function revokePOST(request: Request): Promise<Response> {
  if (!oauthOpen()) return notFound();
  const p = await readParams(request);
  if (!p) return oauthError(400, "invalid_request", "Send the parameters as application/x-www-form-urlencoded.");
  const auth = await authenticateClient(request, p);
  if (!auth.ok) return oauthError(auth.status, auth.error, auth.description);
  await revoke(p, auth.client);
  return jsonOk({}); // RFC 7009: 200 whether or not the token existed
}
