import { z } from "zod";
import { freeCheckOpen } from "@/lib/availability";
import { DEFAULT_COUNTRY, isCountryCode } from "@/lib/countries";
import { isDatabaseConfigured } from "@/lib/db/clients";
import { turnstileEnv } from "@/lib/env";
import { checkInputProblem } from "@/lib/free-check-input";
import {
  burstLimit, CHECK_COOKIE, checkCookieLine, readCookie, startPublicCheck, VISITOR_COOKIE, visitorCookieLine, visitorSignals,
} from "@/lib/free-check-public";
import { isMockMode } from "@/lib/mock";
import { clientIp } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";

const Body = z.object({
  business_name: z.string().max(400),
  city: z.string().max(400),
  country: z.string().trim().toUpperCase().refine(isCountryCode).default(DEFAULT_COUNTRY),
  turnstile_token: z.string().max(4096).optional(),
});

const refuse = (status: number, error: string, message: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error, message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Starts a free check without an account (lib/free-check-public). Order matters: free checks first
 * (input, configuration, burst limit), then the Turnstile siteverify call, then the per-visitor,
 * per-IP, repeat and budget limits. The check runs in POST /api/free-check/execute, authorised by
 * the httpOnly cookie set here, so the single-use Turnstile token is never needed twice.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refuse(400, "invalid_body", "Enter the business name and its city, and choose its country.");
  const problem = checkInputProblem({ businessName: parsed.data.business_name, city: parsed.data.city });
  if (problem) return refuse(400, "invalid_input", problem);
  if (!isDatabaseConfigured() || !freeCheckOpen()) return refuse(503, "not_configured", "Free checks are not available right now.");
  // Real house keys are in use outside mock mode: never run without bot protection, on any deployment.
  if (!isMockMode() && !turnstileEnv.isConfigured()) return refuse(503, "not_configured", "Free checks are not available on this deployment.");

  const ip = clientIp(request.headers);
  try {
    const limited = await burstLimit(visitorSignals(request.headers, ip));
    if (limited) return refuse(limited.status, limited.error, limited.message);
  } catch {
    return refuse(503, "unavailable", "Free checks are not available right now. Try again in a minute.");
  }

  const bot = await verifyTurnstile(parsed.data.turnstile_token, ip);
  if (!bot.ok) return refuse(400, "turnstile_failed", "Please complete the anti-bot check.");

  const cookies = request.headers.get("cookie");
  let started;
  try {
    started = await startPublicCheck({
      ip, headers: request.headers, visitorId: readCookie(cookies, VISITOR_COOKIE), checkCookie: readCookie(cookies, CHECK_COOKIE),
      businessName: parsed.data.business_name, city: parsed.data.city, country: parsed.data.country,
    });
  } catch {
    return refuse(503, "unavailable", "Free checks are not available right now. Try again in a minute.");
  }
  if (!started.ok) return refuse(started.status, started.error, started.message, started.existing ? { next: "/free-check" } : {});

  const secure = new URL(request.url).protocol === "https:";
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", checkCookieLine(started.id, started.secret, secure));
  headers.append("Set-Cookie", visitorCookieLine(started.visitorId, secure));
  return Response.json({ ok: true, next: "/free-check" }, { headers });
}
