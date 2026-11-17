import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { dbAdmin } from "@/lib/db/clients";
import { currentUserDb } from "@/lib/db/session";

const Body = z.object({ title: z.string().trim().min(3).max(140), body: z.string().trim().max(4000).optional() });

/** Submit a feature request. Visible to every signed-in user; the author's workspace is not shown. */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Give the request a title of 3 to 140 characters.");
    const { data: allowed } = await dbAdmin().rpc("rate_limit_hit", { p_key: `feature_request:${ctx.workspace.id}`, p_window_seconds: 86_400, p_limit: 10 });
    if (allowed !== true) return err(429, "rate_limited", "You have sent 10 requests today. Try again tomorrow.");
    const db = await currentUserDb();
    const { error } = await db.from("feature_requests").insert({ workspace_id: ctx.workspace.id, title: parsed.data.title, body: parsed.data.body || null });
    if (error) return err(500, "server_error", "The request could not be saved.");
    return json({ ok: true });
  });
}
