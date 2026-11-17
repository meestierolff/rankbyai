import "server-only";
import { turnstileEnv } from "@/lib/env";

/**
 * Cloudflare Turnstile verification. Not configured: skipped in local development and on preview
 * deployments, REJECTED on the production deployment (the control must be active there).
 */
export async function verifyTurnstile(token: string | null | undefined, ip?: string | null): Promise<{ ok: boolean; configured: boolean }> {
  if (!turnstileEnv.isConfigured()) {
    // Fail closed on the production deployment; local development and preview deploys run without it.
    return { ok: process.env.VERCEL_ENV !== "production", configured: false };
  }
  if (!token) return { ok: false, configured: true };
  try {
    const body = new URLSearchParams({ secret: turnstileEnv.get().TURNSTILE_SECRET_KEY, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const json = (await res.json()) as { success?: boolean };
    return { ok: json.success === true, configured: true };
  } catch {
    return { ok: false, configured: true };
  }
}
