import "server-only";
import { randomBytes } from "node:crypto";
import { hashApiKey } from "@/lib/crypto";
import { dbAdmin } from "@/lib/db/clients";
import { FAIR_USE } from "@/lib/pricing-constants";

/**
 * API keys for the REST API and the MCP server (brief 7.8).
 * Format: rbai_live_ + 32 random characters. The key is shown once, at creation. We store
 * sha256(key + pepper) and an 8-character prefix so the owner can tell keys apart.
 */
export const API_KEY_PREFIX = "rbai_live_";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const KEY_PATTERN = /^rbai_live_[A-Za-z0-9]{32}$/;

export function generateApiKey(): string {
  // Rejection sampling: every character is uniform over the 62-letter alphabet.
  let out = "";
  while (out.length < 32) {
    for (const b of randomBytes(48)) {
      if (b < 248 && out.length < 32) out += ALPHABET[b % 62];
    }
  }
  return API_KEY_PREFIX + out;
}

export interface ApiKeyMeta { id: string; name: string; prefix: string; last_used_at: string | null; revoked_at: string | null; created_at: string }

export async function createApiKey(workspaceId: string, name: string): Promise<{ ok: true; key: string; meta: ApiKeyMeta } | { ok: false; status: number; error: string; message: string }> {
  const admin = dbAdmin();
  const clean = name.trim().slice(0, 80);
  if (!clean) return { ok: false, status: 400, error: "invalid_name", message: "Give the key a name, for example “Claude Desktop”." };
  const { count } = await admin.from("api_keys").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("revoked_at", null);
  if ((count ?? 0) >= FAIR_USE.apiKeys) return { ok: false, status: 409, error: "limit_reached", message: `A workspace can have ${FAIR_USE.apiKeys} active API keys. Revoke one first.` };
  const key = generateApiKey();
  const { data, error } = await admin
    .from("api_keys")
    .insert({ workspace_id: workspaceId, name: clean, prefix: key.slice(0, API_KEY_PREFIX.length + 8), key_hash: hashApiKey(key) })
    .select("id, name, prefix, last_used_at, revoked_at, created_at").single<ApiKeyMeta>();
  if (error || !data) return { ok: false, status: 500, error: "server_error", message: "The key could not be created." };
  return { ok: true, key, meta: data };
}

export async function revokeApiKey(workspaceId: string, keyId: string): Promise<boolean> {
  const { data } = await dbAdmin().from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", keyId).eq("workspace_id", workspaceId).is("revoked_at", null).select("id");
  return (data ?? []).length > 0;
}

export interface ApiCaller {
  keyId: string;
  workspaceId: string;
  /** Requests act as the workspace owner, so row-level security applies to everything they read. */
  ownerId: string;
  plan: "locked" | "lifetime";
}

/** Resolve a presented key. Unknown, malformed and revoked keys all give null. */
export async function verifyApiKey(presented: string | null | undefined): Promise<ApiCaller | null> {
  if (!presented || !KEY_PATTERN.test(presented)) return null;
  const admin = dbAdmin();
  const { data: row } = await admin.from("api_keys").select("id, workspace_id, revoked_at, last_used_at").eq("key_hash", hashApiKey(presented)).maybeSingle();
  if (!row || row.revoked_at) return null;
  const { data: ws } = await admin.from("workspaces").select("owner_id, plan").eq("id", row.workspace_id).maybeSingle();
  if (!ws) return null;
  // "Last used" is for the owner's overview; once a minute is precise enough and saves a write per request.
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60_000) {
    await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { keyId: row.id, workspaceId: row.workspace_id, ownerId: ws.owner_id, plan: ws.plan };
}

export const RATE_LIMIT_PER_MINUTE = 60;

/** 60 requests a minute per key. Fails closed: when the counter is unavailable, the request is refused. */
export async function withinRateLimit(keyId: string): Promise<boolean> {
  const { data, error } = await dbAdmin().rpc("rate_limit_hit", { p_key: `api:${keyId}`, p_window_seconds: 60, p_limit: RATE_LIMIT_PER_MINUTE });
  return !error && data === true;
}
