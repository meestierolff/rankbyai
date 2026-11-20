import { attributionFromCookieHeader } from "@/lib/attribution";
import { getSessionContext } from "@/lib/auth";
import { claimSignupConversion } from "@/lib/conversions-server";

/**
 * Asked once per browser session by the app (components/analytics/signup-conversion.tsx). `first` is
 * true exactly once per new account, and the campaign attribution in the rb_attr cookie (kept only with
 * consent) is stored on the profile in the same write. PostHog's signup_completed stays server-side (lib/auth).
 */
export async function POST(request: Request) {
  const ctx = await getSessionContext();
  const headers = { "Cache-Control": "no-store" };
  if (!ctx) return Response.json({ first: false }, { status: 401, headers });
  const result = await claimSignupConversion(ctx.user.id, attributionFromCookieHeader(request.headers.get("cookie"))).catch(() => ({ first: false }));
  return Response.json(result, { headers });
}
