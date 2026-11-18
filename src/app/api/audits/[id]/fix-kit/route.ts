import { z } from "zod";
import { err, json, sessionRead, withSession } from "@/lib/api";
import { generateFixKit } from "@/lib/audit/fixkit";

export const maxDuration = 120;

const Body = z.object({ regenerate: z.boolean().default(false) });

/** The Fix Kit of an audit, if one has been generated. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown audit.");
    // "No kit yet" is only answered when the read worked; a failed read answers 503 (sessionRead).
    const { data } = await sessionRead("Fix Kit", ctx, (db) => db.from("fix_kits").select("*").eq("audit_id", id.data).eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(1));
    return json({ kit: data?.[0] ?? null });
  });
}

/** Generate the Fix Kit (at most one model call). Returns the existing kit unless `regenerate` is set on an own-key audit. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!id.success || !parsed.success) return err(400, "invalid_body", "Unknown audit.");
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "The Fix Kit needs lifetime access.");
    const result = await generateFixKit(id.data, ctx.workspace.id, parsed.data.regenerate);
    if (!result.ok) return err(result.status, result.error, result.message);
    return json({ ok: true, kit: result.kit, note: result.note });
  });
}
