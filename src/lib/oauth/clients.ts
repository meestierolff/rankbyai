import "server-only";
import { hashIdentifier } from "@/lib/crypto";
import { dbAdmin } from "@/lib/db/clients";
import { fetchClientMetadataDocument } from "./cimd-fetch";
import { CIMD_CACHE_S, MCP_SCOPE } from "./config";
import { basicCredentials } from "./http";
import { hashSecret, newSecret, safeEqual } from "./secrets";

/**
 * OAuth clients. MCP clients onboard themselves, so nothing a client says about itself (name, URIs)
 * is proof of identity: the consent page shows the redirect hosts, and every redirect URI is
 * matched exactly at authorization time.
 */
export type AuthMethod = "none" | "client_secret_basic" | "client_secret_post";
export interface OAuthClient {
  client_id: string;
  kind: "dcr" | "cimd";
  client_name: string;
  client_uri: string | null;
  logo_uri: string | null;
  redirect_uris: string[];
  token_endpoint_auth_method: AuthMethod;
  client_secret_hash: string | null;
  application_type: "web" | "native";
  fetched_at: string | null;
}

const COLUMNS = "client_id, kind, client_name, client_uri, logo_uri, redirect_uris, token_endpoint_auth_method, client_secret_hash, application_type, fetched_at";
const MAX_URI = 500;
/** Schemes a native app must never use as a redirect (script, local files, other transports). */
const FORBIDDEN_SCHEMES = new Set(["javascript", "data", "file", "vbscript", "about", "blob", "filesystem", "ftp", "ws", "wss", "mailto", "tel", "view-source", "chrome", "intent"]);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type RedirectKind = "https" | "loopback" | "custom";

/** https anywhere, http on a loopback host, or a native app's private-use scheme. Null when not allowed. */
export function redirectKind(raw: string): RedirectKind | null {
  if (typeof raw !== "string" || raw.length > MAX_URI) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.hash || raw.includes("#") || u.username || u.password) return null;
  if (u.protocol === "https:") return u.hostname ? "https" : null;
  if (u.protocol === "http:") return LOOPBACK.has(u.hostname) ? "loopback" : null;
  const scheme = u.protocol.slice(0, -1).toLowerCase();
  return /^[a-z][a-z0-9+.-]*$/.test(scheme) && !FORBIDDEN_SCHEMES.has(scheme) ? "custom" : null;
}

/**
 * Exact match, except that a loopback http redirect URI matches on any port (RFC 8252 section 7.3):
 * native apps pick a free port at run time.
 */
export function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  if (redirectKind(requested) !== "loopback") return false;
  const want = new URL(requested);
  return registered.some((r) => {
    if (redirectKind(r) !== "loopback") return false;
    const have = new URL(r);
    return have.hostname === want.hostname && have.pathname === want.pathname && have.search === want.search;
  });
}

const httpsUri = (v: unknown) => (typeof v === "string" && v.length <= MAX_URI && redirectKind(v) === "https" ? v : null);

// ───────────────────────── dynamic client registration (RFC 7591) ─────────────────────────

export type RegisterResult = { ok: true; status: 201; body: Record<string, unknown> } | { ok: false; status: number; error: string; description: string };

const bad = (error: string, description: string): RegisterResult => ({ ok: false, status: 400, error, description });

export async function registerClient(input: unknown, ip: string): Promise<RegisterResult> {
  // Open registration is an invitation to fill the table: a few registrations an hour per address.
  const { data: allowed, error: limitError } = await dbAdmin().rpc("rate_limit_hit", { p_key: `oauth-register:${hashIdentifier(ip)}`, p_window_seconds: 3600, p_limit: 30 });
  if (limitError || allowed !== true) return { ok: false, status: 429, error: "too_many_requests", description: "Too many registrations from this address. Try again later." };

  if (!input || typeof input !== "object" || Array.isArray(input)) return bad("invalid_client_metadata", "Send the client metadata as a JSON object.");
  const m = input as Record<string, unknown>;

  const uris = m.redirect_uris;
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 10) return bad("invalid_redirect_uri", "redirect_uris must list 1 to 10 URIs.");
  const kinds = uris.map((u) => redirectKind(u as string));
  if (kinds.some((k) => k === null)) return bad("invalid_redirect_uri", "Each redirect URI must be https, http on localhost, or a native app scheme, without a fragment.");

  const method = (m.token_endpoint_auth_method ?? "client_secret_basic") as AuthMethod; // RFC 7591 default
  if (!["none", "client_secret_basic", "client_secret_post"].includes(method)) return bad("invalid_client_metadata", "token_endpoint_auth_method must be none, client_secret_basic or client_secret_post.");

  const grants = (m.grant_types ?? ["authorization_code"]) as unknown;
  if (!Array.isArray(grants) || !grants.includes("authorization_code") || grants.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    return bad("invalid_client_metadata", "grant_types must include authorization_code and may include refresh_token.");
  }
  const responses = (m.response_types ?? ["code"]) as unknown;
  if (!Array.isArray(responses) || responses.length !== 1 || responses[0] !== "code") return bad("invalid_client_metadata", "response_types must be [\"code\"].");

  const appType = m.application_type ?? (kinds.every((k) => k === "https") ? "web" : "native");
  if (appType !== "web" && appType !== "native") return bad("invalid_client_metadata", "application_type must be web or native.");
  if (appType === "web" && kinds.includes("custom")) return bad("invalid_redirect_uri", "A web client cannot use a custom-scheme redirect URI.");

  const name = typeof m.client_name === "string" ? m.client_name.trim().slice(0, 100) : "";
  if (m.client_uri !== undefined && !httpsUri(m.client_uri)) return bad("invalid_client_metadata", "client_uri must be an https URL.");
  if (m.logo_uri !== undefined && !httpsUri(m.logo_uri)) return bad("invalid_client_metadata", "logo_uri must be an https URL.");

  const clientId = newSecret("clientId");
  const secret = method === "none" ? null : newSecret("clientSecret");
  const row = {
    client_id: clientId, kind: "dcr" as const, client_name: name || "Unnamed MCP client",
    client_uri: httpsUri(m.client_uri), logo_uri: httpsUri(m.logo_uri), redirect_uris: uris as string[],
    token_endpoint_auth_method: method, client_secret_hash: secret ? hashSecret(secret) : null, application_type: appType,
  };
  const { error } = await dbAdmin().from("oauth_clients").insert(row);
  if (error) return { ok: false, status: 500, error: "server_error", description: "The client could not be registered. Try again." };

  return {
    ok: true,
    status: 201,
    body: {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_name: row.client_name,
      redirect_uris: row.redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
      application_type: appType,
      scope: MCP_SCOPE,
      ...(row.client_uri ? { client_uri: row.client_uri } : {}),
      ...(row.logo_uri ? { logo_uri: row.logo_uri } : {}),
    },
  };
}

// ───────────────────────── lookup, including Client ID Metadata Documents ─────────────────────────

/** A CIMD client_id: an https URL with a path, on the default port, without fragment or credentials. */
export function isMetadataDocumentUrl(clientId: string): boolean {
  if (clientId.length > MAX_URI || !clientId.startsWith("https://")) return false;
  try {
    const u = new URL(clientId);
    return u.protocol === "https:" && !u.port && !u.hash && !u.username && !u.password && u.pathname.length > 1;
  } catch {
    return false;
  }
}

/** Validates a fetched metadata document. Only public clients (PKCE, no client authentication) are supported. */
function clientFromDocument(clientId: string, doc: unknown): Omit<OAuthClient, "fetched_at"> | null {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const d = doc as Record<string, unknown>;
  if (d.client_id !== clientId) return null;
  const name = typeof d.client_name === "string" ? d.client_name.trim().slice(0, 100) : "";
  if (!name) return null;
  const uris = d.redirect_uris;
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 10 || uris.some((u) => redirectKind(u as string) === null)) return null;
  const supported = Array.isArray(d.token_endpoint_auth_methods_supported) ? d.token_endpoint_auth_methods_supported : null;
  const single = d.token_endpoint_auth_method;
  const publicOk = supported ? supported.includes("none") : single === undefined || single === "none";
  if (!publicOk) return null;
  const kinds = uris.map((u) => redirectKind(u as string));
  return {
    client_id: clientId, kind: "cimd", client_name: name, client_uri: httpsUri(d.client_uri), logo_uri: httpsUri(d.logo_uri),
    redirect_uris: uris as string[], token_endpoint_auth_method: "none", client_secret_hash: null,
    application_type: kinds.every((k) => k === "https") ? "web" : "native",
  };
}

export async function findClient(clientId: string | null | undefined): Promise<OAuthClient | null> {
  if (!clientId || clientId.length > MAX_URI) return null;
  const admin = dbAdmin();
  const { data } = await admin.from("oauth_clients").select(COLUMNS).eq("client_id", clientId).maybeSingle<OAuthClient>();
  if (!isMetadataDocumentUrl(clientId)) return data?.kind === "dcr" ? data : null;

  // CIMD: use the cached copy while it is fresh, otherwise read the document again.
  if (data && data.fetched_at && Date.now() - new Date(data.fetched_at).getTime() < CIMD_CACHE_S * 1000) return data;
  const parsed = clientFromDocument(clientId, await fetchClientMetadataDocument(clientId));
  if (!parsed) return null;
  const row = { ...parsed, fetched_at: new Date().toISOString() };
  const { error } = await admin.from("oauth_clients").upsert(row, { onConflict: "client_id" });
  return error ? null : row;
}

// ───────────────────────── client authentication at the token and revocation endpoints ─────────────────────────

export type ClientAuth = { ok: true; client: OAuthClient } | { ok: false; status: 400 | 401; error: "invalid_client" | "invalid_request"; description: string };

export async function authenticateClient(request: Request, params: Record<string, string>): Promise<ClientAuth> {
  const basic = basicCredentials(request);
  if (basic && params.client_secret) return { ok: false, status: 400, error: "invalid_request", description: "Use one client authentication method, not two." };
  if (basic && params.client_id && params.client_id !== basic.id) return { ok: false, status: 400, error: "invalid_request", description: "client_id does not match the Authorization header." };
  const clientId = basic?.id ?? params.client_id;
  const fail: ClientAuth = { ok: false, status: 401, error: "invalid_client", description: "Client authentication failed." };
  const client = await findClient(clientId);
  if (!client) return fail;

  switch (client.token_endpoint_auth_method) {
    case "none":
      return basic || params.client_secret ? fail : { ok: true, client };
    case "client_secret_basic":
      return basic && client.client_secret_hash && safeEqual(hashSecret(basic.secret), client.client_secret_hash) ? { ok: true, client } : fail;
    case "client_secret_post":
      return !basic && params.client_secret && client.client_secret_hash && safeEqual(hashSecret(params.client_secret), client.client_secret_hash) ? { ok: true, client } : fail;
  }
}
