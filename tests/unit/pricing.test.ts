import { describe, expect, it } from "vitest";
import { calculateYearlyDataCost, estimateAiGrid, estimateMapsGrid } from "@/lib/cost/estimate";
import { priceCentsForSale } from "@/lib/ladder";
import {
  AI_SAMPLE_EST_USD,
  CREDIT_COST,
  DEFAULT_COST_MAX_PER_CREDIT_USD,
  ENGINES,
  PACKS,
  SCENARIO,
  stripeFeeUsd,
} from "@/lib/pricing-constants";

describe("vendor price constants", () => {
  it("derives the per-sample estimates stated in the brief", () => {
    expect(AI_SAMPLE_EST_USD.openai).toBeCloseTo(0.0133, 4);
    expect(AI_SAMPLE_EST_USD.perplexity).toBeCloseTo(0.0025, 4);
    expect(AI_SAMPLE_EST_USD.geminiFree).toBeCloseTo(0.0016, 4);
    expect(AI_SAMPLE_EST_USD.geminiPaid).toBeCloseTo(0.0156, 4);
  });

  it("matches the published AI grid ranges", () => {
    const g1 = estimateAiGrid(1, ENGINES).rangeUsd;
    const g3 = estimateAiGrid(3, ENGINES).rangeUsd;
    const g5 = estimateAiGrid(5, ENGINES).rangeUsd;
    expect(g1.low).toBeCloseTo(0.017, 3);
    expect(g1.high).toBeCloseTo(0.031, 3);
    expect(g3.low).toBeCloseTo(0.16, 2);
    expect(g3.high).toBeCloseTo(0.28, 2);
    expect(Math.abs(g5.low - 0.44)).toBeLessThan(0.006); // 0.435: the brief rounds up
    expect(Math.abs(g5.high - 0.79)).toBeLessThan(0.006); // 0.785: the brief rounds up
  });

  it("matches the published Maps grid totals", () => {
    expect(estimateMapsGrid(7, "standard").totalUsd).toBeCloseTo(0.029, 3);
    expect(estimateMapsGrid(7, "priority").totalUsd).toBeCloseTo(0.059, 3);
    expect(estimateMapsGrid(7, "live").totalUsd).toBeCloseTo(0.098, 3);
    expect(estimateMapsGrid(9, "standard").totalUsd).toBeCloseTo(0.049, 3);
    expect(estimateMapsGrid(9, "priority").totalUsd).toBeCloseTo(0.097, 3);
    expect(estimateMapsGrid(9, "live").totalUsd).toBeCloseTo(0.162, 3);
  });

  it("prices the comparison scenario at about $67 a year", () => {
    const r = calculateYearlyDataCost({
      prompts: SCENARIO.clients * SCENARIO.promptsPerClient,
      aiGrid: SCENARIO.aiGrid,
      engines: ENGINES,
      frequency: "monthly",
      geminiFreeAllowance: true,
      mapsGrid: SCENARIO.mapsGrid,
    });
    expect(r.checksPerYear).toBe(360);
    expect(Math.round(r.totalUsdPerYear)).toBe(67);
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
});
