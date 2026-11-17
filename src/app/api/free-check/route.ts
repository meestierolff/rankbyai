import { z } from "zod";
import { isAuthConfigured } from "@/lib/auth-neon/server";
import { isDatabaseConfigured } from "@/lib/db/clients";
import { startFreeCheck } from "@/lib/free-check";
import { clientIp } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";

const Body = z.object({
  business_name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  turnstile_token: z.string().optional(),
});

/**
 * Step 1 of the free check: bot check and per-network limit. The check itself runs in step 2
 * (/free-check/run) after Google sign-in, so the 1-per-email limit applies to real, verified accounts.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", message: "Enter the business name and its city." }, { status: 400 });
  if (!isDatabaseConfigured() || !isAuthConfigured()) {
    return Response.json({ error: "not_configured", message: "Free checks are not available on this deployment yet." }, { status: 503 });
  }

  const ip = clientIp(request.headers);
  const check = await verifyTurnstile(parsed.data.turnstile_token, ip);
  if (!check.ok) return Response.json({ error: "turnstile_failed", message: "Please complete the anti-bot check." }, { status: 400 });

  let started;
  try {
    started = await startFreeCheck({ ip, businessName: parsed.data.business_name, city: parsed.data.city });
  } catch {
    return Response.json({ error: "not_configured", message: "Free checks are not available right now." }, { status: 503 });
  }
  if (!started.ok) return Response.json({ error: started.error, message: started.message }, { status: started.status });
  return Response.json({ ok: true, next: `/free-check/run?fc=${started.id}` });
}
