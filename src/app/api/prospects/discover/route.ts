import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { DEFAULT_COUNTRY, isCountryCode } from "@/lib/countries";
import { discover } from "@/lib/prospects/batch";
import { guardLookup } from "@/lib/prospects/guard";
import { logHouseSpend } from "@/lib/cost-guard";

export const maxDuration = 90;

const Body = z.object({
  niche: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(120),
  country: z.string().trim().toUpperCase().refine(isCountryCode).default(DEFAULT_COUNTRY),
  funding: z.enum(["byok", "credits"]).default("byok"),
});

/** Search mode: one Google Maps search (first 100 results) for "{niche} in {city}". */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const countryOnly = parsed.error.issues.every((i) => i.path[0] === "country");
      return err(400, countryOnly ? "invalid_country" : "invalid_body", countryOnly ? "Choose a country from the list." : "Enter a service and a city.");
    }
    const blocked = await guardLookup(ctx, "discover", parsed.data.funding);
    if (blocked) return blocked;
    try {
      const r = await discover({ workspaceId: ctx.workspace.id, ...parsed.data });
      if (parsed.data.funding === "credits") await logHouseSpend("credits", null, { dataforseo: r.costUsd });
      return json({ candidates: r.candidates, cost_usd: r.costUsd });
    } catch (e) {
      if (e instanceof Error && e.message === "missing_key") return err(400, "missing_key", "Add your DataForSEO login in Settings → API keys, or switch to included scans.");
      return err(502, "lookup_failed", "The Google Maps search did not complete. Nothing else was charged. Try again.");
    }
  });
}
