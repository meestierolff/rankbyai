import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { validateSpec, type ScanSpec } from "@/lib/cost-guard";
import { upsertTrackedQuery } from "@/lib/schedules";
import { validateTemplate } from "@/lib/scans/prompt";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Body = z.object({
  business_id: z.uuid(),
  kind: z.enum(["ai", "maps"]),
  keyword: z.string().trim().min(2).max(120),
  prompt_template: z.string().max(400).nullish(),
  grid_size: z.number().int(),
  radius_miles: z.number().positive().max(50),
  engines: z.array(z.enum(["openai", "perplexity", "gemini"])).max(3).optional(),
  funding: z.enum(["byok", "credits"]).default("byok"),
  schedule: z.enum(["weekly", "monthly"]),
});

/** Create or update a recurring check. Opt-in only; the first run happens one period from now. */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "Schedules need lifetime access.");
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Check the schedule settings.");
    const b = parsed.data;
    const spec = (b.kind === "ai" ? { kind: "ai", grid: b.grid_size, engines: b.engines ?? [] } : { kind: "maps", grid: b.grid_size, mode: "standard" }) as ScanSpec;
    const specError = validateSpec(spec);
    if (specError) return err(400, "invalid_spec", specError);
    if (b.kind === "ai" && b.prompt_template) {
      const tErr = validateTemplate(b.prompt_template);
      if (tErr) return err(400, "invalid_prompt", tErr);
    }
    const { data: business } = await supabaseAdmin().from("businesses").select("id").eq("id", b.business_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!business) return err(404, "business_not_found", "That business was not found in this workspace.");

    const result = await upsertTrackedQuery({
      workspaceId: ctx.workspace.id, businessId: b.business_id, kind: b.kind, keyword: b.keyword, promptTemplate: b.prompt_template,
      gridSize: b.grid_size, radiusMiles: b.radius_miles, engines: b.engines ?? [], funding: b.funding, schedule: b.schedule,
    });
    return result.ok ? json({ ok: true, id: result.id }) : err(409, "schedule_failed", result.message);
  });
}
