import { describe, expect, it } from "vitest";
import { calculateYearlyDataCost, estimateAiGrid, estimateMapsGrid } from "@/lib/cost/estimate";
import { priceCentsForSale } from "@/lib/ladder";
import {
  AI_SAMPLE_EST_USD,
  CREDIT_COST,
  DATAFORSEO_BUSINESS_INFO_PER_CALL,
  DATAFORSEO_MAPS_PER_POINT,
  DEFAULT_COST_MAX_PER_CREDIT_USD,
  ENGINES,
  LLM_FIX_KIT_BUDGET_USD,
  LLM_PARSE_BUDGET_USD,
  PACKS,
  SCENARIO,
  stripeFeeUsd,
} from "@/lib/pricing-constants";

describe("vendor price constants", () => {
  // The brief's figures assumed gpt-5-mini ($0.25/$2.00). OpenAI retires it on 11 Dec 2026, so the
  // default is gpt-6-luna ($0.10/$0.50) and every figure below follows from the constants.
  it("derives the per-sample estimates from the vendor prices", () => {
    expect(AI_SAMPLE_EST_USD.openai).toBeCloseTo(0.01 + (13_000 * 0.1 + 850 * 0.5) / 1e6, 6); // 0.0117, one search per answer
    expect(AI_SAMPLE_EST_USD.perplexity).toBeCloseTo(0.0025, 4);
    expect(AI_SAMPLE_EST_USD.geminiFree).toBeCloseTo(0.0016, 4);
    expect(AI_SAMPLE_EST_USD.geminiPaid).toBeCloseTo(0.0156, 4);
  });

  it("AI grid ranges are points × the per-sample sums", () => {
    const low = AI_SAMPLE_EST_USD.openai + AI_SAMPLE_EST_USD.perplexity + AI_SAMPLE_EST_USD.geminiFree; // ≈ 0.0158
    const high = AI_SAMPLE_EST_USD.openai + AI_SAMPLE_EST_USD.perplexity + AI_SAMPLE_EST_USD.geminiPaid; // ≈ 0.0293
    for (const n of [1, 3, 5] as const) {
      const r = estimateAiGrid(n, ENGINES).rangeUsd;
      expect(r.low).toBeCloseTo(n * n * low, 6);
      expect(r.high).toBeCloseTo(n * n * high, 6);
    }
    expect(estimateAiGrid(3, ENGINES).rangeUsd.low).toBeCloseTo(0.14, 2);
    expect(estimateAiGrid(3, ENGINES).rangeUsd.high).toBeCloseTo(0.27, 2);
  });

  it("matches the published Maps grid totals", () => {
    expect(estimateMapsGrid(7, "standard").totalUsd).toBeCloseTo(0.029, 3);
    expect(estimateMapsGrid(7, "priority").totalUsd).toBeCloseTo(0.059, 3);
    expect(estimateMapsGrid(7, "live").totalUsd).toBeCloseTo(0.098, 3);
    expect(estimateMapsGrid(9, "standard").totalUsd).toBeCloseTo(0.049, 3);
    expect(estimateMapsGrid(9, "priority").totalUsd).toBeCloseTo(0.097, 3);
    expect(estimateMapsGrid(9, "live").totalUsd).toBeCloseTo(0.162, 3);
  });

  it("prices the comparison scenario at about $62 a year", () => {
    const r = calculateYearlyDataCost({
      prompts: SCENARIO.clients * SCENARIO.promptsPerClient,
      aiGrid: SCENARIO.aiGrid,
      engines: ENGINES,
      frequency: "monthly",
      geminiFreeAllowance: true,
      mapsGrid: SCENARIO.mapsGrid,
    });
    expect(r.checksPerYear).toBe(360);
    expect(Math.round(r.totalUsdPerYear)).toBe(62); // 360 × 9 × 0.0158 + 360 × 49 × 0.0006
    expect(r.geminiBillablePerMonth).toBe(0);
  });

  it("charges Gemini grounding beyond the free monthly allowance", () => {
    const base = { aiGrid: 5 as const, engines: ["gemini"] as const, frequency: "weekly" as const, mapsGrid: 0 as const };
    const within = calculateYearlyDataCost({ ...base, prompts: 10, geminiFreeAllowance: true });
    const beyond = calculateYearlyDataCost({ ...base, prompts: 300, geminiFreeAllowance: true });
    const noAllowance = calculateYearlyDataCost({ ...base, prompts: 10, geminiFreeAllowance: false });
    expect(within.geminiBillablePerMonth).toBe(0);
    expect(beyond.geminiBillablePerMonth).toBeGreaterThan(0);
    expect(noAllowance.totalUsdPerYear).toBeGreaterThan(within.totalUsdPerYear);
  });
});

describe("every sale is priced above its delivery cost (brief non-negotiable 2)", () => {
  it("packs: price > max house cost per credit × credits + worst-case payment fees", () => {
    for (const [key, pack] of Object.entries(PACKS)) {
      const priceUsd = pack.priceCents / 100;
      const maxDeliveryUsd = pack.credits * DEFAULT_COST_MAX_PER_CREDIT_USD;
      const feesUsd = stripeFeeUsd(priceUsd);
      const margin = priceUsd - maxDeliveryUsd - feesUsd;
      expect(margin, `${key} margin`).toBeGreaterThan(0);
    }
    // The exact floors published in the brief:
    expect(19 - 25 * 0.3 - stripeFeeUsd(19)).toBeGreaterThanOrEqual(10.13);
    expect(59 - 100 * 0.3 - stripeFeeUsd(59)).toBeGreaterThanOrEqual(25.37);
  });

  it("lifetime (BYOK): our marginal delivery cost is hosting only, so price − fees stays positive at every tier", () => {
    for (let sale = 1; sale <= 500; sale++) {
      const priceUsd = priceCentsForSale(sale) / 100;
      expect(priceUsd - stripeFeeUsd(priceUsd)).toBeGreaterThan(0);
    }
  });

  it("the estimated cost of each credit-funded action fits inside the per-credit cap", () => {
    const cap = DEFAULT_COST_MAX_PER_CREDIT_USD;
    expect(estimateAiGrid(3, ENGINES, { geminiInsideFreeAllowance: false }).totalUsd).toBeLessThanOrEqual(CREDIT_COST.ai_grid_3 * cap);
    expect(estimateAiGrid(5, ENGINES, { geminiInsideFreeAllowance: false }).totalUsd).toBeLessThanOrEqual(CREDIT_COST.ai_grid_5 * cap);
    expect(estimateMapsGrid(9, "priority").totalUsd).toBeLessThanOrEqual(CREDIT_COST.maps_grid * cap);
    // Prospect report = Maps 5×5 standard + AI 3×3 on 3 engines + quick audit, for 2 credits
    const prospect = estimateMapsGrid(5, "standard").totalUsd + estimateAiGrid(3, ENGINES, { geminiInsideFreeAllowance: false }).totalUsd + 0.06;
    expect(prospect).toBeLessThanOrEqual(CREDIT_COST.prospect_report * cap);
  });

  it("an included-scan audit with its Fix Kit costs us less than its one credit, even at twice the estimate", () => {
    // Everything one credit pays for (brief 7.4 + 7.5): 4 profile lookups, 1 Maps lookup, the service
    // extraction, a 1×1 AI check on 3 engines, and the single Fix Kit model call.
    const estimate =
      4 * DATAFORSEO_BUSINESS_INFO_PER_CALL + DATAFORSEO_MAPS_PER_POINT.live + 2 * LLM_PARSE_BUDGET_USD +
      estimateAiGrid(1, ENGINES, { geminiInsideFreeAllowance: false }).totalUsd + LLM_FIX_KIT_BUDGET_USD;
    expect(estimate).toBeLessThan(0.12);
    expect(estimate * 2).toBeLessThanOrEqual(CREDIT_COST.audit * DEFAULT_COST_MAX_PER_CREDIT_USD);
    // And the cheapest price a credit is ever sold for still clears that cap after fees (first test in this block).
    const cheapestCreditUsd = Math.min(...Object.values(PACKS).map((p) => p.priceCents / 100 / p.credits));
    expect(cheapestCreditUsd).toBeGreaterThan(DEFAULT_COST_MAX_PER_CREDIT_USD);
  });
});
