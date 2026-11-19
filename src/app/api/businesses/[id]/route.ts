import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { setBusinessLocation } from "@/lib/businesses";
import { isLanguageCode } from "@/lib/countries";
import { dbAdmin } from "@/lib/db/clients";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown business.");
    const { error, count } = await dbAdmin().from("businesses").delete({ count: "exact" }).eq("id", id.data).eq("workspace_id", ctx.workspace.id);
    if (error) return err(500, "server_error", "The business could not be deleted.");
    return count ? json({ ok: true }) : err(404, "not_found", "Unknown business.");
  });
}

const Patch = z.strictObject({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  language: z.string().refine(isLanguageCode).nullable().optional(),
  ask_in_language: z.boolean().optional(),
}).refine((b) => (b.lat == null) === (b.lng == null));

/** Correct the business's map point and/or set its language. Schedules on the old point move with it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown business.");
    const parsed = Patch.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Check the location and language.");
    const b = parsed.data;
    let following: number | null = null;
    if (b.lat != null && b.lng != null) {
      const r = await setBusinessLocation(ctx.workspace.id, id.data, { lat: b.lat, lng: b.lng });
      if (!r.ok) return err(r.status, r.error, r.message);
      following = r.following;
    }
    if (b.language !== undefined || b.ask_in_language !== undefined) {
      const change = { ...(b.language !== undefined ? { language: b.language } : {}), ...(b.ask_in_language !== undefined ? { ask_in_language: b.ask_in_language } : {}) };
      const { error, count } = await dbAdmin().from("businesses").update({ ...change, updated_at: new Date().toISOString() }, { count: "exact" }).eq("id", id.data).eq("workspace_id", ctx.workspace.id);
      if (error) return err(500, "server_error", "The language could not be saved.");
      if (!count) return err(404, "not_found", "Unknown business.");
    }
    return json({ ok: true, following });
  });
}
