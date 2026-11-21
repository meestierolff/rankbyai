import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkCustomHostname, customDomainOutcome, customDomainRoute, isFirstPartyHost, isPrimaryProxyPath, normalizeHost, reportOrigin, reportUrl,
  websiteRedirect, type CustomDomainLookups, type DomainHit, type Lookup,
} from "@/lib/domains";

/**
 * Custom report domains, without a database or Vercel. The proxy's decision is a pure function with
 * the lookups passed in, so tenant isolation is pinned down here: a domain serves only its own
 * workspace's reports, and a failed lookup never lets a request through.
 */
const SITE = "https://rankbyai.live";
const PRIMARY = "rankbyai.live";
const WS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SLUG_A = "slugOfAgencyA_01";
const SLUG_B = "slugOfAgencyB_02";

describe("report links", () => {
  it("use the custom domain only once it is active", () => {
    expect(reportUrl(SLUG_A, { hostname: "reports.agency.com", status: "active" }, SITE)).toBe(`https://reports.agency.com/r/${SLUG_A}`);
    for (const status of ["pending", "verifying", "error"] as const) {
      expect(reportUrl(SLUG_A, { hostname: "reports.agency.com", status }, SITE)).toBe(`${SITE}/r/${SLUG_A}`);
    }
    expect(reportUrl(SLUG_A, null, SITE)).toBe(`${SITE}/r/${SLUG_A}`);
    expect(reportUrl(SLUG_A, undefined, `${SITE}/`)).toBe(`${SITE}/r/${SLUG_A}`);
    expect(reportOrigin({ hostname: "reports.agency.com", status: "active" }, SITE)).toBe("https://reports.agency.com");
  });
});

describe("hostname check", () => {
  const ok = (input: string) => checkCustomHostname(input, PRIMARY);

  it("accepts a subdomain and normalises what people paste", () => {
    expect(ok("reports.agency.com")).toEqual({ ok: true, hostname: "reports.agency.com" });
    expect(ok("  https://Reports.Agency.com/r/abc?x=1 ")).toEqual({ ok: true, hostname: "reports.agency.com" });
    expect(ok("reports.agency.com.")).toEqual({ ok: true, hostname: "reports.agency.com" });
    expect(ok("reports.agency.com:443")).toEqual({ ok: true, hostname: "reports.agency.com" });
    expect(ok("reports.agency.co.uk")).toEqual({ ok: true, hostname: "reports.agency.co.uk" });
    expect(ok("a.b.agency.io")).toEqual({ ok: true, hostname: "a.b.agency.io" });
    expect(ok("rapporten.bürobüro.de")).toEqual({ ok: true, hostname: "rapporten.xn--brobro-3yad.de" });
  });

  it("refuses main (apex) domains, including two-part endings", () => {
    for (const input of ["agency.com", "agency.co.uk", "agency.com.au", "agency.co.nz"]) expect(ok(input).ok, input).toBe(false);
  });

  it("refuses our own domains, Vercel's, local names and IP addresses", () => {
    for (const input of [
      "rankbyai.live", "www.rankbyai.live", "reports.rankbyai.live", "x.rankbyai.live.agency.com",
      "vercel.app", "rankbyai.vercel.app", "a.b.vercel.app", "reports.vercel.app.agency.com", "x.vercel.com", "x.vercel-dns.com",
      "localhost", "reports.localhost", "app.local", "reports.agency.test", "reports.example",
      "127.0.0.1", "10.0.0.1", "[::1]", "http://192.168.1.10/",
      "", "   ", "*.agency.com", "reports..agency.com", "-reports.agency.com", "reports_x.agency.com", "user@reports.agency.com",
      `${"a".repeat(64)}.agency.com`,
    ]) {
      expect(ok(input).ok, input).toBe(false);
    }
  });

  it("refuses the configured primary host even when it is not rankbyai.live", () => {
    expect(checkCustomHostname("app.otherprimary.com", "otherprimary.com").ok).toBe(false);
    expect(checkCustomHostname("reports.agency.com", "otherprimary.com").ok).toBe(true);
  });
});

describe("which hosts are first-party", () => {
  it("main host, www, *.vercel.app and localhost are the full site; everything else is a custom domain", () => {
    for (const h of ["rankbyai.live", "www.rankbyai.live", "rankbyai-preview.vercel.app", "rankbyai-git-x-team.vercel.app", "localhost", "127.0.0.1", "app.localhost", "[::1]", ""]) {
      expect(isFirstPartyHost(h, PRIMARY), h).toBe(true);
    }
    for (const h of ["reports.agency.com", "rankbyai.live.agency.com", "evilrankbyai.live", "vercel.app.agency.com", "reports.rankbyai.live"]) {
      expect(isFirstPartyHost(h, PRIMARY), h).toBe(false);
    }
  });

  it("normalises the Host header", () => {
    expect(normalizeHost("Reports.Agency.com:443")).toBe("reports.agency.com");
    expect(normalizeHost("rankbyai.live.")).toBe("rankbyai.live");
    expect(normalizeHost("[::1]:3100")).toBe("[::1]");
    expect(normalizeHost(null)).toBe("");
  });

  it("the old proxy paths are exactly the old matcher", () => {
    for (const p of ["/app", "/app/settings/branding", "/admin", "/free-check/run", "/r", `/r/${SLUG_A}`, "/ai/dentist/austin", "/ai/dentist/austin/"]) expect(isPrimaryProxyPath(p), p).toBe(true);
    for (const p of ["/", "/login", "/free-check", "/free-check/unsubscribe", "/api/scans", "/application", "/app.foo", "/ai", "/ai/dentist", "/ai/a/b/c", "/pricing", "/robots.txt", "/_next/static/x.js"]) expect(isPrimaryProxyPath(p), p).toBe(false);
  });
});

describe("paths on a custom domain (allow-list)", () => {
  it("allows the report, its images and PDF, static files, icons and robots.txt", () => {
    expect(customDomainRoute(`/r/${SLUG_A}`)).toEqual({ kind: "report", slug: SLUG_A });
    expect(customDomainRoute(`/r/${SLUG_A}/`)).toEqual({ kind: "report", slug: SLUG_A });
    expect(customDomainRoute(`/r/${SLUG_A}/opengraph-image`)).toEqual({ kind: "report", slug: SLUG_A });
    expect(customDomainRoute(`/r/${SLUG_A}/opengraph-image-1a2b`)).toEqual({ kind: "report", slug: SLUG_A });
    expect(customDomainRoute(`/r/${SLUG_A}/twitter-image.png`)).toEqual({ kind: "report", slug: SLUG_A });
    expect(customDomainRoute(`/api/reports/${SLUG_A}/pdf`)).toEqual({ kind: "report", slug: SLUG_A });
    expect(customDomainRoute(`/r/${SLUG_A}/pdf`)).toEqual({ kind: "report", slug: SLUG_A });
    expect(customDomainRoute(`/r/${SLUG_A}/pitch-image`)).toEqual({ kind: "report", slug: SLUG_A });
    // Next's transport forms of the report page (RSC payload, segment prefetch).
    expect(customDomainRoute(`/r/${SLUG_A}.rsc`)).toEqual({ kind: "report", slug: SLUG_A });
    expect(customDomainRoute(`/r/${SLUG_A}.segments/_tree.segment.rsc`)).toEqual({ kind: "report", slug: SLUG_A });
    expect(customDomainRoute(`/r/${SLUG_A}.segments/$d$slug/__PAGE__.segment`)).toEqual({ kind: "report", slug: SLUG_A });
    for (const p of ["/_next/static/chunks/app.js", "/_next/static/media/font.woff2", "/_next/image", "/_next/something-new", "/favicon.ico", "/icon.png", "/apple-icon.png", "/icon", "/vendor/maplibre-gl-worker.mjs", "/_vercel/insights/script.js", "/_vercel/insights/view"]) {
      expect(customDomainRoute(p), p).toEqual({ kind: "asset" });
    }
    expect(customDomainRoute("/robots.txt")).toEqual({ kind: "robots" });
    expect(customDomainRoute("/")).toEqual({ kind: "home" });
  });

  it("blocks everything else", () => {
    for (const p of [
      "/app", "/app/settings/branding", "/login", "/admin", "/free-check", "/pricing", "/docs/api", "/sitemap.xml", "/llms.txt",
      "/api/scans", "/api/v1/businesses", "/api/mcp", "/api/domains", "/api/reports/x/pdf", `/api/reports/${SLUG_A}/zip`, "/api/auth/session",
      "/r", "/r/short", `/r/${SLUG_A}/extra`, `/r/${SLUG_A}/opengraph-image/x`, `/r/${SLUG_A}/pitch-image/x`, "/ai/dentist/austin", "/_next/data/build/app.json",
      `/r/%2e%2e/app`, `/_next/static/%2e%2e/%2e%2e/app`, `/_next/static/..%2fapp`, "/opengraph-image", "/.well-known/jwks.json",
      `/r/${SLUG_A}.json`, `/r/${SLUG_A}.segments`, "/r/short.rsc", "/vendor", "/vendor/", "/vendor/other.mjs", "/vendor/maplibre-gl-worker.mjs.map", "/_vercel/speed-insights/script.js", "/_vercel/insights/", "/_vercel/insights/../app",
    ]) {
      expect(customDomainRoute(p).kind, p).toBe("blocked");
    }
  });
});

describe("the proxy decision on a custom domain", () => {
  const domains: Record<string, DomainHit> = {
    "reports.agency-a.com": { workspaceId: WS_A, website: "https://agency-a.com/", lifetime: true },
    "reports.agency-b.com": { workspaceId: WS_B, website: null, lifetime: true },
    "reports.lapsed.com": { workspaceId: WS_B, website: "https://lapsed.com", lifetime: false },
    "reports.loop.com": { workspaceId: WS_A, website: "https://reports.loop.com/home", lifetime: true },
  };
  const reports: Record<string, { workspaceId: string | null }> = {
    [SLUG_A]: { workspaceId: WS_A },
    [SLUG_B]: { workspaceId: WS_B },
    freeCheckSlug_01: { workspaceId: null },
  };
  const lookups = (over: Partial<CustomDomainLookups> = {}) => {
    const calls = { domain: 0, report: 0 };
    const l: CustomDomainLookups = {
      domain: async (h): Promise<Lookup<DomainHit>> => (calls.domain++, domains[h] ?? false),
      report: async (s) => (calls.report++, reports[s] ?? false),
      ...over,
    };
    return { l, calls };
  };

  it("serves a report only on its own workspace's domain", async () => {
    const { l } = lookups();
    expect(await customDomainOutcome("reports.agency-a.com", `/r/${SLUG_A}`, l)).toEqual({ type: "next" });
    expect(await customDomainOutcome("reports.agency-a.com", `/r/${SLUG_B}`, l)).toEqual({ type: "not_found" });
    expect(await customDomainOutcome("reports.agency-b.com", `/r/${SLUG_A}`, l)).toEqual({ type: "not_found" });
    expect(await customDomainOutcome("reports.agency-b.com", `/r/${SLUG_B}`, l)).toEqual({ type: "next" });
    expect(await customDomainOutcome("reports.agency-a.com", `/api/reports/${SLUG_B}/pdf`, l)).toEqual({ type: "not_found" });
    expect(await customDomainOutcome("reports.agency-a.com", `/r/${SLUG_B}/pdf`, l)).toEqual({ type: "not_found" });
    expect(await customDomainOutcome("reports.agency-a.com", `/r/${SLUG_A}/pdf`, l)).toEqual({ type: "next" });
    expect(await customDomainOutcome("reports.agency-a.com", `/r/${SLUG_B}/opengraph-image`, l)).toEqual({ type: "not_found" });
    // Reports without a workspace (free checks) belong to no custom domain.
    expect(await customDomainOutcome("reports.agency-a.com", "/r/freeCheckSlug_01", l)).toEqual({ type: "not_found" });
    expect(await customDomainOutcome("reports.agency-a.com", "/r/unknownSlug_99", l)).toEqual({ type: "not_found" });
  });

  it("an unknown, inactive or lapsed domain serves nothing", async () => {
    const { l } = lookups();
    expect(await customDomainOutcome("reports.unknown.com", `/r/${SLUG_A}`, l)).toEqual({ type: "not_found" });
    expect(await customDomainOutcome("reports.unknown.com", "/", l)).toEqual({ type: "not_found" });
    expect(await customDomainOutcome("reports.lapsed.com", `/r/${SLUG_B}`, l)).toEqual({ type: "not_found" });
    expect(await customDomainOutcome("reports.lapsed.com", "/", l)).toEqual({ type: "not_found" });
  });

  it("fails closed: a failed lookup answers 503, never lets the request through", async () => {
    const domainDown = lookups({ domain: async () => null }).l;
    expect(await customDomainOutcome("reports.agency-a.com", `/r/${SLUG_A}`, domainDown)).toEqual({ type: "unavailable" });
    expect(await customDomainOutcome("reports.agency-a.com", "/", domainDown)).toEqual({ type: "unavailable" });
    const reportDown = lookups({ report: async () => null }).l;
    expect(await customDomainOutcome("reports.agency-a.com", `/r/${SLUG_A}`, reportDown)).toEqual({ type: "unavailable" });
    // An unknown domain is a 404 even while the report lookup is down.
    expect(await customDomainOutcome("reports.unknown.com", `/r/${SLUG_A}`, reportDown)).toEqual({ type: "not_found" });
  });

  it("/ redirects to the agency's website when there is one, else 404; never to itself", async () => {
    const { l } = lookups();
    expect(await customDomainOutcome("reports.agency-a.com", "/", l)).toEqual({ type: "redirect", location: "https://agency-a.com/" });
    expect(await customDomainOutcome("reports.agency-b.com", "/", l)).toEqual({ type: "not_found" });
    expect(await customDomainOutcome("reports.loop.com", "/", l)).toEqual({ type: "not_found" });
    expect(websiteRedirect("javascript:alert(1)", "reports.agency-a.com")).toBeNull();
    expect(websiteRedirect("not a url", "reports.agency-a.com")).toBeNull();
  });

  it("app, sign-in and API paths 404 without touching the database; assets pass without a lookup", async () => {
    const { l, calls } = lookups();
    for (const p of ["/app", "/login", "/api/scans", "/api/v1/reports", "/admin", "/pricing"]) {
      expect(await customDomainOutcome("reports.agency-a.com", p, l), p).toEqual({ type: "not_found" });
    }
    expect(await customDomainOutcome("reports.agency-a.com", "/_next/static/chunks/a.js", l)).toEqual({ type: "next" });
    expect(await customDomainOutcome("reports.agency-a.com", "/robots.txt", l)).toEqual({ type: "robots" });
    expect(calls).toEqual({ domain: 0, report: 0 });
  });
});

describe("Vercel client (mocked; no real token, no real API)", () => {
  const TOKEN = "test-token-not-real-0000";
  const sent: { url: URL; method: string; auth: string | null; body: string | null }[] = [];
  let answer: (url: URL, method: string) => { status: number; body: unknown } = () => ({ status: 500, body: {} });

  beforeEach(() => {
    sent.length = 0;
    vi.stubEnv("VERCEL_API_TOKEN", TOKEN);
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_test");
    vi.stubEnv("VERCEL_TEAM_ID", "team_test");
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      sent.push({ url, method, auth: new Headers(init?.headers).get("authorization"), body: (init?.body as string) ?? null });
      const a = answer(url, method);
      return new Response(JSON.stringify(a.body), { status: a.status, headers: { "Content-Type": "application/json" } });
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const domainBody = (over: object = {}) => ({ name: "reports.agency.com", apexName: "agency.com", projectId: "prj_test", verified: true, verification: [], ...over });

  it("adds the domain to the configured project and team, and never logs the token", async () => {
    const logs: string[] = [];
    for (const k of ["log", "warn", "error", "info"] as const) vi.spyOn(console, k).mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
    const { addProjectDomain } = await import("@/lib/vercel-domains");
    answer = () => ({ status: 200, body: domainBody() });
    const res = await addProjectDomain("reports.agency.com");
    expect(res.kind).toBe("added");
    expect(sent[0].method).toBe("POST");
    expect(sent[0].url.origin + sent[0].url.pathname).toBe("https://api.vercel.com/v10/projects/prj_test/domains");
    expect(sent[0].url.searchParams.get("teamId")).toBe("team_test");
    expect(sent[0].auth).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(sent[0].body!)).toEqual({ name: "reports.agency.com" });

    answer = () => ({ status: 403, body: { error: { code: "forbidden", message: "Not authorized", invalidToken: true } } });
    await expect(addProjectDomain("reports.agency.com")).rejects.toThrow(/Vercel/);
    expect(logs.join("\n")).not.toContain(TOKEN);
  });

  it("a domain in use elsewhere is 'taken'; an invalid one is 'refused'; neither is adopted", async () => {
    const { addProjectDomain } = await import("@/lib/vercel-domains");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    answer = () => ({ status: 409, body: { error: { code: "domain_already_in_use" } } });
    expect(await addProjectDomain("reports.agency.com")).toEqual({ kind: "taken" });
    // 400 is both "already on the project" and "not valid": the client asks which.
    answer = (_u, m) => (m === "POST" ? { status: 400, body: { error: { code: "bad_request" } } } : { status: 200, body: domainBody() });
    expect(await addProjectDomain("reports.agency.com")).toEqual({ kind: "taken" });
    answer = (_u, m) => (m === "POST" ? { status: 400, body: { error: { code: "invalid_domain" } } } : { status: 404, body: {} });
    expect(await addProjectDomain("reports.agency.com")).toEqual({ kind: "refused" });
    expect(sent.every((s) => s.method !== "DELETE")).toBe(true);
  });

  it("reads the DNS target for this project and treats a missing domain as gone", async () => {
    const { getDomainConfig, getProjectDomain, removeProjectDomain } = await import("@/lib/vercel-domains");
    answer = () => ({ status: 200, body: { misconfigured: true, configuredBy: null, acceptedChallenges: [], recommendedIPv4: [], recommendedCNAME: [{ rank: 1, value: "abc.vercel-dns-017.com." }] } });
    const config = await getDomainConfig("reports.agency.com");
    expect(config?.recommendedCNAME[0].value).toBe("abc.vercel-dns-017.com.");
    expect(sent[0].url.pathname).toBe("/v6/domains/reports.agency.com/config");
    expect(sent[0].url.searchParams.get("projectIdOrName")).toBe("prj_test");
    answer = () => ({ status: 404, body: { error: { code: "not_found" } } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getProjectDomain("reports.agency.com")).toBeNull();
    expect(await removeProjectDomain("reports.agency.com")).toBe(true);
    expect(sent.at(-1)?.method).toBe("DELETE");
    expect(sent.at(-1)?.url.pathname).toBe("/v9/projects/prj_test/domains/reports.agency.com");
  });

  it("a network failure is 'try again', not 'not found'", async () => {
    const { getProjectDomain, VercelUnavailableError } = await import("@/lib/vercel-domains");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(getProjectDomain("reports.agency.com")).rejects.toBeInstanceOf(VercelUnavailableError);
  });

  it("refuses to run without the three variables", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", "");
    vi.resetModules();
    const { getProjectDomain } = await import("@/lib/vercel-domains");
    const { MissingEnvError } = await import("@/lib/env");
    await expect(getProjectDomain("reports.agency.com")).rejects.toBeInstanceOf(MissingEnvError);
    expect(sent).toHaveLength(0);
    vi.resetModules();
  });
});

describe("status and records from Vercel's answers", () => {
  it("active only when verified AND the DNS record is in place; the CNAME is the rank-1 target, as returned", async () => {
    const { domainState } = await import("@/lib/vercel-domains");
    const project = { name: "reports.agency.com", apexName: "agency.com", verified: true, verification: [] };
    const cname = [{ rank: 2, value: "cname.vercel-dns.com." }, { rank: 1, value: "d1d4fc82.vercel-dns-017.com." }];
    expect(domainState("reports.agency.com", project, { misconfigured: true, recommendedCNAME: cname })).toEqual({
      status: "pending",
      records: [{ type: "CNAME", name: "reports", host: "reports.agency.com", value: "d1d4fc82.vercel-dns-017.com" }],
    });
    expect(domainState("reports.agency.com", project, { misconfigured: false, recommendedCNAME: cname }).status).toBe("active");
    // No configuration from Vercel: no guessed record, and not active.
    expect(domainState("reports.agency.com", project, null)).toEqual({ status: "pending", records: [] });
  });

  it("shows Vercel's TXT challenge while the domain is not verified", async () => {
    const { domainState } = await import("@/lib/vercel-domains");
    const project = {
      name: "reports.agency.com", apexName: "agency.com", verified: false,
      verification: [{ type: "TXT", domain: "_vercel.agency.com", value: "vc-domain-verify=reports.agency.com,abc123", reason: "pending_domain_verification" }],
    };
    const state = domainState("reports.agency.com", project, { misconfigured: false, recommendedCNAME: [{ rank: 1, value: "x.vercel-dns-017.com" }] });
    expect(state.status).toBe("verifying");
    expect(state.records[1]).toEqual({ type: "TXT", name: "_vercel", host: "_vercel.agency.com", value: "vc-domain-verify=reports.agency.com,abc123", reason: "pending_domain_verification" });
  });
});
