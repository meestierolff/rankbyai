import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { logHouseSpend } from "@/lib/cost-guard";
import { DEFAULT_COUNTRY, isCountryCode } from "@/lib/countries";
import { resolveRows } from "@/lib/prospects/batch";
import { parseProspectCsv } from "@/lib/prospects/csv";
import { guardLookup } from "@/lib/prospects/guard";

export const maxDuration = 300;

const Body = z.object({
  csv: z.string().min(1).max(1_000_000),
  funding: z.enum(["byok", "credits"]).default("byok"),
  /** For rows without a country column. */
  country: z.string().trim().toUpperCase().refine(isCountryCode).default(DEFAULT_COUNTRY),
});

/** CSV mode: parse the file, then look every row up on Google Maps. Unmatched rows come back as unresolved. */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Upload a CSV file of up to 1 MB.");
    const file = parseProspectCsv(parsed.data.csv);
    if (file.error) return err(400, "invalid_csv", file.error, { problems: file.problems });
    const blocked = await guardLookup(ctx, "resolve", parsed.data.funding, file.rows.length * 2);
    if (blocked) return blocked;
    try {
      const r = await resolveRows({ workspaceId: ctx.workspace.id, funding: parsed.data.funding, rows: file.rows, country: parsed.data.country });
      if (parsed.data.funding === "credits") await logHouseSpend("credits", null, { dataforseo: r.costUsd });
      return json({ resolved: r.resolved, unresolved: r.unresolved, problems: file.problems, rows: file.rows.length, cost_usd: r.costUsd });
    } catch (e) {
      if (e instanceof Error && e.message === "missing_key") return err(400, "missing_key", "Add your DataForSEO login in Settings → API keys, or switch to included scans.");
      return err(502, "lookup_failed", "The lookups did not complete. Try again.");
    }
  });
}
