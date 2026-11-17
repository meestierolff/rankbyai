import { z } from "zod";
import { err, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import { pagePlan, pagePlanCsv } from "@/lib/audit/math";
import type { StoredAuditInputs } from "@/lib/audit/run";
import { currentUserDb } from "@/lib/db/session";

/** The page plan as CSV: one row per service × area (service, area, suggested slug, suggested title). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown audit.");
    const db = await currentUserDb();
    const { data: audit } = await db.from("audits").select("id, status, inputs, businesses(name)").eq("id", id.data).maybeSingle();
    if (!audit) return err(404, "not_found", "Unknown audit.");
    const plan = (audit.inputs as StoredAuditInputs).pagePlan;
    if (audit.status !== "done" || !plan || !plan.services.length || !plan.areas.length) return err(409, "no_page_plan", "This audit has no page plan: services or nearby areas could not be read.");
    const business = audit.businesses as unknown as { name: string } | { name: string }[] | null;
    const name = (Array.isArray(business) ? business[0]?.name : business?.name) ?? "Business";
    const csv = pagePlanCsv(pagePlan(plan.services, plan.areas, name));
    await captureServer("csv_exported", ctx.workspace.id, { kind: "page_plan" });
    const file = `page-plan-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "business"}.csv`;
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" } });
  });
}
