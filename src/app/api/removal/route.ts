import { z } from "zod";
import { dbAdmin } from "@/lib/db/clients";
import { clientIp } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";

const Body = z.object({
  business_name: z.string().trim().min(2).max(200),
  url: z.string().trim().max(500).optional().or(z.literal("")),
  email: z.email().max(254),
  reason: z.string().trim().max(2000).optional().or(z.literal("")),
  turnstile_token: z.string().optional(),
});

/** Public removal/correction requests. Written with the service role only after Turnstile + rate limit. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", message: "Please fill in the business name and a valid email." }, { status: 400 });

  const ip = clientIp(request.headers);
  const check = await verifyTurnstile(parsed.data.turnstile_token, ip);
  if (!check.ok) return Response.json({ error: "turnstile_failed", message: "Please complete the anti-bot check." }, { status: 400 });

  try {
    const admin = dbAdmin();
    // Fail closed: anything other than an explicit "allowed" stops the write.
    const { data: allowed, error: rlError } = await admin.rpc("rate_limit_hit", { p_key: `removal:${ip}`, p_window_seconds: 3600, p_limit: 5 });
    if (rlError || allowed !== true) return Response.json({ error: "rate_limited", message: "Too many requests. Try again later." }, { status: 429 });
    const { error } = await admin.from("removal_requests").insert({
      business_name: parsed.data.business_name,
      url: parsed.data.url || null,
      email: parsed.data.email,
      reason: parsed.data.reason || null,
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "server_error", message: "We could not save your request. Please email us instead." }, { status: 500 });
  }
}
