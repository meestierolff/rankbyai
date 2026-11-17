import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { nextRunAt, type Schedule } from "@/lib/schedules";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Patch = z.object({ active: z.boolean() });

/** Pause or resume a schedule. Resuming sets the next run one period from now (never an immediate surprise run). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    const parsed = Patch.safeParse(await request.json().catch(() => null));
    if (!id.success || !parsed.success) return err(400, "invalid_body", "Unknown schedule.");
    const admin = supabaseAdmin();
    const { data: tq } = await admin.from("tracked_queries").select("id, schedule").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!tq) return err(404, "not_found", "Unknown schedule.");
    const next = parsed.data.active ? nextRunAt(tq.schedule as Schedule, new Date()) : null;
    const { error } = await admin.from("tracked_queries").update({ active: parsed.data.active, next_run_at: next?.toISOString() ?? null }).eq("id", tq.id);
    return error ? err(500, "server_error", "The schedule could not be changed.") : json({ ok: true });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown schedule.");
    const { error, count } = await supabaseAdmin().from("tracked_queries").delete({ count: "exact" }).eq("id", id.data).eq("workspace_id", ctx.workspace.id);
    if (error) return err(500, "server_error", "The schedule could not be deleted.");
    return count ? json({ ok: true }) : err(404, "not_found", "Unknown schedule.");
  });
}
