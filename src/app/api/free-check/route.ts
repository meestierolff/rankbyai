import { z } from "zod";
import { publicEnv, supabasePublicEnv } from "@/lib/env";
import { startFreeCheck } from "@/lib/free-check";
import { clientIp } from "@/lib/request";
import { createSupabaseServer } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

const Body = z.object({
  business_name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  turnstile_token: z.string().optional(),
});

/**
 * Step 1 of the free check: bot check, limits, then a magic link. The check itself only runs after the
 * email is verified (step 2, /free-check/run), so the 1-per-email limit applies to real inboxes.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", message: "Enter the business name, its city and your email." }, { status: 400 });
  if (!supabasePublicEnv.isConfigured()) return Response.json({ error: "not_configured", message: "Free checks are not available on this deployment yet." }, { status: 503 });

  const ip = clientIp(request.headers);
  const check = await verifyTurnstile(parsed.data.turnstile_token, ip);
  if (!check.ok) return Response.json({ error: "turnstile_failed", message: "Please complete the anti-bot check." }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  let started;
  try {
    started = await startFreeCheck({ email, ip, businessName: parsed.data.business_name, city: parsed.data.city });
  } catch {
    return Response.json({ error: "not_configured", message: "Free checks are not available right now." }, { status: 503 });
  }
  if (!started.ok) return Response.json({ error: started.error, message: started.message }, { status: started.status });

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${publicEnv.siteUrl}/free-check/run?fc=${started.id}`, shouldCreateUser: true },
  });
  if (error) return Response.json({ error: "email_failed", message: "We could not send the email. Try again in a minute." }, { status: 502 });
  return Response.json({ ok: true });
}
