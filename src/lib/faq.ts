import { estimateAiGrid, estimateMapsGrid } from "@/lib/cost/estimate";
import { fmtPrice, formatClosesAt, type Offer } from "@/lib/ladder";
import { AI_DISCLAIMER_TEXT } from "@/lib/copy";
import { ENGINES, FAIR_USE, PACKS, REFUND_DAYS } from "@/lib/pricing-constants";

export interface FaqItem {
  q: string;
  a: string;
}

/** Home FAQ (brief 9.14). One list feeds both the visible accordion and the FAQPage JSON-LD. */
export function buildFaq(offer: Offer | null): FaqItem[] {
  const g3 = estimateAiGrid(3, ENGINES).rangeUsd;
  const maps = estimateMapsGrid(7, "standard").totalUsd;
  const ladder = offer
    ? `It starts at ${fmtPrice(offer.basePriceUsd)} and rises ${fmtPrice(offer.stepUsd)} after every ${offer.seatsPerStep} sales. Right now it is ${fmtPrice(offer.currentPriceUsd)}.`
    : "It rises by a fixed step after every few sales; the live price is on this page.";
  const closes = offer ? ` The lifetime deal closes on ${formatClosesAt(offer.closesAt)}.` : "";
  return [
    {
      q: "What does “lifetime” mean?",
      a: `One payment gives your workspace access to RankbyAI for as long as RankbyAI operates, including every future update to the features listed on this page. There is no subscription to cancel. The data still costs money, but you pay the API vendors directly at their price. If we ever shut down, you get 60 days' notice and a full export.`,
    },
    {
      q: "Why does the price go up?",
      a: `Early buyers take the most risk, so they pay the least. ${ladder} A live sales counter sets the price, not a timer, and a refunded seat still counts, so the price never goes back down.${closes}`,
    },
    {
      q: "Which API keys do I need?",
      a: `A DataForSEO account for Maps grids and the audit, and at least one of OpenAI, Perplexity or Gemini for AI checks. All are pay-as-you-go. Gemini needs a billing-enabled key, because Google does not offer Maps grounding on its free tier. If you would rather not manage keys, buy included scans: ${PACKS.pack_25.credits} for $${PACKS.pack_25.priceCents / 100} or ${PACKS.pack_100.credits} for $${PACKS.pack_100.priceCents / 100}.`,
    },
    {
      q: "What does a check really cost?",
      a: `Points × engines × the vendor's price. A 3×3 AI grid on three engines is about $${g3.low.toFixed(2)} to $${g3.high.toFixed(2)}, and a scheduled 7×7 Maps grid is about $${maps.toFixed(2)}. These are our estimates from the vendors' published prices. The app shows the estimate before every scan and the actual cost after.`,
    },
    {
      q: "How do you check what AI recommends?",
      a: `Through the official APIs only: OpenAI with web search, Perplexity with web search, and Gemini with Google Maps grounding. The same prompt is asked at each grid point with that point's location. ${AI_DISCLAIMER_TEXT} We never scrape the consumer apps.`,
    },
    {
      q: "Is RankbyAI the only tool that does this?",
      a: "No. Local Falcon and BrightLocal both offer AI visibility tracking on a grid, and both are strong products. We differ on how you pay (once, with API calls at cost on your own keys), on bulk white-label prospect reports, and on an open REST API and MCP server.",
    },
    {
      q: "Is there a usage limit?",
      a: `Not on your own keys: we set no caps on scans. Fair-use limits are published and never reduced for buyers: ${FAIR_USE.businesses.toLocaleString("en-US")} businesses, ${FAIR_USE.scheduledQueries.toLocaleString("en-US")} scheduled queries and ${FAIR_USE.apiKeys} API keys per workspace.`,
    },
    {
      q: "Can my clients see results?",
      a: "Yes. Every business has a live share link that always shows its latest scans and audit, plus a PDF export. Both can carry your logo, color and website instead of ours.",
    },
    {
      q: "Can I use it from Claude, Cursor or ChatGPT?",
      a: "Yes. Create an API key in the app and connect the MCP server, or call the REST API. Your agent can run checks, audits and prospect reports. Anything that costs money returns an estimate first and needs an explicit confirmation.",
    },
    {
      q: "Do you contact businesses or send emails?",
      a: "No. RankbyAI never contacts the businesses in your reports and never sends email on your behalf. Exports are for your own outreach, which you must keep compliant with the laws that apply to you.",
    },
    {
      q: "What if I don't like it?",
      a: `Email us within ${REFUND_DAYS} days of buying for a full refund, no questions. Fees you paid to your API vendors go to them, not to us, so we can't refund those.`,
    },
  ];
}
