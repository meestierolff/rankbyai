import { z } from "zod";
import { err, sessionRead, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import { pagePlan, pagePlanCsv } from "@/lib/audit/math";
import type { StoredAuditInputs } from "@/lib/audit/run";

/** The page plan as CSV: one row per service × area (service, area, suggested slug, suggested title). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown audit.");
    const { data: audit } = await sessionRead<{ id: string; status: string; inputs: StoredAuditInputs; business_id: string }>("Audit", ctx, (db) => db.from("audits").select("id, status, inputs, business_id").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle());
    if (!audit) return err(404, "not_found", "Unknown audit.");
    const plan = audit.inputs.pagePlan;
    if (audit.status !== "done" || !plan || !plan.services.length || !plan.areas.length) return err(409, "no_page_plan", "This audit has no page plan: services or nearby areas could not be read.");
    // The business name is read on its own, with its own workspace filter, instead of embedded in
    // the audit: as the server, an embedded row would not be checked against the workspace.
    const { data: business } = await sessionRead<{ name: string }>("Business of the audit", ctx, (db) => db.from("businesses").select("name").eq("id", audit.business_id).eq("workspace_id", ctx.workspace.id).maybeSingle());
    const name = business?.name ?? "Business";
    const csv = pagePlanCsv(pagePlan(plan.services, plan.areas, name));
    await captureServer("csv_exported", ctx.workspace.id, { kind: "page_plan" });
    const file = `page-plan-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "business"}.csv`;
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" } });
  });
}
