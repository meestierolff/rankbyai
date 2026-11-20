import "server-only";
import type { SessionContext } from "@/lib/auth";
import { dbAdmin } from "@/lib/db/clients";
import { findClient, redirectKind, redirectMatches, type OAuthClient } from "./clients";
import { canonicalResource, CODE_TTL_S, issuer, MCP_SCOPE, mcpResource } from "./config";
import { hashSecret, newSecret, readTicket, signTicket } from "./secrets";

/**
 * The authorization endpoint (GET /oauth/authorize, a page) and the consent decision.
 *
 * Errors about the client or its redirect URI are shown on our page and never sent anywhere: the
 * redirect URI is not trusted until it matches a registered one (RFC 6749 4.1.2.1). Every other
 * error goes back to the client's redirect URI with `iss` (RFC 9207), as does the code.
 */
export interface ConsentView {
  clientName: string;
  /** Where the client says it lives: its client_uri or the host of its metadata document. */
  clientHost: string | null;
  /** Self-onboarded clients name themselves; the page says so. */
  selfAsserted: boolean;
  /** Hosts (or app schemes) the authorization code is sent to. */
  redirectTargets: string[];
  /** Every redirect URI is on this computer (loopback) or an app scheme: a local app. */
  localOnly: boolean;
  workspaceName: string;
  email: string;
}

export type Prepared =
  | { kind: "error"; title: string; message: string }
  | { kind: "redirect"; url: string }
  | { kind: "login"; next: string }
  | { kind: "consent"; ticket: string; view: ConsentView };

interface Ticket {
  c: string; // client_id
  r: string; // redirect_uri
  s: string | null; // state
  cc: string; // code_challenge (S256)
  sc: string; // scope
  rs: string; // resource
  u: string; // user id
  w: string; // workspace id
  exp: number;
}

/** The client's redirect URI with parameters added, always including the issuer. */
export function redirectWith(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  url.searchParams.set("iss", issuer());
  return url.toString();
}

const target = (uri: string) => {
  const u = new URL(uri);
  return redirectKind(uri) === "custom" ? `${u.protocol}//` : u.host;
};

function view(client: OAuthClient, ctx: SessionContext): ConsentView {
  const hostOf = (uri: string | null) => {
    try {
      return uri ? new URL(uri).host : null;
    } catch {
      return null;
    }
  };
  const kinds = client.redirect_uris.map(redirectKind);
  return {
    clientName: client.client_name,
    clientHost: client.kind === "cimd" ? hostOf(client.client_id) : hostOf(client.client_uri),
    selfAsserted: true,
    redirectTargets: [...new Set(client.redirect_uris.map(target))],
    localOnly: kinds.every((k) => k !== "https"),
    workspaceName: ctx.workspace.name,
    email: ctx.user.email,
  };
}

const ONLY_OWNER = { kind: "error" as const, title: "Only the workspace owner can connect apps", message: "Ask the owner of this workspace to connect the app, or sign in with the owner's account." };

/** Validates an authorization request. `session` is the signed-in user, or null. */
export async function prepareAuthorization(q: URLSearchParams, session: SessionContext | null): Promise<Prepared> {
  const one = (k: string) => {
    const all = q.getAll(k);
    return all.length === 1 ? all[0] : all.length === 0 ? null : undefined; // undefined: repeated (not allowed)
  };
  const clientId = one("client_id");
  const client = clientId ? await findClient(clientId) : null;
  if (!client) {
    return { kind: "error", title: "Unknown app", message: "This app is not registered with RankbyAI, or its client information could not be read. Start the connection again from the app." };
  }
  let redirectUri = one("redirect_uri");
  if (redirectUri === null && client.redirect_uris.length === 1) redirectUri = client.redirect_uris[0];
  if (!redirectUri || !redirectMatches(client.redirect_uris, redirectUri)) {
    return { kind: "error", title: "Redirect address not registered", message: "The app asked to send you back to an address it did not register. Nothing was shared." };
  }

  const state = one("state");
  const fail = (error: string, description: string): Prepared => ({ kind: "redirect", url: redirectWith(redirectUri!, { error, error_description: description, state: state ?? undefined }) });
  if (state === undefined || (state && state.length > 1000)) return fail("invalid_request", "state is repeated or too long.");
  if (one("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  const challenge = one("code_challenge");
  if (!challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || one("code_challenge_method") !== "S256") {
    return fail("invalid_request", "PKCE is required: send code_challenge with code_challenge_method=S256.");
  }
  const rawResource = one("resource");
  if (rawResource === undefined) return fail("invalid_target", "Send one resource.");
  // RFC 8707: clients MUST send the MCP server URL; a client that leaves it out gets the same binding.
  const resource = canonicalResource(rawResource ?? mcpResource());
  if (!resource || resource !== canonicalResource(mcpResource())) return fail("invalid_target", `The only resource here is ${mcpResource()}.`);
  const rawScope = one("scope");
  if (rawScope === undefined) return fail("invalid_scope", "Send scope once.");
  // Every grant gets the one scope, mcp. Other requested scopes (offline_access, openid, ...) are left
  // out rather than refused (RFC 6749 3.3); refresh tokens are issued either way.
  if ((rawScope ?? "").length > 500) return fail("invalid_scope", "scope is too long.");

  if (!session) return { kind: "login", next: `/oauth/authorize?${q.toString()}` };
  if (session.role !== "owner") return ONLY_OWNER;

  const ticket: Ticket = {
    c: client.client_id, r: redirectUri, s: state, cc: challenge, sc: MCP_SCOPE, rs: resource,
    u: session.user.id, w: session.workspace.id, exp: Math.floor(Date.now() / 1000) + CODE_TTL_S,
  };
  return { kind: "consent", ticket: signTicket(ticket), view: view(client, session) };
}

export type Decision = { ok: true; redirect: string } | { ok: false; status: number; error: string; message: string };

/** The user pressed Allow or Deny on the consent page. Returns where to send the browser. */
export async function decide(rawTicket: string, accept: boolean, session: SessionContext): Promise<Decision> {
  const t = readTicket<Ticket>(rawTicket);
  if (!t || t.exp < Math.floor(Date.now() / 1000)) return { ok: false, status: 400, error: "expired", message: "This approval page has expired. Start the connection again from the app." };
  // The ticket was made for this user and workspace; a ticket from someone else's session is useless.
  if (t.u !== session.user.id || t.w !== session.workspace.id) return { ok: false, status: 403, error: "wrong_account", message: "You are signed in with a different account than the one that opened this page." };
  if (session.role !== "owner") return { ok: false, status: 403, error: "forbidden", message: ONLY_OWNER.message };
  const client = await findClient(t.c);
  if (!client || !redirectMatches(client.redirect_uris, t.r)) return { ok: false, status: 400, error: "unknown_client", message: "This app is no longer registered." };

  if (!accept) return { ok: true, redirect: redirectWith(t.r, { error: "access_denied", error_description: "The user did not allow access.", state: t.s }) };

  const admin = dbAdmin();
  const grantId = await activeGrant(t.w, t.u, client.client_id, t.sc, t.rs);
  if (!grantId) return { ok: false, status: 503, error: "unavailable", message: "Could not save your approval. Try again." };
  const code = newSecret("code");
  const { error } = await admin.from("oauth_codes").insert({
    code_hash: hashSecret(code), grant_id: grantId, redirect_uri: t.r, code_challenge: t.cc, scope: t.sc, resource: t.rs,
    expires_at: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  });
  if (error) return { ok: false, status: 503, error: "unavailable", message: "Could not save your approval. Try again." };
  return { ok: true, redirect: redirectWith(t.r, { code, state: t.s }) };
}

/** The active grant for this workspace, user and client, created if there is none. */
async function activeGrant(workspaceId: string, userId: string, clientId: string, scope: string, resource: string): Promise<string | null> {
  const admin = dbAdmin();
  const find = () => admin.from("oauth_grants").select("id").eq("workspace_id", workspaceId).eq("user_id", userId).eq("client_id", clientId).is("revoked_at", null).maybeSingle<{ id: string }>();
  const existing = await find();
  if (existing.data) return existing.data.id;
  const { data, error } = await admin.from("oauth_grants").insert({ workspace_id: workspaceId, user_id: userId, client_id: clientId, scope, resource }).select("id").single<{ id: string }>();
  if (data) return data.id;
  // Two approvals at once: the unique index let one through; use that one.
  if (error?.code === "23505") return (await find()).data?.id ?? null;
  return null;
}
