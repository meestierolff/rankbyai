import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

/** The pure parts of the OAuth server: redirect URI rules, resource matching, PKCE, consent tickets, metadata. */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://rankbyai.test";
  process.env.HASH_PEPPER = process.env.HASH_PEPPER ?? "unit-test-pepper-0123456789";
});
vi.mock("@/lib/db/clients", () => ({ dbAdmin: () => { throw new Error("no database in unit tests"); } }));

let m: {
  clients: typeof import("@/lib/oauth/clients");
  config: typeof import("@/lib/oauth/config");
  secrets: typeof import("@/lib/oauth/secrets");
  metadata: typeof import("@/lib/oauth/metadata");
  tools: typeof import("@/lib/api-v1/mcp-tools");
};
beforeAll(async () => {
  m = {
    clients: await import("@/lib/oauth/clients"),
    config: await import("@/lib/oauth/config"),
    secrets: await import("@/lib/oauth/secrets"),
    metadata: await import("@/lib/oauth/metadata"),
    tools: await import("@/lib/api-v1/mcp-tools"),
  };
});

describe("redirect URIs", () => {
  it("allows https, http on loopback only, and native app schemes; refuses fragments and script schemes", () => {
    const k = (u: string) => m.clients.redirectKind(u);
    expect(k("https://claude.ai/api/mcp/auth_callback")).toBe("https");
    expect(k("http://localhost:8787/callback")).toBe("loopback");
    expect(k("http://127.0.0.1/callback")).toBe("loopback");
    expect(k("http://[::1]:5000/cb")).toBe("loopback");
    expect(k("cursor://anysphere.cursor-retrieval/oauth/callback")).toBe("custom");
    expect(k("com.example.app:/oauth2redirect")).toBe("custom");
    for (const bad of ["http://example.com/cb", "https://ok.example/cb#x", "https://user:pw@ok.example/cb", "javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "not a url", "https://" + "a".repeat(600)]) {
      expect(k(bad), bad).toBeNull();
    }
  });

  it("matches exactly, except that loopback http matches on any port", () => {
    const reg = ["http://localhost/callback", "https://claude.ai/api/mcp/auth_callback"];
    expect(m.clients.redirectMatches(reg, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(m.clients.redirectMatches(reg, "https://claude.ai/api/mcp/auth_callback/")).toBe(false);
    expect(m.clients.redirectMatches(reg, "http://localhost:53122/callback")).toBe(true);
    expect(m.clients.redirectMatches(reg, "http://localhost:53122/other")).toBe(false);
    expect(m.clients.redirectMatches(reg, "http://127.0.0.1:53122/callback")).toBe(false);
  });

  it("recognises Client ID Metadata Document URLs", () => {
    expect(m.clients.isMetadataDocumentUrl("https://chatgpt.com/oauth/client.json")).toBe(true);
    expect(m.clients.isMetadataDocumentUrl("https://client.example/")).toBe(false);
    expect(m.clients.isMetadataDocumentUrl("https://client.example:8443/c.json")).toBe(false);
    expect(m.clients.isMetadataDocumentUrl("http://client.example/c.json")).toBe(false);
    expect(m.clients.isMetadataDocumentUrl("rbai_oc_abc")).toBe(false);
  });
});

describe("resource, PKCE and tickets", () => {
  it("canonicalises resource URLs for comparison", () => {
    expect(m.config.canonicalResource("HTTPS://RankbyAI.test/api/mcp/")).toBe("https://rankbyai.test/api/mcp");
    expect(m.config.canonicalResource("https://rankbyai.test/api/mcp#x")).toBeNull();
    expect(m.config.mcpResource()).toBe("https://rankbyai.test/api/mcp");
  });

  it("checks PKCE S256 and refuses malformed verifiers", () => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(m.secrets.pkceMatches(verifier, challenge)).toBe(true);
    expect(m.secrets.pkceMatches(verifier + "x", challenge)).toBe(false);
    expect(m.secrets.pkceMatches("short", challenge)).toBe(false);
  });

  it("signs consent tickets and rejects any change", () => {
    const t = m.secrets.signTicket({ u: "user", w: "ws", exp: 1 });
    expect(m.secrets.readTicket(t)).toEqual({ u: "user", w: "ws", exp: 1 });
    const [body, sig] = t.split(".");
    const other = Buffer.from(JSON.stringify({ u: "user", w: "other", exp: 1 })).toString("base64url");
    expect(m.secrets.readTicket(`${other}.${sig}`)).toBeNull();
    expect(m.secrets.readTicket(`${body}.${sig}x`)).toBeNull();
    expect(m.secrets.readTicket(`${body}.${sig}.extra`)).toBeNull();
  });

  it("issues prefixed, unguessable secrets", () => {
    const a = m.secrets.newSecret("access");
    expect(a).toMatch(/^rbai_at_[A-Za-z0-9_-]{43}$/);
    expect(m.secrets.newSecret("access")).not.toBe(a);
    expect(m.secrets.newSecret("clientId")).toMatch(/^rbai_oc_[A-Za-z0-9_-]{22}$/);
  });
});

describe("metadata", () => {
  it("names the issuer from configuration, never the request", () => {
    const prm = m.metadata.protectedResourceMetadata();
    const as = m.metadata.authorizationServerMetadata();
    expect(prm.resource).toBe("https://rankbyai.test/api/mcp");
    expect(prm.authorization_servers).toEqual([as.issuer]);
    expect(as.issuer).toBe("https://rankbyai.test");
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.metadata.bearerChallenge()).toBe('Bearer resource_metadata="https://rankbyai.test/.well-known/oauth-protected-resource/api/mcp", scope="mcp"');
  });
});

describe("tool annotations", () => {
  it("every tool has hints; read-only tools are exactly the get, list, estimate and compare tools", () => {
    const { MCP_TOOLS, MCP_TOOL_HINTS } = m.tools;
    expect(Object.keys(MCP_TOOL_HINTS).sort()).toEqual([...MCP_TOOLS].sort());
    for (const name of MCP_TOOLS) {
      const h = MCP_TOOL_HINTS[name];
      expect(h.readOnlyHint, name).toBe(/^(get_(?!fix_kit)|list_|estimate_|compare_)/.test(name));
      if (!h.readOnlyHint) expect(typeof h.destructiveHint, name).toBe("boolean");
    }
    expect(MCP_TOOL_HINTS.delete_business.destructiveHint).toBe(true);
    expect(MCP_TOOL_HINTS.run_ai_scan).toMatchObject({ destructiveHint: false, openWorldHint: true });
  });
});
