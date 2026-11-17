import { after } from "next/server";
import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import type { ScanSpec } from "@/lib/cost-guard";
import { createScan, processScan } from "@/lib/scans/engine";

export const maxDuration = 300;

const Body = z.object({
  business_id: z.uuid(),
  kind: z.enum(["ai", "maps"]),
  keyword: z.string().trim().min(2).max(120),
  prompt_template: z.string().max(400).nullish(),
  grid_size: z.number().int(),
  radius_miles: z.number().positive().max(50),
  engines: z.array(z.enum(["openai", "perplexity", "gemini"])).max(3).optional(),
  mode: z.enum(["standard", "priority", "live"]).optional(),
  funding: z.enum(["byok", "credits"]).default("byok"),
  confirm: z.boolean().default(false),
});

/**
 * Estimate, then run. Without `confirm: true` the response is the estimate only (HTTP 409
 * confirmation_required); with it, the scan is created and processed after the response is sent.
 */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Check the scan settings and try again.");
    const b = parsed.data;
    const spec = (b.kind === "ai"
      ? { kind: "ai", grid: b.grid_size, engines: b.engines ?? [] }
      : { kind: "maps", grid: b.grid_size, mode: b.mode ?? "priority" }) as ScanSpec;

    const result = await createScan({
      workspaceId: ctx.workspace.id, plan: ctx.workspace.plan, businessId: b.business_id, spec, keyword: b.keyword,
      promptTemplate: b.prompt_template, radiusMiles: b.radius_miles, funding: b.funding, confirm: b.confirm,
    });
    if (!result.ok) {
      if (result.error === "confirmation_required") {
        await captureServer("scan_estimated", ctx.workspace.id, { kind: b.kind, est_usd: result.estimate?.totalUsd ?? 0, funding: b.funding });
      }
      return err(result.status, result.error, result.message, result.estimate ? { estimate: result.estimate } : {});
    }
    after(() => processScan(result.scanId));
    return json({ ok: true, scan_id: result.scanId, estimate: result.estimate });
  });
}
