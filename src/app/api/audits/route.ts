import { after } from "next/server";
import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import { createAudit, processAudit } from "@/lib/audit/run";
import { dbAdmin } from "@/lib/db/clients";

export const maxDuration = 300;

const Body = z.object({
  business_id: z.uuid(),
  service: z.string().trim().min(2).max(80),
  months: z.number().int().min(1).max(12).default(3),
  funding: z.enum(["byok", "credits"]).default("byok"),
  confirm: z.boolean().default(false),
});

/** Estimate, then run (same contract as scans): without `confirm: true` the response is the estimate only. */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Pick a business and enter its main service.");
    const b = parsed.data;
    const result = await createAudit({ workspaceId: ctx.workspace.id, plan: ctx.workspace.plan, businessId: b.business_id, service: b.service, months: b.months, funding: b.funding, confirm: b.confirm });
    if (!result.ok) return err(result.status, result.error, result.message, result.estimate ? { estimate: result.estimate } : {});
    const workspaceId = ctx.workspace.id;
    after(async () => {
      await processAudit(result.auditId);
      const { data } = await dbAdmin().from("audits").select("status, score").eq("id", result.auditId).maybeSingle();
      if (data?.status === "done") await captureServer("audit_completed", workspaceId, { score: data.score });
    });
    return json({ ok: true, audit_id: result.auditId, estimate: result.estimate });
  });
}
