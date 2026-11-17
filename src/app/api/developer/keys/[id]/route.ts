import { z } from "zod";
import { err, json, requireOwner, withSession } from "@/lib/api";
import { revokeApiKey } from "@/lib/api-keys";

/** Revoke an API key. It stops working immediately. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown key.");
    if (!(await revokeApiKey(ctx.workspace.id, id.data))) return err(404, "not_found", "That key was not found or is already revoked.");
    return json({ ok: true });
  });
}
