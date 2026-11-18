import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import { countryFromFreeCheckCookie, runFreeCheck } from "@/lib/free-check";

export const maxDuration = 300;

const Body = z.object({ fc: z.uuid() });

/** Step 2 of the free check: the signed-in (email-verified) user runs it. */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "This link is incomplete. Start the free check again from the home page.");
    if (!ctx.user.email || !ctx.user.emailVerified) return err(403, "email_unverified", "Your Google account email is not verified.");
    const country = countryFromFreeCheckCookie(request.headers.get("cookie"), parsed.data.fc);
    const result = await runFreeCheck({ freeCheckId: parsed.data.fc, userEmail: ctx.user.email, workspaceId: ctx.workspace.id, country });
    if (!result.ok) return err(result.status, result.error, result.message, result.queued ? { queued: true } : {});
    await captureServer("free_check_completed", ctx.workspace.id);
    return json({ ok: true, slug: result.slug });
  });
}
