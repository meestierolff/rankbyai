import { z } from "zod";
import { err, json, requireOwner, withSession } from "@/lib/api";
import { revokeGrant } from "@/lib/oauth/tokens";

/** Disconnect an app that was connected with OAuth. Its access and refresh tokens stop working immediately. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown app.");
    if (!(await revokeGrant(ctx.workspace.id, id.data))) return err(404, "not_found", "That app was not found or is already disconnected.");
    return json({ ok: true });
  });
}
