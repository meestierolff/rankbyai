/**
 * Facts about other tools for the comparison tables on the search pages (lib/seo-pages.ts).
 *
 * Rules:
 *  - Every competitor cell was read on that vendor's own public page on VERIFIED_ON and carries the
 *    page it came from. Nothing is from memory, reviews or third-party blogs.
 *  - Where a page says nothing about a point, the cell says "No mention found" (not "No").
 *  - Where a fact could not be verified (price not published, page contradicts itself, a redirect to
 *    another brand), the cell says so and points at the vendor's page.
 *  - Re-verify on the vendor's page before editing a cell, and change VERIFIED_ON with it.
 *
 * The homepage, calculator and pricing scenario use COMPETITORS in pricing-constants.ts (its own date);
 * this file is only for the comparison tables, so a change here never moves the homepage numbers.
 */
import { MAPS_GRID_RANGE } from "@/lib/pricing-constants";

export const VERIFIED_ON = "20 Nov 2026";

export type Vendor = "rankbyai" | "localfalcon" | "brightlocal" | "semrush" | "semrushai" | "peec" | "profound" | "otterly" | "localviking";
export type Row = "pay" | "price" | "engines" | "aiGrid" | "mapsGrid" | "api" | "reports" | "citations";

export interface Cell {
  text: string;
  /** The vendor page the fact was read on. */
  source?: string;
  /** Not a verified fact (no mention found, not published, conflicting): rendered dimmed. */
  unknown?: boolean;
}

export const VENDOR_NAME: Record<Vendor, string> = {
  rankbyai: "RankbyAI", localfalcon: "Local Falcon", brightlocal: "BrightLocal", semrush: "Semrush Map Rank Tracker", semrushai: "Semrush AI Visibility Toolkit",
  peec: "Peec AI", profound: "Profound", otterly: "Otterly.AI", localviking: "Local Viking",
};

export const ROW_LABEL: Record<Row, string> = {
  pay: "How you pay",
  price: `Published price (verified ${VERIFIED_ON})`,
  engines: "AI assistants tracked",
  aiGrid: "AI answers on a map grid",
  mapsGrid: "Google Maps grid",
  api: "API and MCP",
  reports: "Reports and white-label",
  citations: "Citations and reviews",
};
export const ROWS: Row[] = ["pay", "price", "engines", "aiGrid", "mapsGrid", "api", "reports", "citations"];

const NO_MENTION = (source: string): Cell => ({ text: "No mention found", source, unknown: true });
const SEE = (source: string): Cell => ({ text: "See their site", source, unknown: true });

const LF = { pricing: "https://www.localfalcon.com/pricing", ai: "https://www.localfalcon.com/features/ai-search-visibility", llms: "https://www.localfalcon.com/llms.txt" };
const BL = {
  pricing: "https://www.brightlocal.com/pricing/", ai: "https://www.brightlocal.com/local-seo-tools/local-ai-visibility/",
  grid: "https://www.brightlocal.com/local-seo-tools/rankings/local-search-grid/",
};
const SR = { local: "https://www.semrush.com/pricing/local/", localFeatures: "https://www.semrush.com/features/local-seo/", ai: "https://www.semrush.com/pricing/ai/", mcp: "https://www.semrush.com/mcp/", plans: "https://www.semrush.com/pricing/seo-ai-search/" };
const PEEC = { pricing: "https://peec.ai/pricing", agencies: "https://peec.ai/pricing-agencies", changelog: "https://peec.ai/changelog" };
const PROFOUND = { pricing: "https://www.tryprofound.com/pricing", mcp: "https://www.tryprofound.com/features/mcp", agencies: "https://www.tryprofound.com/solutions/agencies" };
const OTTERLY = { pricing: "https://otterly.ai/pricing", home: "https://otterly.ai/" };
const LV = { home: "https://localviking.com/", grid: "https://localviking.com/geogrid-visibility-tracking", roadmap: "https://localviking.com/feature-roadmap", reports: "https://localviking.com/gmb-reporting" };

/** Competitor cells. RankbyAI's own cells are built from the live offer (rankbyaiCells). */
export const FACTS: Record<Exclude<Vendor, "rankbyai">, Record<Row, Cell>> = {
  localfalcon: {
    pay: { text: "Subscription with scan credits; one credit is one grid point", source: LF.pricing },
    price: { text: "Starter $24.99/mo, or $299.88 billed yearly with 90,000 credits a year", source: LF.pricing },
    engines: { text: "ChatGPT, Google AI Overviews, Google AI Mode, Gemini, Grok", source: LF.ai },
    aiGrid: { text: "Yes: the same prompt from every grid point, 9 to 441 points", source: LF.ai },
    mapsGrid: { text: "Yes, 3×3 to 21×21; Google Maps and Apple Maps", source: LF.pricing },
    api: { text: "API and MCP server listed on every plan", source: LF.pricing },
    reports: { text: "White-label reports on the Premium plan", source: LF.pricing },
    citations: { text: "Finds relevant citations; automated review responses on most plans", source: LF.pricing },
  },
  brightlocal: {
    pay: { text: "Subscription by plan (Track, Manage, Grow) and number of locations; monthly or yearly", source: BL.pricing },
    price: { text: "Track, 1 location: $41/mo, or $369 billed yearly. 6–10 locations: $83/mo, or $747 yearly", source: BL.pricing },
    engines: { text: "Google AI Overviews, Google AI Mode, ChatGPT", source: BL.ai },
    aiGrid: { text: "Tracks AI answers per location (“anchored to a specific location”); its page does not describe a grid", source: BL.ai, unknown: true },
    mapsGrid: { text: "Yes: Local Search Grid, 3×3 to 15×15", source: BL.grid },
    api: { text: "APIs on Manage and Grow; MCP server on Grow", source: BL.pricing },
    reports: { text: "White-label on every plan", source: BL.pricing },
    citations: { text: "Yes: citation tracking and building; review tools on Grow", source: BL.pricing },
  },
  semrush: {
    pay: { text: "Subscription per location (Local toolkit), inside the Semrush platform", source: SR.local },
    price: { text: "Local Base: $30/mo per location, billed yearly (Map Rank Tracker, 375 credits)", source: SR.local },
    engines: { text: "Not part of Map Rank Tracker; Semrush sells AI visibility separately", source: SR.localFeatures },
    aiGrid: NO_MENTION(SR.localFeatures),
    mapsGrid: { text: "Yes: Google Maps rankings as a heatmap around an area", source: SR.localFeatures },
    api: SEE(SR.local),
    reports: SEE(SR.local),
    citations: SEE(SR.local),
  },
  semrushai: {
    pay: { text: "Subscription per domain, or inside the SEO + AI Search plans", source: SR.ai },
    price: { text: "Base: $99/mo per domain, billed yearly (25 prompts tracked daily)", source: SR.ai },
    engines: { text: "ChatGPT, Google AI, Gemini, Perplexity", source: SR.ai },
    aiGrid: NO_MENTION(SR.ai),
    mapsGrid: { text: "Not in this toolkit (Map Rank Tracker is a separate product)", source: SR.local },
    api: { text: "MCP on Semrush One Starter and Pro+ (the toolkit is not on that list); API on Advanced", source: SR.mcp },
    reports: { text: "White-label through the Pro Report add-on ($20/mo)", source: SR.ai },
    citations: SEE(SR.ai),
  },
  peec: {
    pay: { text: "Monthly subscription by prompts and AI models; 15% off with yearly billing", source: PEEC.pricing },
    price: { text: "Starter $95/mo (50 prompts, 3 models), Pro $245/mo, Advanced $495/mo; Enterprise custom", source: PEEC.pricing },
    engines: { text: "Choose 3 of ChatGPT, Perplexity, AI Overview, AI Mode, Gemini and others", source: PEEC.pricing },
    aiGrid: { text: "No mention found. Prompts can run from chosen countries, and ChatGPT's local results are shown on a map", source: PEEC.changelog, unknown: true },
    mapsGrid: NO_MENTION(PEEC.pricing),
    api: { text: "API from the Pro plan; MCP on every plan", source: PEEC.pricing },
    reports: { text: "Shareable client dashboards on agency plans; white-label not mentioned", source: PEEC.agencies },
    citations: NO_MENTION(PEEC.pricing),
  },
  profound: {
    pay: { text: "Custom contracts (Enterprise and Agency Enterprise)", source: PROFOUND.pricing },
    price: { text: "Not published (“Custom”). Its Starter and Growth plans were retired in September 2026", source: PROFOUND.pricing, unknown: true },
    engines: { text: "Up to 10, including ChatGPT, Perplexity, Google AI Mode, Gemini, Claude and Google AI Overviews", source: PROFOUND.pricing },
    aiGrid: { text: "No mention found; regions are “Custom”", source: PROFOUND.pricing, unknown: true },
    mapsGrid: NO_MENTION(PROFOUND.pricing),
    api: { text: "API included; MCP for Enterprise customers", source: PROFOUND.mcp },
    reports: { text: "Agency client workspaces; white-label not mentioned", source: PROFOUND.agencies },
    citations: NO_MENTION(PROFOUND.pricing),
  },
  otterly: {
    pay: { text: "Subscription sized in credits (one prompt on one AI engine once = one credit); monthly or yearly", source: OTTERLY.pricing },
    price: {
      text: "Lite $29, Standard $189, Premium $489 a month as displayed; the page does not say whether these are the monthly or the yearly-billing rates",
      source: OTTERLY.pricing, unknown: true,
    },
    engines: { text: "ChatGPT, Google AI Overviews, Perplexity, Microsoft Copilot, Google AI Mode, Gemini, Claude", source: OTTERLY.pricing },
    aiGrid: { text: "No mention found; it monitors by country", source: OTTERLY.pricing, unknown: true },
    mapsGrid: NO_MENTION(OTTERLY.pricing),
    api: { text: "API and MCP requests on Standard and Premium", source: OTTERLY.pricing },
    reports: { text: "Branded Looker Studio reports for agency partners", source: OTTERLY.pricing },
    citations: NO_MENTION(OTTERLY.pricing),
  },
  localviking: {
    pay: { text: "Monthly subscription (see the price note)", source: LV.home },
    price: {
      text: "Not verified: localviking.com/pricing redirects to a LocalOptics pricing page that does not name Local Viking",
      source: LV.home, unknown: true,
    },
    engines: { text: "No AI visibility tracking mentioned", source: LV.roadmap, unknown: true },
    aiGrid: NO_MENTION(LV.roadmap),
    mapsGrid: { text: "Yes: GeoGrid, including a mode that runs on your own Google Places API key", source: LV.grid },
    api: { text: "API released; MCP not mentioned", source: LV.roadmap },
    reports: { text: "White-label on Pro and above", source: LV.reports },
    citations: { text: "Google Business Profile management and review responses; citations not mentioned", source: LV.home },
  },
};

/** RankbyAI's own column. `price` comes from the live offer. */
export function rankbyaiCells(price: string): Record<Row, Cell> {
  return {
    pay: { text: "Once, for lifetime access; scans on your own API keys at the vendors' prices" },
    price: { text: price },
    engines: { text: "ChatGPT, Perplexity and Gemini, through their official APIs" },
    aiGrid: { text: "Yes: 1×1, 3×3 or 5×5 points, next to the Maps rank" },
    mapsGrid: { text: `Yes, ${MAPS_GRID_RANGE} points` },
    api: { text: "REST API and MCP server" },
    reports: { text: "White-label share links and PDFs; bulk prospect reports" },
    citations: { text: "No (it measures, audits and reports)" },
  };
}

export const cellFor = (vendor: Vendor, row: Row, ourPrice: string): Cell => (vendor === "rankbyai" ? rankbyaiCells(ourPrice)[row] : FACTS[vendor][row]);
