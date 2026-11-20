import { CHECK_COOKIE, markCompletedShown, readCookie } from "@/lib/free-check-public";

/**
 * Called by /free-check once the result is on screen. `first` is true exactly once per check, so the
 * page sends free_check_completed (PostHog, GA4, Google Ads) once, never for a check without a result.
 * The response carries only counts, no business data.
 */
export async function POST(request: Request) {
  const shown = await markCompletedShown(readCookie(request.headers.get("cookie"), CHECK_COOKIE)).catch(() => null);
  const headers = { "Cache-Control": "no-store" };
  if (!shown) return Response.json({ first: false }, { status: 404, headers });
  return Response.json(shown, { headers });
}
