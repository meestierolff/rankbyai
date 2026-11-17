import "server-only";
import { turnstileEnv } from "@/lib/env";

/**
 * Cloudflare Turnstile verification. When Turnstile is not configured (local dev, previews)
 * verification is skipped and `configured: false` is returned so callers can decide.
 */
export async function verifyTurnstile(token: string | null | undefined, ip?: string | null): Promise<{ ok: boolean; configured: boolean }> {
  if (!turnstileEnv.isConfigured()) return { ok: true, configured: false };
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
