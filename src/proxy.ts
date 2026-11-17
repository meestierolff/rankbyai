import { NextResponse, type NextRequest } from "next/server";
import { isAuthConfigured, neonAuth } from "@/lib/auth-neon/server";
import { mintDbToken } from "@/lib/db/tokens";

/** Self-contained 404 page in the brand colours (the proxy cannot render React pages). */
const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Report not found | RankbyAI</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;background:#0b0b0b;color:#f5f5f5;font-family:Geist,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased">
<main style="max-width:640px;margin:0 auto;padding:32px">
<p style="margin:0 0 16px;font:500 13px ui-monospace,Menlo,monospace;color:#8a8a8a">404</p>
<h1 style="margin:0 0 16px;font-size:clamp(30px,5vw,48px);line-height:1.05;letter-spacing:-0.04em;font-weight:600">This report link is not active.</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.5;color:#a1a1a1">The link may have been revoked or replaced by whoever shared it with you. Ask them for the current link.</p>
<a href="/" style="color:#f5f5f5;font-weight:600;text-underline-offset:3px">rankbyai.live</a>
</main></body></html>`;

/**
 * Share links: decide 404 here, before rendering starts. A page that streams has already answered
 * 200 by the time its lookup finishes, and a revoked or unknown link must return a real 404.
 */
async function reportExists(slug: string): Promise<boolean | null> {
  const url = process.env.DATA_API_URL;
  if (!url || !process.env.DATA_API_JWT_PRIVATE_JWK) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/reports?select=id&share_slug=eq.${encodeURIComponent(slug)}&revoked=eq.false&limit=1`, {
      headers: { Authorization: `Bearer ${await mintDbToken("service_role")}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as unknown[]).length > 0;
  } catch {
    return null; // on a lookup failure, let the page decide
  }
}

/**
 * 1. Share links: real 404s.
 * 2. /app, /admin, /free-check: signed-out visitors go to /login (keeping where they wanted to go),
 *    and the session cookie is refreshed. Every page and route authorises again on its own.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const reportMatch = path.match(/^\/r\/([^/]+)\/?$/);
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
  matcher: ["/app/:path*", "/admin/:path*", "/free-check/:path*", "/r/:path*"],
};
