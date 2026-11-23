import { getSessionContext } from "@/lib/auth";
import { dbAdmin } from "@/lib/db/clients";
import { publicEnv } from "@/lib/env-public";
import { hashIdentifier } from "@/lib/crypto";
import { clientIp } from "@/lib/request";
import { hashAppSumoCode, normalizeAppSumoCode } from "@/lib/appsumo-codes";

const reply = (status: number, message: string, ok = false) =>
  Response.json({ ok, message }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(publicEnv.siteUrl).origin) return reply(403, "Cross-site requests are not allowed.");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return reply(415, "Send JSON.");
  try {
    const ctx = await getSessionContext();
    if (!ctx) return reply(401, "Sign in before redeeming your code.");
    if (ctx.role !== "owner" || !ctx.user.emailVerified) return reply(403, "A workspace owner with a verified email must redeem the code.");
    const admin = dbAdmin();
    for (const key of [`appsumo:user:${ctx.user.id}`, `appsumo:ip:${hashIdentifier(clientIp(request.headers))}`]) {
      const { data, error } = await admin.rpc("rate_limit_hit", { p_key: key, p_window_seconds: 600, p_limit: 10 });
      if (error) return reply(503, "Redemption is temporarily unavailable. Please try again later.");
      if (!data) return reply(429, "Too many attempts. Please try again in 10 minutes.");
    }
    const body = await request.json().catch(() => null);
    const code = typeof body?.code === "string" && body.code.length <= 100 ? normalizeAppSumoCode(body.code) : null;
    if (!code) return reply(400, "Enter the complete code from your AppSumo purchase.");
    const { data, error } = await admin.rpc("redeem_appsumo_code", {
      p_code_hash: hashAppSumoCode(code), p_workspace_id: ctx.workspace.id, p_user_id: ctx.user.id,
    });
    if (error) return reply(503, "We could not redeem your code. Please try again.");
    if (data?.ok) return reply(200, "Lifetime access is active for this workspace.", true);
    if (data?.error === "already_lifetime") return reply(409, "This workspace already has lifetime access. Your code has not been used.");
    if (data?.error === "forbidden") return reply(403, "Only the workspace owner can redeem a code.");
    return reply(400, "This code is invalid or no longer available. Contact mees@rankbyai.live for help.");
  } catch {
    // Do not log request bodies: they contain bearer credentials.
    return reply(503, "Redemption is temporarily unavailable. Please try again later.");
  }
}
