import { z } from "zod";
import { err, json, requireOwner, SAVE_FAILED, unavailable, withSession } from "@/lib/api";
import { currentUserDb } from "@/lib/db/session";

const Body = z.object({ enabled: z.boolean() });

/** Opt in (or out) of letting this workspace's own-key scans count toward the public regional pages. */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Send enabled: true or false.");
    const db = await currentUserDb();
    const { data, error } = await db.from("workspaces").update({ share_scans_for_regional_pages: parsed.data.enabled }).eq("id", ctx.workspace.id).select("id");
    if (error) return unavailable(SAVE_FAILED);
    if (!data?.length) return err(500, "server_error", "The setting could not be saved.");
    return json({ ok: true, enabled: parsed.data.enabled });
  });
}
