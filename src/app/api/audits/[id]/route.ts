import { z } from "zod";
import { err, json, sessionRead, unavailable, withSession } from "@/lib/api";
import type { StoredAuditInputs } from "@/lib/audit/run";
import { dbAdmin } from "@/lib/db/clients";

const listOf = (max: number) => z.array(z.string().trim().min(1).max(80)).max(max);
const Patch = z.object({ services: listOf(60), areas: listOf(80) });

/** Audit status for the result page while it runs, for the workspace of the session only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown audit.");
    const { data: audit } = await sessionRead<Record<string, unknown>>("Audit", ctx, (db) => db.from("audits").select("id, status, score, error, created_at, finished_at").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle());
    if (!audit) return err(404, "not_found", "Unknown audit.");
    return json({ audit });
  });
}

/** Save the user's edits to the page plan lists (services and areas). The plan and its CSV follow these lists. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    const parsed = Patch.safeParse(await request.json().catch(() => null));
    if (!id.success || !parsed.success) return err(400, "invalid_body", "Use up to 60 services and 80 areas, each 1–80 characters.");
    const admin = dbAdmin();
    const { data: audit, error: readError } = await admin.from("audits").select("id, workspace_id, status, inputs").eq("id", id.data).maybeSingle();
    if (readError) return unavailable();
    if (!audit || audit.workspace_id !== ctx.workspace.id) return err(404, "not_found", "Unknown audit.");
    if (audit.status !== "done") return err(409, "audit_not_done", "The audit has not finished yet.");
    const inputs = audit.inputs as StoredAuditInputs;
    const dedupe = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()];
    const pagePlan = { services: dedupe(parsed.data.services), areas: dedupe(parsed.data.areas), radiusMiles: inputs.pagePlan?.radiusMiles ?? 10, pagesHave: inputs.pagePlan?.pagesHave ?? inputs.site?.pagesRead ?? 0 };
    const { error } = await admin.from("audits").update({ inputs: { ...inputs, pagePlan } }).eq("id", audit.id);
    if (error) return err(500, "server_error", "The lists could not be saved.");
    return json({ ok: true, page_plan: pagePlan });
  });
}
