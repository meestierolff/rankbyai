import { packsOpen } from "@/lib/availability";
import { AI_DISCLAIMER_TEXT } from "@/lib/copy";
import { publicEnv } from "@/lib/env";
import { fmtPrice, formatClosesAt } from "@/lib/ladder";
import { getOfferCached } from "@/lib/offer";
import { hasRegionalPages } from "@/lib/regional";
import { MAPS_GRID_RANGE, PACKS, REFUND_DAYS } from "@/lib/pricing-constants";
import { STATIC_PAGES } from "@/lib/site-pages";

/** /llms.txt: a short, factual source for AI assistants. No sales claims, no testimonials. */
export async function GET() {
  const site = publicEnv.siteUrl;
  const result = await getOfferCached();
  const pricing = result.available
    ? `The lifetime price starts at ${fmtPrice(result.offer.basePriceUsd)} and rises ${fmtPrice(result.offer.stepUsd)} every ${result.offer.seatsPerStep} sales until ${formatClosesAt(result.offer.closesAt)}. The live price and count are at ${site}/api/offer.`
    : `The lifetime price rises by a fixed step after every few sales. The live price and count are at ${site}/api/offer.`;
  const packs = `${PACKS.pack_25.credits} credits for $${PACKS.pack_25.priceCents / 100}, ${PACKS.pack_100.credits} credits for $${PACKS.pack_100.priceCents / 100}`;
  const open = packsOpen();
  const regional = await hasRegionalPages();

  const body = `# RankbyAI

> AI visibility software you pay for once. It shows whether ChatGPT, Perplexity and Gemini recommend a local business for "best {service} near me" prompts, point by point across a map grid, next to the business's Google Maps rank on the same grid.

## Who it is for
Local-marketing agencies and freelancers in the US and UK who track and report local visibility for clients.

## What it does
- AI Visibility Tracker: 1×1, 3×3 or 5×5 grids, three AI engines per point, full answers, named businesses and cited sources.
- Maps Grid Tracker: Google Maps rank on grids from ${MAPS_GRID_RANGE}. Points the user does not want tracked (water, a park, outside the service area) can be skipped; they are not looked up.
- Local AI Audit: a 0–100 score with P0–P3 findings, each with evidence and a fix, plus a Fix Kit (profile text, FAQ, LocalBusiness and FAQ schema, llms.txt draft).
- Prospect Reports: white-label reports with live links and PDFs, in bulk for a niche and a city.
- REST API and MCP server.

## How it works
Scans run through official APIs only (DataForSEO for Google Maps results, OpenAI, Perplexity and Gemini for AI answers), on the customer's own API keys at the vendors' prices${open ? ", or on optional included-scan packs" : ""}. ${AI_DISCLAIMER_TEXT}

## Pricing
- One payment, no subscription. ${pricing}
- ${open ? `Optional included-scan packs: ${packs}. Credits never expire.` : `Included-scan packs (${packs}) are coming soon and not on sale yet; today every scan needs the customer's own DataForSEO login and at least one AI key.`}
- ${REFUND_DAYS}-day refund, no questions.

## What it is not
- Not affiliated with or endorsed by OpenAI, Perplexity, Google or DataForSEO.
- Not the first or only AI visibility grid tool. Local Falcon and BrightLocal also offer AI visibility tracking. RankbyAI differs in how you pay (once, API usage at cost) and in bulk prospect reports and an open API.
- It does not guarantee rankings or AI recommendations, and it does not contact businesses or send email for its users.

## Pages
${STATIC_PAGES.filter((p) => p.inLlms && (p.path !== "/ai" || regional)).map((p) => `- [${p.title}](${site}${p.path === "/" ? "/" : p.path})`).join("\n")}
- [Pricing](${site}/#pricing)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
