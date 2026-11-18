import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { DEFAULT_COUNTRY, isCountryCode } from "@/lib/countries";
import { resolveCredentials } from "@/lib/keys";
import { isMockMode } from "@/lib/mock";
import { DATAFORSEO_MAPS_PER_POINT } from "@/lib/pricing-constants";
import { mapsLive } from "@/lib/providers/dataforseo";
import { mockBusinessSearch } from "@/lib/providers/mock-data";
import { ProviderError } from "@/lib/providers/types";

const Query = z.object({
  q: z.string().trim().min(2).max(120),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().toUpperCase().refine(isCountryCode).default(DEFAULT_COUNTRY),
});

/** Find a Google listing by name (+ city). One live Maps lookup on the workspace's DataForSEO key. */
export async function GET(request: Request) {
  return withSession(async (ctx) => {
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "Searching listings needs lifetime access.");
    const sp = new URL(request.url).searchParams;
    const parsed = Query.safeParse({ q: sp.get("q") ?? "", city: sp.get("city") ?? undefined, country: sp.get("country") || undefined });
    if (!parsed.success) {
      const countryOnly = parsed.error.issues.every((i) => i.path[0] === "country");
      return err(400, countryOnly ? "invalid_country" : "invalid_query", countryOnly ? "Choose a country from the list." : "Type at least 2 characters.");
    }
    const keyword = [parsed.data.q, parsed.data.city].filter(Boolean).join(" ");
    if (isMockMode()) return json({ results: mockBusinessSearch(parsed.data.q), cost_usd: 0, mock: true });
    const creds = await resolveCredentials(ctx.workspace.id, "byok");
    if (!creds.dataforseo) return err(400, "missing_key", "Add your DataForSEO login in Settings → API keys to search Google listings.");
    try {
      const r = await mapsLive(creds.dataforseo, { keyword, country: parsed.data.country, depth: 20 });
      return json({ results: r.items.slice(0, 10), cost_usd: r.costUsd ?? DATAFORSEO_MAPS_PER_POINT.live });
    } catch (e) {
      return err(502, "provider_error", e instanceof ProviderError ? `DataForSEO: ${e.message}` : "The search failed. Try again.");
    }
  });
}
