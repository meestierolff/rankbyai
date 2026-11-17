import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth";
import { captureServer } from "@/lib/analytics-server";
import { createSupabaseServer } from "@/lib/supabase/server";

/** Magic-link landing: verifies the one-time token_hash and starts the session (works across devices). */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  const next = safeNextPath(searchParams.get("next"), "/app");
  const origin = request.nextUrl.origin;

  if (tokenHash) {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user) {
      const createdMsAgo = Date.now() - new Date(data.user.created_at).getTime();
      if (createdMsAgo < 10 * 60_000) await captureServer("signup_completed", data.user.id);
      const target = new URL(next, origin);
      // Defence in depth: the resolved target must stay on this origin.
      return NextResponse.redirect(target.origin === origin ? target : new URL("/app", origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
