import { after } from "next/server";
import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import { BATCH_MAX, createBatch, processBatch } from "@/lib/prospects/batch";

export const maxDuration = 300;

const text = (max: number) => z.string().trim().max(max).nullable();
const Candidate = z.object({
  name: z.string().trim().min(1).max(300),
  cid: text(64), place_id: text(256), address: text(400), city: text(120), region: text(120), country: text(8),
  website: text(500).refine((v) => v == null || /^https?:\/\//i.test(v), "website must be http(s)"),
  phone: text(40), category: text(120),
  lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(),
  rating: z.number().min(0).max(5).nullable(), reviews: z.number().int().min(0).nullable(), rank: z.number().int().min(1).nullable(),
});
const Body = z.object({
  mode: z.enum(["search", "csv"]),
  niche: z.string().trim().min(2).max(80),
  city: z.string().trim().max(120).nullable().default(null),
  country: z.enum(["US", "GB", "CA", "AU", "IE", "NZ"]).default("US"),
  candidates: z.array(Candidate).min(1).max(BATCH_MAX),
  funding: z.enum(["byok", "credits"]).default("byok"),
  confirm: z.boolean().default(false),
});

/** Create prospect reports for the selected businesses. Without `confirm: true` the response is the estimate only. */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Select at least one business and enter the service.");
    const b = parsed.data;
    const result = await createBatch({ workspaceId: ctx.workspace.id, plan: ctx.workspace.plan, mode: b.mode, niche: b.niche, city: b.city, country: b.country, candidates: b.candidates, funding: b.funding, confirm: b.confirm });
    if (!result.ok) return err(result.status, result.error, result.message, result.estimate ? { estimate: result.estimate } : {});
    await captureServer("prospect_batch_started", ctx.workspace.id, { size: b.candidates.length, mode: b.mode });
    after(() => processBatch(result.batchId));
    return json({ ok: true, batch_id: result.batchId, estimate: result.estimate });
  });
}
