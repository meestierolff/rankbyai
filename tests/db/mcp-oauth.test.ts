import { auth, Client, StreamableHTTPClientTransport, type OAuthClientProvider } from "@modelcontextprotocol/client";
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext, Workspace } from "@/lib/auth";
import { closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";

/**
 * OAuth 2.1 for /api/mcp, end to end against the real local database: discovery, dynamic client
 * registration (public and secret-based), Client ID Metadata Documents, the consent decision, code
 * exchange with PKCE, refresh rotation with reuse detection, revocation, and the refusals. The MCP
 * side is driven by the official MCP client and its OAuth implementation; only the browser steps
 * (signing in and pressing Allow) are played by the test with a mocked session.
 */
const env = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://rankbyai.test"; // an https issuer, as the client requires
  process.env.MCP_OAUTH = "1";
  return { origin: "https://rankbyai.test" };
});
const session = vi.hoisted(() => ({ current: null as SessionContext | null }));
const deferred = vi.hoisted(() => ({ queue: [] as (() => Promise<unknown>)[] }));
const cimd = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));
vi.mock("@/lib/auth", () => ({ getSessionContext: async () => session.current }));
vi.mock("next/server", () => ({ after: (work: () => Promise<unknown>) => { deferred.queue.push(work); } }));
vi.mock("@/lib/oauth/cimd-fetch", () => ({ fetchClientMetadataDocument: async (url: string) => cimd.docs.get(url) ?? null }));

const ORIGIN = env.origin;
const MCP_URL = `${ORIGIN}/api/mcp`;
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

// ───────────────────────── the app, as an MCP client sees it over HTTP ─────────────────────────

const routes = async () => ({
  prm: await import("@/app/.well-known/oauth-protected-resource/route"),
  prmMcp: await import("@/app/.well-known/oauth-protected-resource/api/mcp/route"),
  as: await import("@/app/.well-known/oauth-authorization-server/route"),
  register: await import("@/app/oauth/register/route"),
  token: await import("@/app/oauth/token/route"),
  revoke: await import("@/app/oauth/revoke/route"),
  mcp: await import("@/app/api/mcp/route"),
  decision: await import("@/app/oauth/authorize/decision/route"),
  grants: await import("@/app/api/developer/oauth-grants/[id]/route"),
  rest: await import("@/lib/api-v1/rest"),
  authorize: await import("@/lib/oauth/authorize"),
});
let r: Awaited<ReturnType<typeof routes>>;

/** fetch() for the app: maps a URL on the test origin to its route handler. */
async function appFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== ORIGIN) return new Response("not found", { status: 404 });
  const m = request.method;
  switch (url.pathname) {
    case "/.well-known/oauth-protected-resource": return m === "OPTIONS" ? r.prm.OPTIONS() : r.prm.GET();
    case "/.well-known/oauth-protected-resource/api/mcp": return m === "OPTIONS" ? r.prmMcp.OPTIONS() : r.prmMcp.GET();
    case "/.well-known/oauth-authorization-server": return m === "OPTIONS" ? r.as.OPTIONS() : r.as.GET();
    case "/oauth/register": return r.register.POST(request);
    case "/oauth/token": return r.token.POST(request);
    case "/oauth/revoke": return r.revoke.POST(request);
    case "/api/mcp": return m === "OPTIONS" ? r.mcp.OPTIONS() : r.mcp.POST(request);
    default: return new Response("not found", { status: 404 });
  }
}

const form = (params: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(params).toString() });
const token = async (params: Record<string, string>, headers: Record<string, string> = {}) => {
  const res = await r.token.POST(form(params, headers));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, body: (await res.json()) as any };
};

// ───────────────────────── a client that keeps everything in memory ─────────────────────────

class TestProvider implements OAuthClientProvider {
  info: Awaited<ReturnType<OAuthClientProvider["clientInformation"]>>;
  stored: Awaited<ReturnType<OAuthClientProvider["tokens"]>>;
  verifier = "";
  authUrl: URL | undefined;
  readonly stateValue = randomBytes(12).toString("hex");
  constructor(readonly redirect = CALLBACK, readonly method: "none" | "client_secret_basic" | "client_secret_post" = "none", readonly clientMetadataUrl?: string) {}
  get redirectUrl() { return this.redirect; }
  get clientMetadata() {
    return { client_name: "Acceptance Test Client", redirect_uris: [this.redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: this.method };
  }
  state() { return this.stateValue; }
  clientInformation() { return this.info; }
  saveClientInformation(i: NonNullable<TestProvider["info"]>) { this.info = i; }
  tokens() { return this.stored; }
  saveTokens(t: NonNullable<TestProvider["stored"]>) { this.stored = t; }
  redirectToAuthorization(url: URL) { this.authUrl = url; }
  saveCodeVerifier(v: string) { this.verifier = v; }
  codeVerifier() { return this.verifier; }
}

async function sessionFor(user: TestUser, workspaceId = user.workspaceId, role: "owner" | "member" = "owner"): Promise<SessionContext> {
  const [workspace] = await sql<Workspace>("select * from public.workspaces where id = $1", [workspaceId]);
  return { user: { id: user.id, email: user.email, emailVerified: true, name: null }, workspace, role, isAdmin: false };
}

async function decide(ticket: string, accept: boolean, headers: Record<string, string> = {}) {
  const res = await r.decision.POST(new Request(`${ORIGIN}/oauth/authorize/decision`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers }, body: JSON.stringify({ ticket, accept }),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (await res.json()) as any };
}

/** Start the flow with the official client and stop where a browser would open the consent page. */
async function startFlow(p: TestProvider): Promise<URL> {
  expect(await auth(p, { serverUrl: MCP_URL, fetchFn: appFetch })).toBe("REDIRECT");
  expect(p.authUrl).toBeDefined();
  return p.authUrl!;
}

/** The browser part: signed in as `user`, the consent page, Allow. Returns the redirect back to the client. */
async function approve(authUrl: URL, user: TestUser): Promise<URL> {
  session.current = await sessionFor(user);
  const prepared = await r.authorize.prepareAuthorization(authUrl.searchParams, session.current);
  if (prepared.kind !== "consent") throw new Error(`expected the consent page, got ${prepared.kind}`);
  const d = await decide(prepared.ticket, true);
  expect(d.status).toBe(200);
  return new URL(d.body.redirect);
}

/** The whole flow: register, consent, code exchange. Returns the provider holding tokens. */
async function connect(user: TestUser, p = new TestProvider()): Promise<TestProvider> {
  const back = await approve(await startFlow(p), user);
  expect(back.searchParams.get("state")).toBe(p.stateValue);
  expect(back.searchParams.get("iss")).toBe(ORIGIN);
  expect(await auth(p, { serverUrl: MCP_URL, authorizationCode: back.searchParams.get("code")!, iss: back.searchParams.get("iss")!, fetchFn: appFetch })).toBe("AUTHORIZED");
  return p;
}

async function mcpClient(p: TestProvider): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: p, fetch: appFetch });
  const client = new Client({ name: "oauth-acceptance", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

const mcpStatus = async (accessToken: string) => {
  const res = await r.mcp.POST(new Request(MCP_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  }));
  return { status: res.status, challenge: res.headers.get("www-authenticate") ?? "" };
};

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  r = await routes();
  await resetData();
  a = await createTestUser("oauth-a");
  b = await createTestUser("oauth-b");
});
beforeEach(async () => {
  await resetData();
  session.current = null;
  cimd.docs.clear();
  process.env.MCP_OAUTH = "1";
  await sql("insert into public.businesses (workspace_id, name, city, source) values ($1, 'Alice Dental', 'Austin', 'manual'), ($2, 'Bob Plumbing', 'Denver', 'manual')", [a.workspaceId, b.workspaceId]);
});
afterAll(async () => {
  await resetData();
  await deleteTestUsers();
  await closePool();
});

// ═════════════════════════ discovery ═════════════════════════

describe("discovery", () => {
  it("a request without credentials gets a 401 that names the protected resource metadata and the scope", async () => {
    const res = await appFetch(MCP_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
    const challenge = res.headers.get("www-authenticate")!;
    expect(challenge).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`);
    expect(challenge).toContain('scope="mcp"');
    expect(challenge).not.toContain("invalid_token");
    expect(res.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
  });

  it("a wrong token gets error=\"invalid_token\"", async () => {
    expect((await mcpStatus("rbai_at_not-a-real-token")).challenge).toContain('error="invalid_token"');
    expect((await mcpStatus("rbai_live_" + "B".repeat(32))).challenge).toContain('error="invalid_token"');
  });

  it("serves protected resource metadata at the root and the path form", async () => {
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp"]) {
      const res = await appFetch(ORIGIN + path);
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(await res.json()).toMatchObject({ resource: MCP_URL, authorization_servers: [ORIGIN], scopes_supported: ["mcp"], bearer_methods_supported: ["header"] });
    }
  });

  it("serves authorization server metadata with PKCE S256, registration, revocation, CIMD and iss", async () => {
    const res = await appFetch(`${ORIGIN}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const m = await res.json();
    expect(m).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/oauth/authorize`,
      token_endpoint: `${ORIGIN}/oauth/token`,
      registration_endpoint: `${ORIGIN}/oauth/register`,
      revocation_endpoint: `${ORIGIN}/oauth/revoke`,
      code_challenge_methods_supported: ["S256"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
    expect(m.token_endpoint_auth_methods_supported).toEqual(expect.arrayContaining(["none", "client_secret_basic", "client_secret_post"]));
    expect((await appFetch(`${ORIGIN}/.well-known/oauth-authorization-server`, { method: "OPTIONS" })).status).toBe(204);
  });

  it("while MCP_OAUTH is off, nothing is advertised and /api/mcp answers as before", async () => {
    process.env.MCP_OAUTH = "0";
    expect((await appFetch(`${ORIGIN}/.well-known/oauth-authorization-server`)).status).toBe(404);
    expect((await appFetch(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`)).status).toBe(404);
    expect((await appFetch(`${ORIGIN}/oauth/register`, { method: "POST", body: "{}" })).status).toBe(404);
    expect((await token({ grant_type: "authorization_code" })).status).toBe(404);
    const res = await appFetch(MCP_URL, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer realm="RankbyAI API"');
  });
});

// ═════════════════════════ the full flow ═════════════════════════

describe("full flow with the official MCP client", () => {
  it("registers, gets consent, exchanges the code and lists every tool with its annotations", async () => {
    const p = await connect(a);
    expect(p.info?.client_id).toMatch(/^rbai_oc_/);
    expect(p.stored?.access_token).toMatch(/^rbai_at_/);
    expect(p.stored?.refresh_token).toMatch(/^rbai_rt_/);
    expect(p.stored?.scope).toBe("mcp");
    expect(p.stored?.expires_in).toBe(3600);
    // The client sent PKCE S256 and the resource, as the spec requires.
    expect(p.authUrl!.searchParams.get("code_challenge_method")).toBe("S256");
    expect(p.authUrl!.searchParams.get("resource")).toBe(MCP_URL);

    const client = await mcpClient(p);
    const { MCP_TOOLS, MCP_TOOL_HINTS } = await import("@/lib/api-v1/mcp-tools");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...MCP_TOOLS].sort());
    for (const t of tools) {
      expect(t.annotations?.title, t.name).toBe(t.title);
      expect(typeof t.annotations?.readOnlyHint, t.name).toBe("boolean");
      expect(typeof t.annotations?.openWorldHint, t.name).toBe("boolean");
      if (!t.annotations?.readOnlyHint) expect(typeof t.annotations?.destructiveHint, t.name).toBe("boolean");
      expect(t.annotations).toMatchObject(MCP_TOOL_HINTS[t.name as keyof typeof MCP_TOOL_HINTS]);
    }
    expect(tools.find((t) => t.name === "delete_business")!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(tools.find((t) => t.name === "list_businesses")!.annotations).toMatchObject({ readOnlyHint: true });

    // The token acts in Alice's workspace and nowhere else.
    const res = await client.callTool({ name: "list_businesses", arguments: {} });
    const body = JSON.parse((res.content as { text: string }[])[0].text);
    expect(body.businesses.map((x: { name: string }) => x.name)).toEqual(["Alice Dental"]);
    await client.close();
  });

  it("shows the owner what they approve: app name, where the code goes, the workspace", async () => {
    const url = await startFlow(new TestProvider());
    const prepared = await r.authorize.prepareAuthorization(url.searchParams, await sessionFor(a));
    expect(prepared.kind).toBe("consent");
    if (prepared.kind !== "consent") return;
    expect(prepared.view).toMatchObject({ clientName: "Acceptance Test Client", redirectTargets: ["claude.ai"], localOnly: false, email: a.email });
    expect(prepared.view.workspaceName.length).toBeGreaterThan(0);
  });

  it("a secret-based client (client_secret_basic) works, and a wrong secret is invalid_client", async () => {
    const p = await connect(a, new TestProvider(CALLBACK, "client_secret_basic"));
    expect(p.info && "client_secret" in p.info && p.info.client_secret).toMatch(/^rbai_cs_/);
    const wrong = await token(
      { grant_type: "refresh_token", refresh_token: p.stored!.refresh_token! },
      { Authorization: `Basic ${Buffer.from(`${p.info!.client_id}:rbai_cs_wrong`).toString("base64")}` },
    );
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe("invalid_client");
    expect(wrong.headers.get("www-authenticate")).toContain("Basic");
  });

  it("a client identified by a Client ID Metadata Document needs no registration", async () => {
    const docUrl = "https://client.example/oauth/client.json";
    cimd.docs.set(docUrl, { client_id: docUrl, client_name: "Doc Client", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] });
    const p = await connect(a, new TestProvider(CALLBACK, "none", docUrl));
    expect(p.info?.client_id).toBe(docUrl);
    expect((await sql("select kind from public.oauth_clients where client_id = $1", [docUrl]))[0].kind).toBe("cimd");
    expect((await mcpStatus(p.stored!.access_token)).status).toBe(200);
  });

  it("a metadata document that does not name itself, or lacks the redirect URI, is refused", async () => {
    const docUrl = "https://client.example/bad.json";
    cimd.docs.set(docUrl, { client_id: "https://someone-else.example/client.json", client_name: "Bad", redirect_uris: [CALLBACK] });
    const q = new URLSearchParams({ client_id: docUrl, redirect_uri: CALLBACK, response_type: "code", code_challenge: "A".repeat(43), code_challenge_method: "S256" });
    expect((await r.authorize.prepareAuthorization(q, await sessionFor(a))).kind).toBe("error");
    cimd.docs.set(docUrl, { client_id: docUrl, client_name: "Bad", redirect_uris: ["https://elsewhere.example/cb"] });
    expect((await r.authorize.prepareAuthorization(q, await sessionFor(a))).kind).toBe("error");
  });

  it("API keys keep working on /api/mcp with OAuth switched on", async () => {
    const { createApiKey } = await import("@/lib/api-keys");
    await sql("update public.workspaces set plan = 'lifetime' where id = $1", [a.workspaceId]);
    const k = await createApiKey(a.workspaceId, "still works");
    if (!k.ok) throw new Error("key not created");
    expect((await mcpStatus(k.key)).status).toBe(200);
  });
});

// ═════════════════════════ refresh, revocation, expiry ═════════════════════════

describe("refresh and revocation", () => {
  const refreshWith = (p: TestProvider, rt: string) => token({ grant_type: "refresh_token", refresh_token: rt, client_id: p.info!.client_id, resource: MCP_URL });

  it("a refresh rotates both tokens; the old refresh token replayed after the grace window ends the family", async () => {
    const p = await connect(a);
    const first = p.stored!;
    const r1 = await refreshWith(p, first.refresh_token!);
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(first.refresh_token);
    expect((await mcpStatus(r1.body.access_token)).status).toBe(200);

    // Pretend the rotation happened a minute ago, then replay the old token: theft.
    await sql("update public.oauth_tokens set rotated_at = now() - interval '1 minute' where rotated_at is not null");
    const replay = await refreshWith(p, first.refresh_token!);
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
    expect((await mcpStatus(r1.body.access_token)).status).toBe(401);
    expect((await refreshWith(p, r1.body.refresh_token)).body.error).toBe("invalid_grant");
  });

  it("two refreshes at the same moment both succeed (reuse window)", async () => {
    const p = await connect(a);
    const [x, y] = await Promise.all([refreshWith(p, p.stored!.refresh_token!), refreshWith(p, p.stored!.refresh_token!)]);
    expect([x.status, y.status]).toEqual([200, 200]);
  });

  it("the official client refreshes by itself when the access token has expired", async () => {
    const p = await connect(a);
    const old = p.stored!.access_token;
    await sql("update public.oauth_tokens set expires_at = now() - interval '1 second' where kind = 'access'");
    expect((await mcpStatus(old)).status).toBe(401);
    const client = await mcpClient(p);
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    expect(p.stored!.access_token).not.toBe(old);
    await client.close();
  });

  it("revoking the refresh token (RFC 7009) also ends the access tokens it produced", async () => {
    const p = await connect(a);
    const res = await r.revoke.POST(new Request(`${ORIGIN}/oauth/revoke`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: p.stored!.refresh_token!, token_type_hint: "refresh_token", client_id: p.info!.client_id }).toString(),
    }));
    expect(res.status).toBe(200);
    expect((await mcpStatus(p.stored!.access_token)).status).toBe(401);
    expect((await refreshWith(p, p.stored!.refresh_token!)).body.error).toBe("invalid_grant");
  });

  it("another client cannot revoke someone else's token", async () => {
    const p = await connect(a);
    const other = await connect(a, new TestProvider("https://chatgpt.com/connector_platform_oauth_redirect"));
    await r.revoke.POST(new Request(`${ORIGIN}/oauth/revoke`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: p.stored!.access_token, client_id: other.info!.client_id }).toString(),
    }));
    expect((await mcpStatus(p.stored!.access_token)).status).toBe(200);
  });

  it("disconnecting the app in RankbyAI ends its tokens at once", async () => {
    const p = await connect(a);
    const [grant] = await sql<{ id: string }>("select id from public.oauth_grants where workspace_id = $1", [a.workspaceId]);
    session.current = await sessionFor(a);
    const res = await r.grants.DELETE(new Request(`${ORIGIN}/api/developer/oauth-grants/${grant.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: grant.id }) });
    expect(res.status).toBe(200);
    expect((await mcpStatus(p.stored!.access_token)).status).toBe(401);
    expect((await refreshWith(p, p.stored!.refresh_token!)).body.error).toBe("invalid_grant");
  });

  it("Bob cannot disconnect Alice's app", async () => {
    await connect(a);
    const [grant] = await sql<{ id: string }>("select id from public.oauth_grants where workspace_id = $1", [a.workspaceId]);
    session.current = await sessionFor(b);
    const res = await r.grants.DELETE(new Request(`${ORIGIN}/api/developer/oauth-grants/${grant.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: grant.id }) });
    expect(res.status).toBe(404);
  });
});

// ═════════════════════════ refusals ═════════════════════════

describe("refusals", () => {
  /** Register a public client and get one authorization code by hand (no SDK), for the edge cases. */
  async function codeFor(user: TestUser, opts: { redirect?: string } = {}) {
    const redirect = opts.redirect ?? CALLBACK;
    const reg = await r.register.POST(new Request(`${ORIGIN}/oauth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Manual", redirect_uris: [redirect], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] }),
    }));
    expect(reg.status).toBe(201);
    const clientId = (await reg.json()).client_id as string;
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "s1", resource: MCP_URL, scope: "mcp" });
    const back = await approve(new URL(`${ORIGIN}/oauth/authorize?${q}`), user);
    return { clientId, verifier, redirect, code: back.searchParams.get("code")!, q };
  }
  const exchange = (c: { clientId: string; verifier: string; redirect: string; code: string }, over: Record<string, string> = {}) =>
    token({ grant_type: "authorization_code", code: c.code, code_verifier: c.verifier, redirect_uri: c.redirect, client_id: c.clientId, resource: MCP_URL, ...over });

  it("a code works once; replaying it revokes what the first exchange received", async () => {
    const c = await codeFor(a);
    const first = await exchange(c);
    expect(first.status).toBe(200);
    expect((await mcpStatus(first.body.access_token)).status).toBe(200);
    const again = await exchange(c);
    expect(again.body.error).toBe("invalid_grant");
    expect((await mcpStatus(first.body.access_token)).status).toBe(401);
  });

  it("two redemptions of one code at the same moment: exactly one succeeds", async () => {
    const c = await codeFor(a);
    const results = await Promise.all([exchange(c), exchange(c)]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 400]);
  });

  it("a wrong code_verifier, redirect_uri or resource is refused, and the code is spent", async () => {
    const c1 = await codeFor(a);
    expect((await exchange(c1, { code_verifier: randomBytes(32).toString("base64url") })).body.error).toBe("invalid_grant");
    expect((await exchange(c1)).body.error).toBe("invalid_grant"); // spent by the wrong attempt
    const c2 = await codeFor(a);
    expect((await exchange(c2, { redirect_uri: "https://claude.ai/other" })).body.error).toBe("invalid_grant");
    const c3 = await codeFor(a);
    expect((await exchange(c3, { resource: "https://evil.example/api/mcp" })).body.error).toBe("invalid_target");
  });

  it("another client cannot redeem the code", async () => {
    const c = await codeFor(a);
    const other = await codeFor(a);
    expect((await exchange(c, { client_id: other.clientId })).body.error).toBe("invalid_grant");
  });

  it("the authorization request refuses a missing or plain PKCE, a foreign resource, and a bad response_type, back to the client with iss", async () => {
    const c = await codeFor(a);
    const sess = await sessionFor(a);
    for (const [change, error] of [
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ code_challenge: "" }, "invalid_request"],
      [{ resource: "https://evil.example/api/mcp" }, "invalid_target"],
      [{ response_type: "token" }, "unsupported_response_type"],
    ] as const) {
      const q = new URLSearchParams(c.q);
      for (const [k, v] of Object.entries(change)) q.set(k, v);
      const out = await r.authorize.prepareAuthorization(q, sess);
      expect(out.kind).toBe("redirect");
      if (out.kind !== "redirect") continue;
      const u = new URL(out.url);
      expect(u.searchParams.get("error")).toBe(error);
      expect(u.searchParams.get("iss")).toBe(ORIGIN);
      expect(u.searchParams.get("state")).toBe("s1");
    }
  });

  it("an unknown client or an unregistered redirect URI is shown on our page, never redirected", async () => {
    const c = await codeFor(a);
    const sess = await sessionFor(a);
    const q1 = new URLSearchParams(c.q);
    q1.set("client_id", "rbai_oc_doesnotexist000000");
    expect((await r.authorize.prepareAuthorization(q1, sess)).kind).toBe("error");
    const q2 = new URLSearchParams(c.q);
    q2.set("redirect_uri", "https://evil.example/cb");
    expect((await r.authorize.prepareAuthorization(q2, sess)).kind).toBe("error");
  });

  it("signed out: the page sends the user to log in and back; a member who is not the owner cannot approve", async () => {
    const c = await codeFor(a);
    const out = await r.authorize.prepareAuthorization(new URLSearchParams(c.q), null);
    expect(out).toEqual({ kind: "login", next: `/oauth/authorize?${new URLSearchParams(c.q)}` });
    await sql("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')", [a.workspaceId, b.id]);
    const member = await r.authorize.prepareAuthorization(new URLSearchParams(c.q), await sessionFor(b, a.workspaceId, "member"));
    expect(member.kind).toBe("error");
    await sql("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [a.workspaceId, b.id]);
  });

  it("Deny goes back to the client as access_denied with state and iss", async () => {
    const c = await codeFor(a);
    session.current = await sessionFor(a);
    const prepared = await r.authorize.prepareAuthorization(new URLSearchParams(c.q), session.current);
    if (prepared.kind !== "consent") throw new Error("expected consent");
    const d = await decide(prepared.ticket, false);
    const u = new URL(d.body.redirect);
    expect([u.searchParams.get("error"), u.searchParams.get("state"), u.searchParams.get("iss"), u.searchParams.get("code")]).toEqual(["access_denied", "s1", ORIGIN, null]);
  });

  it("a consent ticket is useless to another account, when altered, or from another site", async () => {
    const c = await codeFor(a);
    const prepared = await r.authorize.prepareAuthorization(new URLSearchParams(c.q), await sessionFor(a));
    if (prepared.kind !== "consent") throw new Error("expected consent");
    session.current = await sessionFor(b);
    expect((await decide(prepared.ticket, true)).status).toBe(403);
    session.current = await sessionFor(a);
    const [body, sig] = prepared.ticket.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), w: b.workspaceId })).toString("base64url");
    expect((await decide(`${forged}.${sig}`, true)).status).toBe(400);
    expect((await decide(prepared.ticket, true, { Origin: "https://evil.example" })).status).toBe(403);
  });

  it("Bob's token sees Bob's workspace only", async () => {
    const p = await connect(b);
    const client = await mcpClient(p);
    const res = await client.callTool({ name: "list_businesses", arguments: {} });
    expect(JSON.parse((res.content as { text: string }[])[0].text).businesses.map((x: { name: string }) => x.name)).toEqual(["Bob Plumbing"]);
    await client.close();
  });

  it("an OAuth access token does not open the REST API", async () => {
    const p = await connect(a);
    const url = new URL(`${ORIGIN}/api/v1/businesses`);
    const res = await r.rest.handleRest(new Request(url, { headers: { Authorization: `Bearer ${p.stored!.access_token}` } }), ["businesses"], () => {});
    expect(res.status).toBe(401);
  });

  it("an access token whose owner no longer owns the workspace stops working", async () => {
    const p = await connect(a);
    await sql("update public.oauth_grants set user_id = $1 where workspace_id = $2", [b.id, a.workspaceId]);
    expect((await mcpStatus(p.stored!.access_token)).status).toBe(401);
  });
});

// ═════════════════════════ registration ═════════════════════════

describe("dynamic client registration", () => {
  const register = async (body: unknown, ip = "203.0.113.7") => {
    const res = await r.register.POST(new Request(`${ORIGIN}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": ip }, body: JSON.stringify(body) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, body: (await res.json()) as any };
  };

  it("accepts the redirect URIs Claude, ChatGPT and Cursor use, and native app schemes", async () => {
    for (const uris of [[CALLBACK], ["https://chatgpt.com/connector_platform_oauth_redirect"], ["https://www.cursor.com/agents/mcp/oauth/callback", "http://localhost:8787/callback"], ["cursor://anysphere.cursor-retrieval/oauth/callback"], ["http://127.0.0.1/callback"]]) {
      const res = await register({ client_name: "ok", redirect_uris: uris, token_endpoint_auth_method: "none" });
      expect(res.status, uris.join()).toBe(201);
      expect(res.body.client_secret).toBeUndefined();
    }
  });

  it("refuses unsafe redirect URIs and unknown methods", async () => {
    for (const body of [
      { redirect_uris: ["http://evil.example/cb"], token_endpoint_auth_method: "none" },
      { redirect_uris: ["javascript:alert(1)"], token_endpoint_auth_method: "none" },
      { redirect_uris: ["https://ok.example/cb#frag"], token_endpoint_auth_method: "none" },
      { redirect_uris: ["myapp://cb"], token_endpoint_auth_method: "none", application_type: "web" },
      { redirect_uris: [], token_endpoint_auth_method: "none" },
      { redirect_uris: [CALLBACK], token_endpoint_auth_method: "private_key_jwt" },
      { redirect_uris: [CALLBACK], response_types: ["token"] },
      { redirect_uris: [CALLBACK], grant_types: ["client_credentials"] },
    ]) {
      expect((await register(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("gives a secret by default (RFC 7591) and stores only its hash", async () => {
    const res = await register({ client_name: "Server app", redirect_uris: [CALLBACK] });
    expect(res.status).toBe(201);
    expect(res.body.token_endpoint_auth_method).toBe("client_secret_basic");
    expect(res.body.client_secret).toMatch(/^rbai_cs_/);
    const [row] = await sql<{ client_secret_hash: string }>("select client_secret_hash from public.oauth_clients where client_id = $1", [res.body.client_id]);
    expect(row.client_secret_hash).not.toContain(res.body.client_secret);
  });

  it("limits registrations per address", async () => {
    for (let i = 0; i < 30; i++) expect((await register({ redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" }, "198.51.100.9")).status).toBe(201);
    expect((await register({ redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" }, "198.51.100.9")).status).toBe(429);
    expect((await register({ redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" }, "198.51.100.10")).status).toBe(201);
  });

  it("the token endpoint refuses unknown grant types and accepts JSON bodies too", async () => {
    const reg = await register({ redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" });
    expect((await token({ grant_type: "client_credentials", client_id: reg.body.client_id })).body.error).toBe("unsupported_grant_type");
    const res = await r.token.POST(new Request(`${ORIGIN}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", client_id: reg.body.client_id }) }));
    expect((await res.json()).error).toBe("invalid_request");
  });
});

// ═════════════════════════ nothing secret leaks ═════════════════════════

describe("secrets at rest", () => {
  it("codes, tokens and client secrets are stored only as hashes", async () => {
    const p = await connect(a, new TestProvider(CALLBACK, "client_secret_post"));
    const dump = JSON.stringify(await sql("select * from public.oauth_tokens")) + JSON.stringify(await sql("select * from public.oauth_codes")) + JSON.stringify(await sql("select * from public.oauth_clients"));
    expect(dump).not.toContain(p.stored!.access_token);
    expect(dump).not.toContain(p.stored!.refresh_token!);
    expect(dump).not.toContain((p.info as { client_secret?: string }).client_secret!);
  });
});
