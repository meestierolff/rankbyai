import { z } from "zod";
import { err, json, SAVE_FAILED, unavailable, withSession } from "@/lib/api";
import { currentUserDb } from "@/lib/db/session";

const Patch = z.object({ name: z.string().trim().min(1).max(200).optional(), notes: z.string().trim().max(2000).nullable().optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    const parsed = Patch.safeParse(await request.json().catch(() => null));
    if (!id.success || !parsed.success) return err(400, "invalid_body", "Check the name and notes.");
    const db = await currentUserDb();
    const { data, error } = await db.from("clients").update(parsed.data).eq("id", id.data).eq("workspace_id", ctx.workspace.id).select("id");
    // A refused write is not "unknown client": the client may well exist.
    if (error) return unavailable(SAVE_FAILED);
    if (!data?.length) return err(404, "not_found", "Unknown client.");
    return json({ ok: true });
  });
}

/** Delete a client. Its businesses stay; they just no longer belong to a client. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown client.");
    const db = await currentUserDb();
    const { data, error } = await db.from("clients").delete().eq("id", id.data).eq("workspace_id", ctx.workspace.id).select("id");
    if (error) return unavailable(SAVE_FAILED);
    if (!data?.length) return err(404, "not_found", "Unknown client.");
    return json({ ok: true });
  });
}
