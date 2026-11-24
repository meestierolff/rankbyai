import { findCity } from "@/lib/ai-index/data";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthConfigured, neonAuth } from "@/lib/auth-neon/server";
import { mintDbToken } from "@/lib/db/tokens";
import {
  customDomainOutcome, isFirstPartyHost, isPrimaryProxyPath, normalizeHost, primaryHostOf,
  type CustomDomainOutcome, type DomainHit, type Lookup,
} from "@/lib/domains";

/** Self-contained 404 page in the brand colours (the proxy cannot render React pages). */
const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Report not found | RankbyAI</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;background:#0b0b0b;color:#f5f5f5;font-family:Geist,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased">
<main style="max-width:640px;margin:0 auto;padding:32px">
<p style="margin:0 0 16px;font:500 13px ui-monospace,Menlo,monospace;color:#8a8a8a">404</p>
<h1 style="margin:0 0 16px;font-size:clamp(30px,5vw,48px);line-height:1.05;letter-spacing:-0.04em;font-weight:600">This report link is not active.</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.5;color:#a1a1a1">The link may have been revoked or replaced by whoever shared it with you. Ask them for the current link.</p>
<a href="/" style="color:#f5f5f5;font-weight:600;text-underline-offset:3px">rankbyai.live</a>
</main></body></html>`;

/** The same 404 on a custom domain, without naming or linking the main site (the page is white-label). */
const CUSTOM_NOT_FOUND_HTML = NOT_FOUND_HTML.replace("Report not found | RankbyAI", "Report not found").replace(
  `<a href="/" style="color:#f5f5f5;font-weight:600;text-underline-offset:3px">rankbyai.live</a>`,
  "",
);
const CUSTOM_UNAVAILABLE_HTML = CUSTOM_NOT_FOUND_HTML.replace("<p style=\"margin:0 0 16px;font:500 13px ui-monospace,Menlo,monospace;color:#8a8a8a\">404</p>", "<p style=\"margin:0 0 16px;font:500 13px ui-monospace,Menlo,monospace;color:#8a8a8a\">503</p>")
  .replace("Report not found", "Report unavailable")
  .replace("This report link is not active.", "This report could not be loaded.")
  .replace("The link may have been revoked or replaced by whoever shared it with you. Ask them for the current link.", "Try again in a minute.");
/** Custom domains serve reports for clients, never pages for search engines. */
const NOINDEX = "noindex, nofollow";

/**
 * Share links: decide 404 here, before rendering starts. A page that streams has already answered
 * 200 by the time its lookup finishes, and a revoked or unknown link must return a real 404.
 * Returns the report's workspace (custom domains serve only their own workspace's reports),
 * false when there is no such live report, null when the lookup failed.
 */
async function reportExists(slug: string): Promise<Lookup<{ workspaceId: string | null }>> {
  const url = process.env.DATA_API_URL;
  if (!url || !process.env.DATA_API_JWT_PRIVATE_JWK) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/reports?select=id,workspace_id&share_slug=eq.${encodeURIComponent(slug)}&revoked=eq.false&limit=1`, {
      headers: { Authorization: `Bearer ${await mintDbToken("service_role")}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { workspace_id?: string | null }[];
    return rows.length > 0 ? { workspaceId: rows[0].workspace_id ?? null } : false;
  } catch {
    return null; // on the main site a lookup failure lets the page decide; a custom domain answers 503
  }
}

/**
 * Active custom domains by hostname, cached briefly in this proxy instance. Definite answers are
 * cached (found or not found); failures are not. A removed domain can keep answering here for up to
 * DOMAIN_TTL_MS, and Vercel stops routing it to this project as soon as it is removed there.
 */
const DOMAIN_TTL_MS = 60_000;
const DOMAIN_CACHE_MAX = 500;
const domainCache = new Map<string, { value: DomainHit | false; until: number }>();

async function lookupDomain(hostname: string): Promise<Lookup<DomainHit>> {
  const hit = domainCache.get(hostname);
  if (hit && hit.until > Date.now()) return hit.value;
  const url = process.env.DATA_API_URL;
  if (!url || !process.env.DATA_API_JWT_PRIVATE_JWK) return null;
  let value: DomainHit | false;
  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/workspace_domains?select=workspace_id,workspaces(brand_website,plan)&hostname=eq.${encodeURIComponent(hostname)}&status=eq.active&limit=1`,
      { headers: { Authorization: `Bearer ${await mintDbToken("service_role")}` }, cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    type Ws = { brand_website: string | null; plan: string };
    const rows = (await res.json()) as { workspace_id: string; workspaces: Ws | Ws[] | null }[];
    const row = rows[0];
    const ws = row ? (Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces) : null;
    value = row?.workspace_id ? { workspaceId: row.workspace_id, website: ws?.brand_website ?? null, lifetime: ws?.plan === "lifetime" } : false;
  } catch {
    return null;
  }
  if (domainCache.size >= DOMAIN_CACHE_MAX) domainCache.delete(domainCache.keys().next().value!);
  domainCache.set(hostname, { value, until: Date.now() + DOMAIN_TTL_MS });
  return value;
}

/** Every response on a custom domain: only reports of the domain's own workspace, never indexed. */
async function customDomainResponse(request: NextRequest, hostname: string): Promise<NextResponse> {
  const outcome: CustomDomainOutcome = await customDomainOutcome(hostname, request.nextUrl.pathname, { domain: lookupDomain, report: reportExists });
  const html = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
  let response: NextResponse;
  switch (outcome.type) {
    case "next":
      response = NextResponse.next({ request });
      break;
    case "robots":
      response = new NextResponse("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
      break;
    case "redirect":
      response = new NextResponse(null, { status: 302, headers: { Location: outcome.location, "Cache-Control": "no-store" } });
      break;
    case "unavailable":
      response = new NextResponse(CUSTOM_UNAVAILABLE_HTML, { status: 503, headers: { ...html, "Retry-After": "30" } });
      break;
    case "not_found":
      response = new NextResponse(CUSTOM_NOT_FOUND_HTML, { status: 404, headers: html });
      break;
  }
  response.headers.set("X-Robots-Tag", NOINDEX);
  return response;
}

async function regionalExists(niche: string, city: string): Promise<boolean | null> {
  const url = process.env.DATA_API_URL;
  if (!url || !process.env.DATA_API_JWT_PRIVATE_JWK) return false;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/regional_pages?select=id&niche_slug=eq.${niche}&city_slug=eq.${city}&limit=1`, {
      headers: { Authorization: `Bearer ${await mintDbToken("anonymous")}` }, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as unknown[]).length > 0;
  } catch {
    return null;
  }
}

/**
 * 0. Custom report domains (any host that is not the main site, its www, a *.vercel.app address or
 *    localhost): only that workspace's reports and static files; everything else 404s. See lib/domains.
 * 1. Share links: real 404s.
 * 2. /app, /admin, /free-check/run (the signed-in free check, kept for links issued before the public
 *    check), the OAuth consent page (/oauth/authorize) and AppSumo redemption (/redeem): signed-out visitors go
 *    to /login (keeping where they wanted to go), the session cookie is refreshed, and the verifier a
 *    Google sign-in returns with becomes the session cookie. Every page and route authorises again.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const host = normalizeHost(request.headers.get("host") ?? request.nextUrl.host);
  if (!isFirstPartyHost(host, primaryHostOf())) return customDomainResponse(request, host);
  // Snapshot city records: decide before PPR sends a 200 shell for an unknown URL.
  const indexCity = path.match(/^\/ai-index\/seo-agencies\/([^/]+)\/([^/]+)\/?$/);
  if (indexCity) {
    if (!findCity(indexCity[1], indexCity[2])) {
      return new NextResponse(NOT_FOUND_HTML.replace("Report not found", "City record not found").replace("This report link is not active.", "This city record is not available.").replace("The link may have been revoked or replaced by whoever shared it with you. Ask them for the current link.", "Visit the SEO Agency AI Index to see the published snapshot."), {
        status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next({ request });
  }
  // The main site: exactly the old behaviour, on exactly the old paths. The custom-domain matcher
  // entry below skips first-party hosts, but if one reaches us anyway, leave the request alone.
  if (!isPrimaryProxyPath(path)) return NextResponse.next();

  // A report and its public files (PDF, link-preview images, the email-teaser image): never sent to the sign-in check below,
  // which would redirect a signed-out lead to /login. An unknown or revoked slug is a real 404.
  const reportMatch = path.match(/^\/r\/([^/]+)(?:\/(?:pdf|pitch-image|opengraph-image[\w-]*|twitter-image[\w-]*))?\/?$/);
  if (reportMatch) {
    const slug = reportMatch[1];
    const ok = /^[A-Za-z0-9_-]{12,64}$/.test(slug) ? await reportExists(slug) : false;
    // Answer directly: a rewrite to a prerendered page would be served from cache with status 200.
    if (ok === false) {
      return new NextResponse(NOT_FOUND_HTML, {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next({ request });
  }

  // Regional pages: same reason as share links. An unknown niche/city must answer 404, not 200.
  const regional = path.match(/^\/ai\/([^/]+)\/([^/]+)\/?$/);
  if (regional) {
    const ok = /^[a-z0-9-]{1,60}$/.test(regional[1]) && /^[a-z0-9-]{1,60}$/.test(regional[2]) ? await regionalExists(regional[1], regional[2]) : false;
    if (ok === false) {
      return new NextResponse(NOT_FOUND_HTML.replace("Report not found", "Page not found").replace("This report link is not active.", "There is no page for this niche and city yet.").replace("The link may have been revoked or replaced by whoever shared it with you. Ask them for the current link.", "Regional pages appear once enough scans exist for a niche in a city."), {
        status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next({ request });
  }
  if (path.startsWith("/ai")) return NextResponse.next({ request });

  if (!isAuthConfigured()) return NextResponse.next({ request });

  const response = await neonAuth().middleware({ loginUrl: "/login" })(request);
  // The SDK redirects signed-out visitors to /login; add the place they were heading to.
  const location = response.headers.get("location");
  if (location && response.status >= 300 && response.status < 400) {
    const target = new URL(location, request.url);
    if (target.pathname === "/login" && !target.searchParams.has("next")) {
      target.searchParams.set("next", path + request.nextUrl.search);
      return NextResponse.redirect(target);
    }
  }
  return response;
}

export const config = {
  matcher: [
    "/ai-index/seo-agencies/:country/:city", "/app/:path*", "/admin/:path*", "/free-check/run/:path*", "/r/:path*", "/ai/:niche/:city", "/oauth/authorize", "/redeem",
    // Custom report domains: every path, on every host except the first-party ones. Values are
    // matched as ^value$ against the lower-case host without its port, and must be literals (the
    // matcher is read at build time). Keep in step with isFirstPartyHost in lib/domains.ts; the
    // proxy checks the host again itself, so a first-party host listed here only saves invocations.
    {
      source: "/:path*",
      missing: [
        { type: "host", value: "rankbyai\\.live" },
        { type: "host", value: "www\\.rankbyai\\.live" },
        { type: "host", value: "[a-z0-9.-]+\\.vercel\\.app" },
        { type: "host", value: "localhost" },
        { type: "host", value: "[a-z0-9.-]+\\.localhost" },
        { type: "host", value: "127\\.0\\.0\\.1" },
      ],
    },
  ],
};
