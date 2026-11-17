import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown business.");
    const { error, count } = await supabaseAdmin().from("businesses").delete({ count: "exact" }).eq("id", id.data).eq("workspace_id", ctx.workspace.id);
    if (error) return err(500, "server_error", "The business could not be deleted.");
    return count ? json({ ok: true }) : err(404, "not_found", "Unknown business.");
  });
}
