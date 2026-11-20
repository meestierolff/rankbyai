import "server-only";
import type { ApiCaller } from "@/lib/api-keys";
import { dbAdmin } from "@/lib/db/clients";
import type { OAuthClient } from "./clients";
import { ACCESS_TOKEN_TTL_S, canonicalResource, MCP_SCOPE, mcpResource, OFFLINE_ACCESS, REFRESH_REUSE_GRACE_S, REFRESH_TOKEN_TTL_S } from "./config";
import { hashSecret, newSecret, pkceMatches, PREFIX } from "./secrets";

/**
 * The token endpoint (authorization_code and refresh_token grants), revocation (RFC 7009) and the
 * check /api/mcp runs on every request.
 *
 * Single use is enforced by the database: redeeming a code or rotating a refresh token is ONE
 * conditional UPDATE ... RETURNING (PostgREST runs a PATCH as one statement), so of two concurrent
 * requests exactly one gets the row.
 */
export type TokenResult = { ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string; description: string };

const invalidGrant = (description: string): TokenResult => ({ ok: false, status: 400, error: "invalid_grant", description });
const nowIso = () => new Date().toISOString();

interface GrantRow { id: string; workspace_id: string; user_id: string; client_id: string; revoked_at: string | null }

async function revokeFamily(familyId: string): Promise<void> {
  await dbAdmin().from("oauth_tokens").update({ revoked_at: nowIso() }).eq("family_id", familyId).is("revoked_at", null);
}

/** A new access token and refresh token in one family. */
async function issue(grantId: string, familyId: string, scope: string, resource: string): Promise<TokenResult> {
  const access = newSecret("access");
  const refresh = newSecret("refresh");
  const now = Date.now();
  const { error } = await dbAdmin().from("oauth_tokens").insert([
    { token_hash: hashSecret(access), kind: "access", grant_id: grantId, family_id: familyId, scope, resource, expires_at: new Date(now + ACCESS_TOKEN_TTL_S * 1000).toISOString() },
    { token_hash: hashSecret(refresh), kind: "refresh", grant_id: grantId, family_id: familyId, scope, resource, expires_at: new Date(now + REFRESH_TOKEN_TTL_S * 1000).toISOString() },
  ]);
  if (error) return { ok: false, status: 503, error: "temporarily_unavailable", description: "Could not issue tokens. Try again." };
  return { ok: true, body: { access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_S, refresh_token: refresh, scope } };
}

/** A requested resource, when sent, must be the one the grant is for. */
const resourceOk = (requested: string | undefined, stored: string) => requested === undefined || canonicalResource(requested) === canonicalResource(stored);

// ───────────────────────── authorization_code ─────────────────────────

export async function exchangeCode(p: Record<string, string>, client: OAuthClient): Promise<TokenResult> {
  if (!p.code || !p.code_verifier || !p.redirect_uri) return { ok: false, status: 400, error: "invalid_request", description: "code, code_verifier and redirect_uri are required." };
  const admin = dbAdmin();
  const hash = hashSecret(p.code);
  // Consume first, check second: a code gets exactly one attempt, right or wrong.
  const { data: rows, error } = await admin.from("oauth_codes")
    .update({ used_at: nowIso() }).eq("code_hash", hash).is("used_at", null).gt("expires_at", nowIso())
    .select("grant_id, family_id, redirect_uri, code_challenge, scope, resource");
  if (error) return { ok: false, status: 503, error: "temporarily_unavailable", description: "Try again." };
  const code = (rows ?? [])[0] as { grant_id: string; family_id: string; redirect_uri: string; code_challenge: string; scope: string; resource: string } | undefined;
  if (!code) {
    // A code used twice: deny, and revoke what the first use received (OAuth 2.1 section 4.1.3).
    const { data: used } = await admin.from("oauth_codes").select("family_id, used_at").eq("code_hash", hash).maybeSingle<{ family_id: string; used_at: string | null }>();
    if (used?.used_at) await revokeFamily(used.family_id);
    return invalidGrant("The authorization code is invalid, expired or already used.");
  }
  const { data: grant } = await admin.from("oauth_grants").select("id, workspace_id, user_id, client_id, revoked_at").eq("id", code.grant_id).maybeSingle<GrantRow>();
  if (!grant || grant.revoked_at || grant.client_id !== client.client_id) return invalidGrant("The authorization code was not issued to this client.");
  if (p.redirect_uri !== code.redirect_uri) return invalidGrant("redirect_uri does not match the authorization request.");
  if (!pkceMatches(p.code_verifier, code.code_challenge)) return invalidGrant("code_verifier does not match the code_challenge.");
  if (!resourceOk(p.resource, code.resource)) return { ok: false, status: 400, error: "invalid_target", description: `The only resource here is ${mcpResource()}.` };
  return issue(grant.id, code.family_id, code.scope, code.resource);
}

// ───────────────────────── refresh_token ─────────────────────────

interface TokenRow { token_hash: string; kind: "access" | "refresh"; grant_id: string; family_id: string; scope: string; resource: string; expires_at: string; rotated_at: string | null; revoked_at: string | null }
const TOKEN_COLUMNS = "token_hash, kind, grant_id, family_id, scope, resource, expires_at, rotated_at, revoked_at";

export async function refresh(p: Record<string, string>, client: OAuthClient): Promise<TokenResult> {
  if (!p.refresh_token) return { ok: false, status: 400, error: "invalid_request", description: "refresh_token is required." };
  if (p.scope && p.scope.split(" ").some((s) => s && s !== MCP_SCOPE && s !== OFFLINE_ACCESS)) return { ok: false, status: 400, error: "invalid_scope", description: `The only scope is ${MCP_SCOPE}.` };
  const admin = dbAdmin();
  const hash = hashSecret(p.refresh_token);
  const { data: token } = await admin.from("oauth_tokens").select(TOKEN_COLUMNS).eq("token_hash", hash).eq("kind", "refresh").maybeSingle<TokenRow>();
  const dead = invalidGrant("The refresh token is invalid, expired or revoked.");
  if (!token || token.revoked_at || new Date(token.expires_at).getTime() <= Date.now()) return dead;
  const { data: grant } = await admin.from("oauth_grants").select("id, workspace_id, user_id, client_id, revoked_at").eq("id", token.grant_id).maybeSingle<GrantRow>();
  if (!grant || grant.revoked_at || grant.client_id !== client.client_id) return dead;
  if (!resourceOk(p.resource, token.resource)) return { ok: false, status: 400, error: "invalid_target", description: `The only resource here is ${mcpResource()}.` };

  const { data: rotated } = await admin.from("oauth_tokens").update({ rotated_at: nowIso() }).eq("token_hash", hash).is("rotated_at", null).is("revoked_at", null).select("token_hash");
  if (!(rotated ?? []).length) {
    // Already exchanged. Within the short window this is a client refreshing twice at once; after it,
    // somebody is replaying a stolen token: end the whole family (OAuth 2.1 section 4.3.1).
    const { data: again } = await admin.from("oauth_tokens").select("rotated_at, revoked_at").eq("token_hash", hash).maybeSingle<{ rotated_at: string | null; revoked_at: string | null }>();
    const age = again?.rotated_at ? Date.now() - new Date(again.rotated_at).getTime() : Number.POSITIVE_INFINITY;
    if (again?.revoked_at || age > REFRESH_REUSE_GRACE_S * 1000) {
      await revokeFamily(token.family_id);
      return dead;
    }
  }
  return issue(grant.id, token.family_id, token.scope, token.resource);
}

// ───────────────────────── revocation (RFC 7009) ─────────────────────────

/** Always succeeds from the client's point of view; only the client a token was issued to can revoke it. */
export async function revoke(p: Record<string, string>, client: OAuthClient): Promise<void> {
  const value = p.token;
  if (!value || (!value.startsWith(PREFIX.access) && !value.startsWith(PREFIX.refresh))) return;
  const admin = dbAdmin();
  const { data: token } = await admin.from("oauth_tokens").select(TOKEN_COLUMNS).eq("token_hash", hashSecret(value)).maybeSingle<TokenRow>();
  if (!token) return;
  const { data: grant } = await admin.from("oauth_grants").select("client_id").eq("id", token.grant_id).maybeSingle<{ client_id: string }>();
  if (grant?.client_id !== client.client_id) return;
  // A refresh token takes its whole family with it (the access tokens it produced); an access token goes alone.
  if (token.kind === "refresh") await revokeFamily(token.family_id);
  else await admin.from("oauth_tokens").update({ revoked_at: nowIso() }).eq("token_hash", token.token_hash).is("revoked_at", null);
}

// ───────────────────────── verification at /api/mcp ─────────────────────────

interface AccessRow extends TokenRow {
  oauth_grants: (GrantRow & { last_used_at: string | null; workspaces: { owner_id: string; plan: "locked" | "lifetime" } | null }) | null;
}

/**
 * Resolves an access token to the caller it acts for, or null when it is not a live access token for
 * THIS resource. The grant must still be active and its user must still own the workspace.
 */
export async function verifyAccessToken(value: string | null): Promise<ApiCaller | null> {
  if (!value || !value.startsWith(PREFIX.access) || value.length > 200) return null;
  const admin = dbAdmin();
  const { data } = await admin.from("oauth_tokens")
    .select(`${TOKEN_COLUMNS}, oauth_grants!inner(id, workspace_id, user_id, client_id, revoked_at, last_used_at, workspaces(owner_id, plan))`)
    .eq("token_hash", hashSecret(value)).maybeSingle<AccessRow>();
  if (!data || data.kind !== "access" || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return null;
  if (canonicalResource(data.resource) !== canonicalResource(mcpResource())) return null;
  const grant = data.oauth_grants;
  const ws = grant?.workspaces;
  if (!grant || grant.revoked_at || !ws || ws.owner_id !== grant.user_id) return null;
  if (!grant.last_used_at || Date.now() - new Date(grant.last_used_at).getTime() > 60_000) {
    await admin.from("oauth_grants").update({ last_used_at: nowIso() }).eq("id", grant.id);
  }
  return { keyId: `oauth:${grant.id}`, workspaceId: grant.workspace_id, ownerId: ws.owner_id, plan: ws.plan };
}

/** Revoke a grant from the app ("Connected apps"). `workspaceId` is the signed-in owner's workspace. */
export async function revokeGrant(workspaceId: string, grantId: string): Promise<boolean> {
  const admin = dbAdmin();
  const { data } = await admin.from("oauth_grants").update({ revoked_at: nowIso() }).eq("id", grantId).eq("workspace_id", workspaceId).is("revoked_at", null).select("id");
  if (!(data ?? []).length) return false;
  await admin.from("oauth_tokens").update({ revoked_at: nowIso() }).eq("grant_id", grantId).is("revoked_at", null);
  return true;
}

