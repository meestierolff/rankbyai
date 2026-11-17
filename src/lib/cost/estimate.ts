import {
  AI_SAMPLE_EST_USD,
  DATAFORSEO_MAPS_PER_POINT,
  GEMINI,
  type AiGridSize,
  type Engine,
  type MapsGridSize,
  type MapsMode,
} from "@/lib/pricing-constants";

/** Pure cost maths shared by the marketing calculator, the app, the API and the cost guard. */

export interface EngineRates {
  openai: number;
  perplexity: number;
  gemini: number;
}

/** [estimate] USD per sample per engine. Measured medians (≥ 50 real samples) can override the defaults. */
export function engineSampleRates(opts: { geminiInsideFreeAllowance: boolean; measured?: Partial<EngineRates> }): EngineRates {
  return {
    openai: opts.measured?.openai ?? AI_SAMPLE_EST_USD.openai,
    perplexity: opts.measured?.perplexity ?? AI_SAMPLE_EST_USD.perplexity,
    gemini:
      opts.measured?.gemini ?? (opts.geminiInsideFreeAllowance ? AI_SAMPLE_EST_USD.geminiFree : AI_SAMPLE_EST_USD.geminiPaid),
  };
}

export interface AiGridEstimate {
  points: number;
  samples: number;
  perEngineUsd: Partial<Record<Engine, number>>;
  totalUsd: number;
  /** Low = Gemini inside the free grounding allowance, high = beyond it. */
  rangeUsd: { low: number; high: number };
}

export function estimateAiGrid(grid: AiGridSize, engines: readonly Engine[], opts?: { measured?: Partial<EngineRates>; geminiInsideFreeAllowance?: boolean }): AiGridEstimate {
  const points = grid * grid;
  const inside = opts?.geminiInsideFreeAllowance ?? true;
  const rates = engineSampleRates({ geminiInsideFreeAllowance: inside, measured: opts?.measured });
  const perEngineUsd: Partial<Record<Engine, number>> = {};
  let total = 0;
  for (const e of engines) {
    perEngineUsd[e] = rates[e] * points;
    total += rates[e] * points;
  }
  const low = engines.reduce((s, e) => s + engineSampleRates({ geminiInsideFreeAllowance: true, measured: opts?.measured })[e] * points, 0);
  const high = engines.reduce((s, e) => s + engineSampleRates({ geminiInsideFreeAllowance: false, measured: opts?.measured })[e] * points, 0);
  return { points, samples: points * engines.length, perEngineUsd, totalUsd: total, rangeUsd: { low, high } };
}

export function estimateMapsGrid(grid: MapsGridSize, mode: MapsMode): { points: number; totalUsd: number } {
  const points = grid * grid;
  return { points, totalUsd: points * DATAFORSEO_MAPS_PER_POINT[mode] };
}

export interface CalculatorInput {
  /** Prompts tracked across all clients (1–300). */
  prompts: number;
  aiGrid: AiGridSize;
  engines: readonly Engine[];
  frequency: "weekly" | "monthly";
  /** On: the first 5,000 grounded Gemini requests per month are free (paid-tier key). */
  geminiFreeAllowance: boolean;
  mapsGrid: MapsGridSize | 0;
}

export interface CalculatorResult {
  checksPerYear: number;
  aiPointsPerCheck: number;
  aiUsdPerYear: number;
  mapsUsdPerYear: number;
  totalUsdPerYear: number;
  geminiGroundedPerMonth: number;
  geminiBillablePerMonth: number;
  formula: string;
}

/** A year of data cost on the user's own keys [estimate]. */
export function calculateYearlyDataCost(input: CalculatorInput): CalculatorResult {
  const runsPerYear = input.frequency === "weekly" ? 52 : 12;
  const runsPerMonth = runsPerYear / 12;
  const checksPerYear = input.prompts * runsPerYear;
  const points = input.aiGrid * input.aiGrid;

  let aiUsd = 0;
  for (const e of input.engines) {
    if (e === "openai") aiUsd += checksPerYear * points * AI_SAMPLE_EST_USD.openai;
    if (e === "perplexity") aiUsd += checksPerYear * points * AI_SAMPLE_EST_USD.perplexity;
  }

  let geminiGroundedPerMonth = 0;
  let geminiBillablePerMonth = 0;
  if (input.engines.includes("gemini")) {
    geminiGroundedPerMonth = input.prompts * runsPerMonth * points;
    const free = input.geminiFreeAllowance ? GEMINI.freeGroundedRequestsPerMonth : 0;
    geminiBillablePerMonth = Math.max(0, geminiGroundedPerMonth - free);
    const tokenUsdPerYear = checksPerYear * points * AI_SAMPLE_EST_USD.geminiFree;
    const groundingUsdPerYear = geminiBillablePerMonth * 12 * (GEMINI.groundedPer1000 / 1000);
    aiUsd += tokenUsdPerYear + groundingUsdPerYear;
  }

  const mapsPoints = input.mapsGrid ? input.mapsGrid * input.mapsGrid : 0;
  const mapsUsd = checksPerYear * mapsPoints * DATAFORSEO_MAPS_PER_POINT.standard;

  const n = (v: number) => v.toLocaleString("en-US");
  const parts = [`${n(checksPerYear)} checks × ${points} ${points === 1 ? "point" : "points"} × ${input.engines.length} ${input.engines.length === 1 ? "engine" : "engines"}`];
  if (mapsPoints) parts.push(`${n(checksPerYear)} Maps grids × ${mapsPoints} points × $${DATAFORSEO_MAPS_PER_POINT.standard}`);

  return {
    checksPerYear,
    aiPointsPerCheck: points,
    aiUsdPerYear: aiUsd,
    mapsUsdPerYear: mapsUsd,
    totalUsdPerYear: aiUsd + mapsUsd,
    geminiGroundedPerMonth,
    geminiBillablePerMonth,
    formula: parts.join(" + "),
  };
}

export const usd0 = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
export const usd2 = (v: number) =>
  "$" + (Number.isFinite(v) ? v : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Small unit costs: 3 significant decimals under 10¢, else 2. */
export const usdUnit = (v: number) => "$" + (v < 0.1 ? v.toFixed(3) : v.toFixed(2));
/** Whole dollars, or cents when the amount isn't whole (competitor list prices). */
export const usdSmart = (v: number) => (Number.isInteger(v) ? usd0(v) : usd2(v));
