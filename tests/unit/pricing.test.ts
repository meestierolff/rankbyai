import { describe, expect, it } from "vitest";
import { MAPS_WORST_CASE_PER_POINT_USD, mapsCredits, mapsRunUsd, scanCreditsFor, withinCap } from "@/lib/cost/credits";
import { calculateYearlyDataCost, estimateAiGrid, estimateMapsGrid, scenarioCosts, scenarioYearlyAiCost, scenarioYearlyDataCost } from "@/lib/cost/estimate";
import { priceCentsForSale } from "@/lib/ladder";
import {
  AI_GRID_SIZES,
  AI_SAMPLE_EST_USD,
  CREDIT_COST,
  DATAFORSEO_BUSINESS_INFO_PER_CALL,
  DATAFORSEO_MAPS_PER_POINT,
  DEFAULT_COST_MAX_PER_CREDIT_USD,
  ENGINES,
  LLM_FIX_KIT_BUDGET_USD,
  LOCAL_FALCON_STARTER_CREDITS_PER_YEAR,
  LLM_PARSE_BUDGET_USD,
  MAPS_GRID_SIZES,
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
    expect(estimateMapsGrid(11, "live").totalUsd).toBeCloseTo(0.242, 3);
    expect(estimateMapsGrid(13, "live").totalUsd).toBeCloseTo(0.338, 3);
    expect(estimateMapsGrid(15, "standard").totalUsd).toBeCloseTo(0.135, 3);
    expect(estimateMapsGrid(15, "priority").totalUsd).toBeCloseTo(0.27, 3);
    expect(estimateMapsGrid(15, "live").totalUsd).toBeCloseTo(0.45, 3);
  });

  it("skipped points are not estimated: only the active points cost money", () => {
    expect(estimateMapsGrid(15, "live", 25)).toEqual({ points: 200, totalUsd: 200 * DATAFORSEO_MAPS_PER_POINT.live });
    expect(estimateMapsGrid(7, "standard", 48).points).toBe(1);
    const full = estimateAiGrid(5, ENGINES);
    const part = estimateAiGrid(5, ENGINES, { skipped: 10 });
    expect(part.points).toBe(15);
    expect(part.samples).toBe(45);
    expect(part.totalUsd).toBeCloseTo((full.totalUsd * 15) / 25, 9);
  });

  it("prices a year of monthly 3×3 AI checks plus a 7×7 Maps grid for 30 prompts at about $62", () => {
    const r = calculateYearlyDataCost({
      prompts: 30,
      aiGrid: 3,
      engines: ENGINES,
      frequency: "monthly",
      geminiFreeAllowance: true,
      mapsGrid: 7,
    });
    expect(r.checksPerYear).toBe(360);
    expect(Math.round(r.totalUsdPerYear)).toBe(62); // 360 × 9 × 0.0158 + 360 × 49 × 0.0006
    expect(r.geminiBillablePerMonth).toBe(0);
  });

  it("prices the published comparison scenario (weekly 7×7 Maps grids) at about $46 a year", () => {
    const r = scenarioYearlyDataCost();
    expect(r.checksPerYear).toBe(1560); // 10 clients × 3 prompts × 52 weeks
    expect(r.aiUsdPerYear).toBe(0);
    expect(r.totalUsdPerYear).toBeCloseTo(1560 * 49 * 0.0006, 6); // 45.864
    expect(Math.round(r.totalUsdPerYear)).toBe(46);
    expect(r.formula).toBe("1,560 Maps grids × 49 points × $0.0006");
  });

  it("prices the scenario's AI row (same 30 prompts, weekly 3×3 AI grids, 3 engines) like the calculator does", () => {
    const ai = scenarioYearlyAiCost();
    const calc = calculateYearlyDataCost({ prompts: 30, aiGrid: 3, engines: ["openai", "perplexity", "gemini"], frequency: "weekly", geminiFreeAllowance: true, mapsGrid: 0 });
    expect(ai.totalUsdPerYear).toBe(calc.totalUsdPerYear);
    expect(ai.mapsUsdPerYear).toBe(0);
    expect(ai.checksPerYear * ai.aiPointsPerCheck * 3).toBe(SCENARIO.aiAnswersPerYear); // 1,560 × 9 × 3
    expect(SCENARIO.aiDescription).toContain(SCENARIO.aiAnswersPerYear.toLocaleString("en-US"));
    // 1,170 grounded Gemini requests a month: inside the 5,000 free allowance.
    expect(ai.geminiBillablePerMonth).toBe(0);
    expect(Math.round(ai.totalUsdPerYear)).toBe(222);
    // The calculator figure a reviewer saw for $29 + weekly 7×7 Maps + weekly 3×3 AI on 3 engines.
    const c = scenarioCosts();
    expect(Math.round(29 + c.mapsUsd + c.aiUsd)).toBe(297);
    // Without the Gemini allowance every grounded request is billed: the extra is stated on the site.
    expect(c.geminiOverAllowanceUsd).toBeCloseTo(scenarioYearlyAiCost(false).totalUsdPerYear - ai.totalUsdPerYear, 6);
    expect(Math.round(c.geminiOverAllowanceUsd)).toBe(197);
  });

  it("the competitor plans in the comparison can run that scenario", () => {
    const points = SCENARIO.clients * SCENARIO.promptsPerClient * 52 * SCENARIO.mapsGrid ** 2;
    expect(points).toBe(SCENARIO.mapsPointsPerYear);
    // Local Falcon: one credit per grid point (its pricing page); Starter billed yearly includes 90,000.
    expect(points).toBeLessThanOrEqual(LOCAL_FALCON_STARTER_CREDITS_PER_YEAR);
    // BrightLocal: a 7×7 grid with up to 5 keywords on every plan; Track covers 6–10 locations.
    expect(SCENARIO.mapsGrid).toBeLessThanOrEqual(7);
    expect(SCENARIO.promptsPerClient).toBeLessThanOrEqual(5);
    expect(SCENARIO.clients).toBeLessThanOrEqual(10);
    expect(SCENARIO.description).toContain("76,440");
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

  it("every Maps grid, every number of skipped points, every queue: its credits cover the house cost", () => {
    // credits × the per-credit cap must cover the vendor cost of the active points in the dearest queue,
    // compared exactly as the engine's house-cap check compares them (lib/scans/engine runMaps).
    const cap = DEFAULT_COST_MAX_PER_CREDIT_USD;
    let checked = 0;
    for (const n of MAPS_GRID_SIZES) {
      for (let skipped = 0; skipped < n * n; skipped++) {
        const active = n * n - skipped;
        const credits = scanCreditsFor("maps", n, skipped);
        expect(credits).toBe(mapsCredits(active));
        for (const mode of ["standard", "priority", "live"] as const) {
          expect(withinCap(mapsRunUsd(active, mode), credits * cap), `${n}×${n}, ${skipped} skipped, ${mode}: ${credits} credits`).toBe(true);
          expect(withinCap(estimateMapsGrid(n, mode, skipped).totalUsd, credits * cap)).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBe(3 * MAPS_GRID_SIZES.reduce((s, n) => s + n * n, 0));
    // Never more credits than needed: one credit fewer would not cover the dearest queue.
    for (const n of MAPS_GRID_SIZES) {
      const credits = scanCreditsFor("maps", n);
      if (credits > CREDIT_COST.maps_grid) expect(withinCap(mapsRunUsd(n * n, "live"), (credits - 1) * cap)).toBe(false);
    }
    expect(MAPS_WORST_CASE_PER_POINT_USD).toBe(DATAFORSEO_MAPS_PER_POINT.live);
  });

  it("Maps grids 3×3 to 9×9 keep their one-credit price; the larger grids cost what they need", () => {
    for (const n of [3, 5, 7, 9] as const) expect(scanCreditsFor("maps", n), `${n}×${n}`).toBe(CREDIT_COST.maps_grid);
    expect(scanCreditsFor("maps", 11)).toBe(1); // 121 × $0.002 = $0.242
    expect(scanCreditsFor("maps", 13)).toBe(2); // 169 × $0.002 = $0.338
    expect(scanCreditsFor("maps", 15)).toBe(2); // 225 × $0.002 = $0.45
    expect(scanCreditsFor("maps", 15, 75)).toBe(1); // 150 active points × $0.002 = $0.30, exactly one credit
    expect(scanCreditsFor("maps", 15, 74)).toBe(2);
    // A lower runtime cap (COST_MAX_PER_CREDIT_USD) raises the credits so the cap still covers the run.
    expect(scanCreditsFor("maps", 11, 0, 0.2)).toBe(2);
    expect(withinCap(mapsRunUsd(121, "live"), scanCreditsFor("maps", 11, 0, 0.2) * 0.2)).toBe(true);
  });

  it("AI grids keep the brief's credit table; skipping points never makes a check dearer", () => {
    expect(AI_GRID_SIZES.map((n) => scanCreditsFor("ai", n))).toEqual([CREDIT_COST.ai_grid_1, CREDIT_COST.ai_grid_3, CREDIT_COST.ai_grid_5]);
    const cap = DEFAULT_COST_MAX_PER_CREDIT_USD;
    for (const n of AI_GRID_SIZES) {
      for (let skipped = 0; skipped < n * n; skipped++) {
        const credits = scanCreditsFor("ai", n, skipped);
        expect(credits).toBeLessThanOrEqual(scanCreditsFor("ai", n));
        // The high estimate (Gemini beyond its free allowance) of the active points fits the cap.
        expect(estimateAiGrid(n, ENGINES, { geminiInsideFreeAllowance: false, skipped }).totalUsd).toBeLessThanOrEqual(credits * cap);
      }
    }
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
