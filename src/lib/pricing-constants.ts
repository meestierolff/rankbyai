/**
 * Vendor API price constants. ONE source of truth for the marketing calculator,
 * the in-app estimate, the REST/MCP estimate and the cost guard, so they can never disagree.
 *
 * Every figure below was read on the vendor's public pricing page on the date given.
 * Vendors set these rates and can change them. Values marked [estimate] are our
 * calculation (token assumptions), not a vendor quote; the UI labels them the same way.
 */
export const PRICES_READ_ON = "17 Nov 2026";

/** DataForSEO Google Maps SERP, USD per SERP of up to 100 results.
 *  Source: https://dataforseo.com/pricing/serp/google-maps-serp-api (read 17 Nov 2026) */
export const DATAFORSEO_MAPS_PER_POINT = {
  standard: 0.0006, // ~5 min average turnaround
  priority: 0.0012, // ~1 min
  live: 0.002, // ~6 s
} as const;
export type MapsMode = keyof typeof DATAFORSEO_MAPS_PER_POINT;

/** DataForSEO Business Data, Google My Business Info (live), USD per call.
 *  Source: https://dataforseo.com/pricing/business-data/google-my-business-info (see docs/CONFIRM.md) */
export const DATAFORSEO_BUSINESS_INFO_PER_CALL = 0.0054;

/** OpenAI Responses API. Source: https://platform.openai.com/docs/pricing (read 17 Nov 2026).
 *  Default model gpt-6-luna: the brief assumed gpt-5-mini, which OpenAI retires on 11 Dec 2026. */
export const OPENAI = {
  webSearchPerCall: 0.01, // $10.00 per 1,000 web search tool calls
  inputPer1M: 0.1, // gpt-6-luna input
  outputPer1M: 0.5, // gpt-6-luna output
  // Measured: the average of 9 real answers on 18 Nov 2026 (13,026 in, 842 out), each with exactly
  // one web search, which the request enforces (max_tool_calls in src/lib/providers/openai.ts).
  // Measure again with tests/live/ai-engines-live.test.ts when the model or the prompt changes.
  estInputTokens: 13_000,
  estOutputTokens: 850,
} as const;

/** Perplexity Agent API. Source: https://docs.perplexity.ai/docs/getting-started/pricing (read 17 Nov 2026) */
export const PERPLEXITY = {
  webSearchFastPerCall: 0.001,
  inputPer1M: 0.25, // perplexity/sonar input
  outputPer1M: 2.5, // perplexity/sonar output
  estInputTokens: 2_000, // [estimate]
  estOutputTokens: 400, // [estimate]
} as const;

/** Gemini API, Flash-Lite paid tier. Source: https://ai.google.dev/gemini-api/docs/pricing (read 17 Nov 2026) */
export const GEMINI = {
  inputPer1M: 0.3,
  outputPer1M: 2.5,
  groundedPer1000: 14, // Grounding with Google Maps / Google Search beyond the free allowance
  freeGroundedRequestsPerMonth: 5_000, // shared across Gemini 3+ models, paid-tier keys only
  estInputTokens: 2_000, // [estimate]
  estOutputTokens: 400, // [estimate]
} as const;

/** LLM helper budgets [estimate]: deliberately generous ceilings on gpt-6-luna rates. */
export const LLM_PARSE_BUDGET_USD = 0.003;
export const LLM_FIX_KIT_BUDGET_USD = 0.02;

export type Engine = "openai" | "perplexity" | "gemini";
export const ENGINES: readonly Engine[] = ["openai", "perplexity", "gemini"] as const;

/** How we name engines in the UI: the consumer product people know + the API we actually call. */
export const ENGINE_LABEL: Record<Engine, { short: string; api: string }> = {
  openai: { short: "ChatGPT", api: "OpenAI API with web search" },
  perplexity: { short: "Perplexity", api: "Perplexity Agent API with web search" },
  gemini: { short: "Gemini", api: "Gemini API with Google Maps grounding" },
};

const tokens = (inTok: number, outTok: number, inPer1M: number, outPer1M: number) =>
  (inTok * inPer1M + outTok * outPer1M) / 1_000_000;

/** [estimate] USD per AI sample (one prompt, one engine, one grid point). */
export const AI_SAMPLE_EST_USD = {
  openai: OPENAI.webSearchPerCall + tokens(OPENAI.estInputTokens, OPENAI.estOutputTokens, OPENAI.inputPer1M, OPENAI.outputPer1M), // ≈ 0.0117
  perplexity:
    PERPLEXITY.webSearchFastPerCall +
    tokens(PERPLEXITY.estInputTokens, PERPLEXITY.estOutputTokens, PERPLEXITY.inputPer1M, PERPLEXITY.outputPer1M), // ≈ 0.0025
  geminiFree: tokens(GEMINI.estInputTokens, GEMINI.estOutputTokens, GEMINI.inputPer1M, GEMINI.outputPer1M), // ≈ 0.0016 inside the free allowance
  geminiPaid:
    GEMINI.groundedPer1000 / 1000 +
    tokens(GEMINI.estInputTokens, GEMINI.estOutputTokens, GEMINI.inputPer1M, GEMINI.outputPer1M), // ≈ 0.0156 beyond it
} as const;

export const AI_GRID_SIZES = [1, 3, 5] as const;
export const MAPS_GRID_SIZES = [3, 5, 7, 9] as const;
export type AiGridSize = (typeof AI_GRID_SIZES)[number];
export type MapsGridSize = (typeof MAPS_GRID_SIZES)[number];

/** Published fair-use limits (never reduced for existing buyers). */
export const FAIR_USE = { businesses: 1000, scheduledQueries: 2000, apiKeys: 5 } as const;

/**
 * Competitor prices. ONLY these figures may appear on the site, always with the date.
 * Source: their public pricing pages on 17 Nov 2026 (brief section 9.12).
 */
export const COMPETITOR_PRICES_DATE = "17 Nov 2026";
export const COMPETITORS = {
  brightlocal: {
    name: "BrightLocal",
    plan: "Track, 6–10 locations, billed yearly",
    yearUsd: 747,
    monthlyEquivalent: "$62/mo billed yearly ($83 monthly)",
    source: "brightlocal.com/pricing",
  },
  localfalcon: {
    name: "Local Falcon",
    plan: "Starter, billed yearly",
    yearUsd: 299.88,
    monthlyEquivalent: "$24.99/mo",
    /** Price of one extra credit (brief 9.12). */
    extraCreditUsd: 0.05,
    source: "localfalcon.com/pricing",
  },
  whitespark: {
    name: "Whitespark",
    plan: "Local Ranking Grids",
    yearLabel: "from $10/mo (grids only)",
    source: "whitespark.ca/pricing",
  },
  semrush: {
    name: "Semrush",
    plan: "Map Rank Tracker",
    yearLabel: "€112/mo (as verified by the operator, 17 Nov 2026)",
  },
} as const;

/**
 * The published comparison scenario: used by the hero offer box, the pricing card and the compare
 * table, so the three always agree.
 *
 * The landing redesign (Nov 2026) changed it from the brief's monthly AI + Maps scenario to weekly
 * 7×7 Maps grids. Competitor prices are still the brief's (9.12, dated COMPETITOR_PRICES_DATE);
 * `coverage` records the check that both plans can actually run this scenario.
 */
export const SCENARIO = {
  clients: 10,
  promptsPerClient: 3,
  mapsGrid: 7 as MapsGridSize,
  frequency: "weekly" as const,
  /** Line above the three prices in the hero. */
  headline: "One year of weekly 7×7 Maps grids for 10 clients, 3 prompts each.",
  description:
    "An agency tracks 10 clients, 3 prompts each, every week on a 7×7 Google Maps grid: 1,560 grids and 76,440 grid points a year.",
  /** Grid points a year: 30 prompts × 52 weeks × 49 points. Asserted in tests/unit/pricing.test.ts. */
  mapsPointsPerYear: 76_440,
  coverageDate: "18 Nov 2026",
  coverage:
    "Plan fit checked on the vendors' own pages on 18 Nov 2026: Local Falcon charges one credit per grid point and Starter billed yearly includes 90,000 credits; BrightLocal states that every plan includes a 7×7 grid with up to 5 keywords and that reports can run weekly.",
};
/** Local Falcon Starter, billed yearly: credits per year (brief 9.12; localfalcon.com/pricing). */
export const LOCAL_FALCON_STARTER_CREDITS_PER_YEAR = 90_000;

/** Included-scan packs (keys included). Prices in integer cents. */
export const PACKS = {
  pack_25: { credits: 25, priceCents: 1900, label: "Pack 25" },
  pack_100: { credits: 100, priceCents: 5900, label: "Pack 100" },
} as const;
export type PackKey = keyof typeof PACKS;

/** Credits per action (brief 10.3). */
export const CREDIT_COST = {
  ai_grid_1: 1,
  ai_grid_3: 1,
  ai_grid_5: 3,
  maps_grid: 1,
  audit: 1,
  prospect_report: 2,
  free_check: 0,
} as const;

/** Hard cap on house-key spend per included credit (env COST_MAX_PER_CREDIT_USD overrides at runtime). */
export const DEFAULT_COST_MAX_PER_CREDIT_USD = 0.3;

/**
 * Payment fees, worst case for an NL Stripe account selling in USD to a US card
 * (stripe.com/en-nl/pricing, read 16 Nov 2026): 3.15% international card + 2% currency
 * conversion + 0.5% Stripe Tax, plus €0.25 fixed (≈ $0.29) [estimate].
 */
export const STRIPE_FEE_WORST_CASE = { percent: 0.0565, fixedUsd: 0.29 } as const;
export const stripeFeeUsd = (amountUsd: number) =>
  amountUsd * STRIPE_FEE_WORST_CASE.percent + STRIPE_FEE_WORST_CASE.fixedUsd;

export const REFUND_DAYS = 14;
