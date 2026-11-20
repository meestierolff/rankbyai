import { publicEnv } from "@/lib/env-public";

/**
 * Custom domains for white-label report links: https://reports.agency.com/r/{slug}.
 *
 * Shared by the proxy, the server routes and client components, so this file holds no secrets,
 * does no I/O and imports nothing server-only. The proxy's decision lives here as pure functions
 * (lookups are passed in), so tenant isolation is unit-tested without a database.
 */

export type DomainStatus = "pending" | "verifying" | "active" | "error";

/** A DNS record the agency must create, as Vercel returned it. `name` is relative to the apex domain. */
export interface DnsRecord {
  type: string;
  /** What most DNS providers ask for in the "Name" or "Host" field, e.g. "reports" or "_vercel". */
  name: string;
  /** The full hostname the record is for. */
  host: string;
  value: string;
  reason?: string;
}

/** What a share link needs to know about the workspace's domain. */
export interface WorkspaceDomain {
  hostname: string;
  status: DomainStatus;
}

/** The origin report links use: the workspace's custom domain once it is active, else the main site. */
export function reportOrigin(domain?: WorkspaceDomain | null, siteUrl: string = publicEnv.siteUrl): string {
  return domain && domain.status === "active" ? `https://${domain.hostname}` : siteUrl.replace(/\/$/, "");
}

/** A report's public URL: on the workspace's active custom domain, otherwise on the main site. */
export function reportUrl(slug: string, domain?: WorkspaceDomain | null, siteUrl: string = publicEnv.siteUrl): string {
  return `${reportOrigin(domain, siteUrl)}/r/${slug}`;
}

// ───────────────────────── hostnames ─────────────────────────

/** Lower case, port and trailing dot removed. "" when there is nothing usable. */
export function normalizeHost(raw: string | null | undefined): string {
  let host = (raw ?? "").trim().toLowerCase();
  if (host.startsWith("[")) host = host.slice(0, host.indexOf("]") + 1); // [::1]:3100
  else host = host.split(":", 1)[0];
  return host.replace(/\.$/, "");
}

/** The main site's hostname, from NEXT_PUBLIC_SITE_URL (or its preview fallback). */
export function primaryHostOf(siteUrl: string = publicEnv.siteUrl): string {
  try {
    return normalizeHost(new URL(siteUrl).host);
  } catch {
    return "";
  }
}

/**
 * Hosts that serve the full site exactly as before custom domains existed: the main host, its www,
 * any *.vercel.app deployment address, and local development. Every other host is a custom domain.
 * A request without a host is treated as first-party (today's behaviour).
 */
export function isFirstPartyHost(host: string, primaryHost: string): boolean {
  if (!host) return true;
  const apex = primaryHost.replace(/^www\./, "");
  return (
    (apex !== "" && (host === apex || host === `www.${apex}`)) ||
    host === "vercel.app" ||
    host.endsWith(".vercel.app") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "[::1]"
  );
}

/**
 * Names an agency may never connect. Matched as substrings, deliberately broad: the proxy matcher
 * in src/proxy.ts skips hosts that look first-party, so such a name must never become a custom
 * domain (it would get the full site instead of reports only).
 */
const BLOCKED_NAMES = ["rankbyai.live", "vercel.app", "vercel.com", "vercel.sh", "vercel-dns.com", "now.sh"];
const RESERVED_TLDS = new Set(["localhost", "local", "test", "example", "invalid", "internal", "lan", "home", "corp", "onion", "arpa", "intranet", "private"]);
/** Common two-part endings in the agencies' markets, so "agency.co.uk" counts as a main domain. Vercel's apexName is the final check. */
const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "ac.uk", "gov.uk", "sch.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "asn.au", "id.au",
  "co.nz", "net.nz", "org.nz", "ac.nz", "govt.nz", "school.nz", "kiwi.nz", "geek.nz", "gen.nz",
  "co.za", "org.za", "co.in", "com.br", "com.mx", "com.sg", "com.hk", "co.jp", "co.kr", "com.tr",
  "com.ar", "com.co", "co.id", "com.my", "com.ph", "com.vn", "co.th", "co.il", "com.cn", "com.tw",
]);
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export type HostnameCheck = { ok: true; hostname: string } | { ok: false; message: string };

/** Check what an agency typed as its report domain. Accepts "https://reports.agency.com/" and returns "reports.agency.com". */
export function checkCustomHostname(input: string, primaryHost: string = primaryHostOf()): HostnameCheck {
  const typed = input.trim();
  if (!typed) return { ok: false, message: "Enter a domain such as reports.youragency.com." };
  if (typed.includes("*")) return { ok: false, message: "Enter one domain, without a *." };
  let raw = typed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/, 1)[0];
  if (raw.includes("@")) return { ok: false, message: "Enter just the domain, such as reports.youragency.com." };
  if (raw.startsWith("[") || /^[0-9.]+(:\d+)?$/.test(raw)) return { ok: false, message: "Use a domain name, not an IP address." };
  raw = raw.replace(/:\d+$/, "");
  let hostname: string;
  try {
    hostname = normalizeHost(new URL(`http://${raw}`).hostname); // lower case, and IDN to punycode
  } catch {
    return { ok: false, message: "That is not a valid domain. Use letters, numbers, dots and dashes." };
  }
  if (/^[0-9.]+$/.test(hostname) || hostname.includes(":")) return { ok: false, message: "Use a domain name, not an IP address." };
  const labels = hostname.split(".");
  if (hostname.length > 253 || labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !TLD.test(labels[labels.length - 1])) {
    return { ok: false, message: "That is not a valid domain. Use letters, numbers, dots and dashes." };
  }
  if (RESERVED_TLDS.has(labels[labels.length - 1])) return { ok: false, message: "Use a public domain you own." };
  const primary = primaryHost.replace(/^www\./, "");
  if (BLOCKED_NAMES.some((name) => hostname.includes(name)) || (primary && (hostname === primary || hostname.endsWith(`.${primary}`)))) {
    return { ok: false, message: "This domain cannot be used. Use a domain your agency owns." };
  }
  const suffixParts = TWO_PART_SUFFIXES.has(labels.slice(-2).join(".")) ? 2 : 1;
  if (labels.length < suffixParts + 2) {
    return { ok: false, message: "Use a subdomain such as reports.youragency.com. Your main domain keeps pointing at your own website." };
  }
  return { ok: true, hostname };
}

// ───────────────────────── proxy decision ─────────────────────────

/**
 * Next compiles every matcher source with optional transport forms: a /_next/data/{build} prefix and
 * a .json, .rsc or .segments/….segment.rsc suffix. The proxy adapter strips only ".rsc", so
 * ".segment" without it is accepted too.
 */
const DATA_PREFIX = String.raw`(?:\/_next\/data\/[^/]+)?`;
const TRANSPORT = String.raw`(?:\.json|\.rsc|\.segments\/.+\.segment(?:\.rsc)?)?`;
const OLD_MATCHER = new RegExp(
  String.raw`^${DATA_PREFIX}(?:\/(?:app|admin|free-check\/run|r)(?:\/.*)?${TRANSPORT}|\/ai\/[^/]+\/[^/]+?${TRANSPORT}|\/oauth\/authorize${TRANSPORT})\/?$`,
);

/**
 * The paths the proxy handles on the main site: its string matchers, as Next compiles them. Pure.
 * /oauth/authorize is among them because the Neon Auth middleware turns the verifier a Google
 * sign-in returns with into the session cookie; without it a signed-out user would loop to /login.
 */
export function isPrimaryProxyPath(path: string): boolean {
  return OLD_MATCHER.test(path);
}

const SLUG = /^[A-Za-z0-9_-]{12,64}$/;

export type CustomDomainRoute =
  | { kind: "asset" }
  | { kind: "robots" }
  | { kind: "home" }
  | { kind: "report"; slug: string }
  | { kind: "blocked" };

/**
 * What a path on a custom domain is. An allow-list: anything not named here is blocked.
 * Allowed: /r/{slug} (with its opengraph/twitter image, its PDF at /r/{slug}/pdf, and Next's
 * .rsc/.segments transport forms), the older PDF route /api/reports/{slug}/pdf, everything under /_next/ except /_next/data/, the icons,
 * the report map's web worker, Vercel Web Analytics (/_vercel/insights/), robots.txt, and /
 * (which may redirect to the agency's website).
 */
export function customDomainRoute(path: string): CustomDomainRoute {
  // Encoded dots, slashes and backslashes, or dot segments: never something a report page asks for.
  if (/%(2e|2f|5c)|\\|\/\.{1,2}(\/|$)/i.test(path)) return { kind: "blocked" };
  if (path === "/") return { kind: "home" };
  if (path === "/robots.txt") return { kind: "robots" };
  // /_next/data/ is the pages router's data route (this app has none); Next can map it onto a page path.
  if (path.startsWith("/_next/")) return path.startsWith("/_next/data/") ? { kind: "blocked" } : { kind: "asset" };
  if (/^\/(favicon\.ico|(apple-)?icon([\w-]*\.(png|ico|svg|jpe?g))?)$/.test(path)) return { kind: "asset" };
  // The report map's web worker, a static file copied to public/vendor at install (scripts/copy-map-worker.mjs).
  if (path === "/vendor/maplibre-gl-worker.mjs") return { kind: "asset" };
  // Vercel Web Analytics: its script and the page-view beacons it sends.
  if (/^\/_vercel\/insights\/[\w./-]+$/.test(path)) return { kind: "asset" };
  const report =
    path.match(/^\/r\/([^/.]+)(?:\/(?:opengraph-image|twitter-image)(?:-[\w-]+)?(?:\.\w+)?|\/pdf|\.rsc|\.segments\/.+\.segment(?:\.rsc)?)?\/?$/) ??
    path.match(/^\/api\/reports\/([^/]+)\/pdf\/?$/);
  if (report) return SLUG.test(report[1]) ? { kind: "report", slug: report[1] } : { kind: "blocked" };
  return { kind: "blocked" };
}

/** An active custom domain, as the proxy looks it up (service role, by hostname). */
export interface DomainHit {
  workspaceId: string;
  /** The agency's own website (brand_website), for redirecting "/". */
  website: string | null;
  /** White-label needs lifetime access; a domain of a workspace without it serves nothing. */
  lifetime: boolean;
}

/** A found value, `false` for a definite "no such row", `null` for a failed lookup (timeout, database down). */
export type Lookup<T> = T | false | null;

export interface CustomDomainLookups {
  domain: (hostname: string) => Promise<Lookup<DomainHit>>;
  report: (slug: string) => Promise<Lookup<{ workspaceId: string | null }>>;
}

export type CustomDomainOutcome =
  | { type: "next" }
  | { type: "robots" }
  | { type: "redirect"; location: string }
  | { type: "not_found" }
  | { type: "unavailable" };

/** "/" on a custom domain goes to the agency's website when it is a real http(s) address on another host. */
export function websiteRedirect(website: string | null, hostname: string): string | null {
  if (!website) return null;
  try {
    const url = new URL(website);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (normalizeHost(url.host) === hostname) return null; // would loop
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * The proxy's answer for a request on a custom domain. Fails closed: a failed lookup never lets the
 * request through, and a report is served only when it belongs to the domain's own workspace.
 */
export async function customDomainOutcome(hostname: string, path: string, lookups: CustomDomainLookups): Promise<CustomDomainOutcome> {
  const route = customDomainRoute(path);
  switch (route.kind) {
    case "asset":
      return { type: "next" };
    case "robots":
      return { type: "robots" };
    case "blocked":
      return { type: "not_found" };
    case "home": {
      const domain = await lookups.domain(hostname);
      if (domain === null) return { type: "unavailable" };
      if (domain === false || !domain.lifetime) return { type: "not_found" };
      const location = websiteRedirect(domain.website, hostname);
      return location ? { type: "redirect", location } : { type: "not_found" };
    }
    case "report": {
      const [domain, report] = await Promise.all([lookups.domain(hostname), lookups.report(route.slug)]);
      if (domain === false || (domain && !domain.lifetime)) return { type: "not_found" };
      if (domain === null || report === null) return { type: "unavailable" };
      if (report === false || !report.workspaceId || report.workspaceId !== domain.workspaceId) return { type: "not_found" };
      return { type: "next" };
    }
  }
}
