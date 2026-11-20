import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { decide } from "@/lib/oauth/authorize";
import { issuer, oauthOpen } from "@/lib/oauth/config";

const Body = z.object({ ticket: z.string().min(10).max(8000), accept: z.boolean() });

/**
 * The consent page's answer. Same-site JSON only: a cross-site form cannot send application/json
 * without a CORS preflight, which this route never grants, and a foreign Origin is refused outright.
 */
export async function POST(request: Request) {
  if (!oauthOpen()) return err(404, "not_found", "Not found.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(issuer()).origin) return err(403, "forbidden", "Cross-site requests are not allowed.");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return err(415, "unsupported_media_type", "Send JSON.");
  return withSession(async (ctx) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Send the ticket and your answer.");
    const d = await decide(parsed.data.ticket, parsed.data.accept, ctx);
    return d.ok ? json({ redirect: d.redirect }) : err(d.status, d.error, d.message);
  });
}
