import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * src/proxy.ts end to end with the database mocked (fetch), sign-in switched off, and Next's own
 * matcher compiler. Pins down: the main site behaves as before, and a custom domain serves only its
 * own workspace's reports, with noindex on every response.
 */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://rankbyai.live";
  process.env.DATA_API_URL = "http://127.0.0.1:9/rest"; // never reached: fetch is mocked
  process.env.DATA_API_JWT_PRIVATE_JWK = "unused-in-this-test";
});
vi.mock("@/lib/db/tokens", () => ({ mintDbToken: async () => "service-token" }));
vi.mock("@/lib/auth-neon/server", () => ({ isAuthConfigured: () => false, neonAuth: () => { throw new Error("not in this test"); } }));

const { proxy, config } = await import("@/proxy");

const WS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SLUG_A = "slugOfAgencyA_01";
const SLUG_B = "slugOfAgencyB_02";

const DOMAINS: Record<string, { workspace_id: string; workspaces: { brand_website: string | null; plan: string } }> = {
  "reports.agency-a.com": { workspace_id: WS_A, workspaces: { brand_website: "https://agency-a.com", plan: "lifetime" } },
  "reports.agency-b.com": { workspace_id: WS_B, workspaces: { brand_website: null, plan: "lifetime" } },
  "reports.cache-check.com": { workspace_id: WS_B, workspaces: { brand_website: null, plan: "lifetime" } },
};
const REPORTS: Record<string, string | null> = { [SLUG_A]: WS_A, [SLUG_B]: WS_B };

let dbDown = false;
const queries: string[] = [];

beforeEach(() => {
  dbDown = false;
  queries.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    queries.push(`${url.pathname.split("/").pop()}?${url.searchParams.toString()}`);
    if (dbDown) throw new TypeError("fetch failed");
    if (url.pathname.endsWith("/workspace_domains")) {
      const host = url.searchParams.get("hostname")!.replace(/^eq\./, "");
      expect(url.searchParams.get("status")).toBe("eq.active");
      const row = DOMAINS[host];
      return Response.json(row ? [row] : []);
    }
    if (url.pathname.endsWith("/reports")) {
      const slug = url.searchParams.get("share_slug")!.replace(/^eq\./, "");
      expect(url.searchParams.get("revoked")).toBe("eq.false");
      return Response.json(slug in REPORTS ? [{ id: "r1", workspace_id: REPORTS[slug] }] : []);
    }
    return Response.json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

let hostCounter = 0;
const get = (url: string) => {
  const u = new URL(url);
  return proxy(new NextRequest(u, { headers: { host: u.host } }));
};
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("main site: unchanged", () => {
  it("a live share link passes, an unknown one is a real 404 (no noindex added to the passing page)", async () => {
    const ok = await get(`https://rankbyai.live/r/${SLUG_A}`);
    expect(passes(ok)).toBe(true);
    expect(ok.headers.get("x-robots-tag")).toBeNull();
    const missing = await get("https://rankbyai.live/r/unknownSlug_99");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("rankbyai.live</a>");
  });

  it("serves another workspace's report as before: the main site is not tied to a workspace", async () => {
    expect(passes(await get(`https://rankbyai.live/r/${SLUG_B}`))).toBe(true);
  });

  it("a failed lookup still lets the page decide, as before", async () => {
    dbDown = true;
    expect(passes(await get(`https://rankbyai.live/r/${SLUG_A}`))).toBe(true);
  });

  it("www, previews and localhost are the main site too", async () => {
    for (const origin of ["https://www.rankbyai.live", "https://rankbyai-preview.vercel.app", "http://localhost:3100"]) {
      expect((await get(`${origin}/r/unknownSlug_99`)).status, origin).toBe(404);
      expect(passes(await get(`${origin}/app`)), origin).toBe(true);
    }
  });

  it("paths outside the old matcher are left alone without a database call", async () => {
    for (const p of ["/", "/login", "/pricing", "/api/scans"]) {
      const res = await get(`https://rankbyai.live${p}`);
      expect(passes(res), p).toBe(true);
      expect(res.headers.get("x-robots-tag")).toBeNull();
    }
    expect(queries).toEqual([]);
  });
});

describe("custom domain", () => {
  it("serves its own workspace's report, with noindex", async () => {
    const res = await get(`https://reports.agency-a.com/r/${SLUG_A}`);
    expect(passes(res)).toBe(true);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(passes(await get(`https://reports.agency-a.com/api/reports/${SLUG_A}/pdf`))).toBe(true);
    expect(passes(await get(`https://reports.agency-a.com/r/${SLUG_A}/pdf`))).toBe(true);
    expect(passes(await get(`https://reports.agency-a.com/r/${SLUG_A}/opengraph-image`))).toBe(true);
  });

  it("never serves another workspace's report: the same real 404, white-label", async () => {
    for (const url of [`https://reports.agency-a.com/r/${SLUG_B}`, `https://reports.agency-b.com/r/${SLUG_A}`, `https://reports.agency-a.com/api/reports/${SLUG_B}/pdf`, `https://reports.agency-a.com/r/${SLUG_B}/pdf`]) {
      const res = await get(url);
      expect(res.status, url).toBe(404);
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      const html = await res.text();
      expect(html).toContain("This report link is not active.");
      expect(html).not.toContain("rankbyai.live");
    }
  });

  it("the app, sign-in, admin and API answer 404", async () => {
    for (const p of ["/app", "/app/settings/branding", "/login", "/admin", "/free-check", "/api/scans", "/api/v1/reports", "/api/domains", "/pricing", "/sitemap.xml"]) {
      const res = await get(`https://reports.agency-a.com${p}`);
      expect(res.status, p).toBe(404);
      expect(res.headers.get("x-robots-tag"), p).toBe("noindex, nofollow");
    }
  });

  it("/ redirects to the agency's website, or 404s when none is set", async () => {
    const a = await get("https://reports.agency-a.com/");
    expect(a.status).toBe(302);
    expect(a.headers.get("location")).toBe("https://agency-a.com/");
    expect(a.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await get("https://reports.agency-b.com/")).status).toBe(404);
  });

  it("an unknown host serves nothing; a database failure is a 503, never the report", async () => {
    expect((await get(`https://reports.unknown-${++hostCounter}.com/r/${SLUG_A}`)).status).toBe(404);
    dbDown = true;
    const res = await get(`https://reports.not-cached-${++hostCounter}.com/r/${SLUG_A}`);
    expect(res.status).toBe(503);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("static files pass without a lookup; robots.txt disallows everything", async () => {
    const js = await get("https://reports.agency-a.com/_next/static/chunks/app.js");
    expect(passes(js)).toBe(true);
    expect(js.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const robots = await get("https://reports.agency-a.com/robots.txt");
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(queries).toEqual([]);
  });

  it("caches the domain lookup briefly (reports are looked up every time)", async () => {
    expect(passes(await get(`https://reports.cache-check.com/r/${SLUG_B}`))).toBe(true);
    expect(passes(await get(`https://reports.cache-check.com/r/${SLUG_B}`))).toBe(true);
    expect(queries.filter((q) => q.startsWith("workspace_domains"))).toHaveLength(1);
    expect(queries.filter((q) => q.startsWith("reports"))).toHaveLength(2);
  });
});

describe("matcher (compiled by Next's own code)", async () => {
  // Next's internals ship without type declarations for these exports.
  const { MiddlewareConfigInputSchema } = (await import("next/dist/build/segment-config/middleware/middleware-config")) as unknown as {
    MiddlewareConfigInputSchema: { safeParse: (v: unknown) => { success: boolean } };
  };
  const { getMiddlewareMatchers } = (await import("next/dist/build/analysis/get-page-static-info")) as unknown as {
    getMiddlewareMatchers: (matcher: unknown, nextConfig: object) => unknown[];
  };
  const { getMiddlewareRouteMatcher } = (await import("next/dist/shared/lib/router/utils/middleware-route-matcher")) as unknown as {
    getMiddlewareRouteMatcher: (matchers: unknown[]) => (pathname: string, req: unknown, query: object) => boolean;
  };

  it("is a valid proxy config", () => {
    expect(MiddlewareConfigInputSchema.safeParse(config).success).toBe(true);
  });

  const matches = getMiddlewareRouteMatcher(getMiddlewareMatchers(config.matcher, {}));
  const runs = (host: string, path: string) => matches(path, { headers: { host } } as never, {});

  it("on the main site, the proxy runs on exactly the old paths", () => {
    for (const host of ["rankbyai.live", "www.rankbyai.live", "rankbyai-preview.vercel.app", "localhost:3100", "127.0.0.1:3100", "RANKBYAI.LIVE"]) {
      for (const p of ["/app", "/app/settings", "/admin", "/free-check/x", `/r/${SLUG_A}`, "/ai/dentist/austin", "/oauth/authorize"]) expect(runs(host, p), `${host}${p}`).toBe(true);
      for (const p of ["/", "/login", "/pricing", "/api/scans", "/_next/static/chunks/a.js", "/robots.txt", "/oauth/token", "/oauth/authorize/decision", "/.well-known/oauth-authorization-server"]) expect(runs(host, p), `${host}${p}`).toBe(false);
    }
  });

  it("the in-code gate for old paths agrees with Next's compiled old matcher, transport forms included", async () => {
    const { isPrimaryProxyPath } = await import("@/lib/domains");
    const legacy = getMiddlewareRouteMatcher(getMiddlewareMatchers((config.matcher as unknown[]).filter((m) => typeof m === "string"), {}));
    const paths = [
      "/", "/login", "/app", "/app/", "/app.rsc", "/app.json", "/app.segments/_tree.segment.rsc", "/app/settings/branding.rsc",
      "/app/settings.segments/$d$x/__PAGE__.segment.rsc", "/application", "/app.foo", "/admin", "/admin.rsc", "/free-check", "/free-check/x.rsc",
      "/r", `/r/${SLUG_A}`, `/r/${SLUG_A}.rsc`, `/r/${SLUG_A}.segments/_tree.segment.rsc`, `/r/${SLUG_A}/opengraph-image`,
      "/ai", "/ai/x", "/ai/x/y", "/ai/x/y/", "/ai/x/y.rsc", "/ai/x/y.segments/_tree.segment.rsc", "/ai/x/y/z",
      "/_next/data/build123/app.json", "/_next/data/build123/pricing.json", "/_next/static/chunks/a.js", "/api/scans",
      "/oauth/authorize", "/oauth/authorize.rsc", "/oauth/authorize/decision", "/oauth/token", "/oauth",
    ];
    for (const p of paths) {
      const next = legacy(p, { headers: { host: "rankbyai.live" } } as never, {});
      expect(isPrimaryProxyPath(p), p).toBe(next);
      // The adapter strips ".rsc" before the proxy function sees the path.
      expect(isPrimaryProxyPath(p.replace(/\.rsc($|\?)/, "$1")), `${p} (normalised)`).toBe(next);
    }
  });

  it("on a custom domain, the proxy runs on every path", () => {
    for (const host of ["reports.agency-a.com", "reports.agency-a.com:443", "rankbyai.live.agency.com", "x.vercel.app.agency.com"]) {
      for (const p of ["/", "/login", "/app", "/api/scans", "/_next/static/chunks/a.js", "/robots.txt", `/r/${SLUG_A}`, "/favicon.ico"]) {
        expect(runs(host, p), `${host}${p}`).toBe(true);
      }
    }
  });
});
