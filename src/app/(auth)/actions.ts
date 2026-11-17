"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth";
import { publicEnv, supabasePublicEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

export interface MagicLinkState {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
}

const Email = z.email().max(254);

/** Sends a magic link. Same action for /login and /signup: new emails get an account, existing ones sign in. */
export async function sendMagicLink(_prev: MagicLinkState, form: FormData): Promise<MagicLinkState> {
  const parsed = Email.safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  const email = parsed.data;
  const next = safeNextPath(String(form.get("next") ?? ""), "/app");

  if (!supabasePublicEnv.isConfigured()) {
    return { status: "error", message: "Sign-in is not configured on this deployment yet (Supabase environment variables are missing)." };
  }

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;

  const turnstile = await verifyTurnstile(String(form.get("cf-turnstile-response") ?? "") || null, ip);
  if (!turnstile.ok) return { status: "error", message: "Please complete the anti-bot check and try again." };

  // 5 links per email per 15 minutes, 20 per IP per hour.
  try {
    const admin = supabaseAdmin();
    const [byEmail, byIp] = await Promise.all([
      admin.rpc("rate_limit_hit", { p_key: `magic:email:${email}`, p_window_seconds: 900, p_limit: 5 }),
      ip ? admin.rpc("rate_limit_hit", { p_key: `magic:ip:${ip}`, p_window_seconds: 3600, p_limit: 20 }) : Promise.resolve({ data: true }),
    ]);
    if (byEmail.data === false || byIp.data === false) {
      return { status: "error", message: "Too many sign-in emails. Wait a few minutes and try again." };
    }
  } catch {
    // Rate limiting is best-effort here; Supabase Auth also rate-limits email sending.
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${publicEnv.siteUrl}${next}`, shouldCreateUser: true },
  });
  if (error) {
    return { status: "error", message: "We could not send the email. Try again in a minute." };
  }
  return { status: "sent", email };
}
