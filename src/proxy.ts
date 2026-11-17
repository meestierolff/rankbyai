import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie and keeps signed-out visitors out of /app and /admin.
 * Authorisation itself happens again in every page and route (never trust the proxy alone).
 */
/**
 * Share links: decide 404 here, before rendering starts. A page that streams has already answered
 * 200 by the time its lookup finishes, and a revoked or unknown link must return a real 404.
 */
/** Self-contained 404 page in the brand colours (the proxy cannot render React pages). */
const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Report not found | RankbyAI</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;background:#0b0b0b;color:#f5f5f5;font-family:Geist,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased">
<main style="max-width:640px;margin:0 auto;padding:32px">
<p style="margin:0 0 16px;font:500 13px ui-monospace,Menlo,monospace;color:#8a8a8a">404</p>
<h1 style="margin:0 0 16px;font-size:clamp(30px,5vw,48px);line-height:1.05;letter-spacing:-0.04em;font-weight:600">This report link is not active.</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.5;color:#a1a1a1">The link may have been revoked or replaced by whoever shared it with you. Ask them for the current link.</p>
<a href="/" style="color:#f5f5f5;font-weight:600;text-underline-offset:3px">rankbyai.live</a>
</main></body></html>`;

async function reportExists(slug: string): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/reports?select=id&share_slug=eq.${encodeURIComponent(slug)}&revoked=eq.false&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as unknown[]).length > 0;
  } catch {
    return null; // on a lookup failure, let the page decide
  }
}

export async function proxy(request: NextRequest) {
  const reportMatch = request.nextUrl.pathname.match(/^\/r\/([^/]+)\/?$/);
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPrivate = path.startsWith("/app") || path.startsWith("/admin") || path.startsWith("/free-check");

  if (isPrivate && !data.user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }
  if ((path === "/login" || path === "/signup") && data.user) {
    const next = request.nextUrl.searchParams.get("next");
    const target = request.nextUrl.clone();
    target.pathname = next && next.startsWith("/") && !next.startsWith("//") ? next.split("?")[0] : "/app";
    target.search = "";
    return NextResponse.redirect(target);
  }
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/free-check/:path*", "/r/:path*", "/login", "/signup"],
};
