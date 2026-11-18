import { CREDIT_COST, DATAFORSEO_MAPS_PER_POINT, DEFAULT_COST_MAX_PER_CREDIT_USD, MAPS_GRID_SIZES, type MapsMode } from "@/lib/pricing-constants";

/**
 * Credits per scan. ONE rule for the server (creditsFor in lib/cost-guard), the app's forms
 * (scanCredits in components/app/first-run), the API estimates and the margin test
 * (tests/unit/pricing.test.ts). Client-safe: plain values only.
 *
 * Maps: an included scan may spend at most credits × COST_MAX_PER_CREDIT_USD of our money
 * (houseCapUsd), so a grid costs enough credits to cover its active points at the dearest Maps
 * queue (live), whichever queue it runs on. A schedule runs on the Standard queue and a manual run
 * may pick Live, so one grid has one price. Never below CREDIT_COST.maps_grid.
 *
 * AI: the brief's table (1×1 and 3×3: 1 credit, 5×5: 3), priced by the smallest AI grid that holds
 * the active points, so skipping points never makes a check dearer.
 */

/** Whole micro-dollars, so a cost and a cap compare exactly (no float noise at a boundary). */
export const usdMicros = (usd: number): number => (Number.isFinite(usd) ? Math.round(usd * 1_000_000) : usd);

/** True when `usd` stays inside `capUsd`, compared in whole micro-dollars. */
export const withinCap = (usd: number, capUsd: number): boolean => usdMicros(usd) <= usdMicros(capUsd);

/** The dearest Maps queue's price per point: what a credit has to cover in the worst case. */
export const MAPS_WORST_CASE_PER_POINT_USD = Math.max(...Object.values(DATAFORSEO_MAPS_PER_POINT));

/** House cost of a Maps run at the vendor's list price: active points × the queue's price per point. */
export const mapsRunUsd = (activePoints: number, mode: MapsMode): number => activePoints * DATAFORSEO_MAPS_PER_POINT[mode];

/** Credits for a Maps grid with `activePoints` points to check. */
export function mapsCredits(activePoints: number, capUsd: number = DEFAULT_COST_MAX_PER_CREDIT_USD): number {
  const points = Math.max(0, Math.floor(activePoints));
  const need = Math.ceil((points * usdMicros(MAPS_WORST_CASE_PER_POINT_USD)) / Math.max(1, usdMicros(capUsd)));
  return Math.max(CREDIT_COST.maps_grid, need);
}

/** Credits for an AI check with `activePoints` points: the price of the smallest AI grid that holds them. */
export function aiCredits(activePoints: number): number {
  if (activePoints <= 1) return CREDIT_COST.ai_grid_1;
  if (activePoints <= 9) return CREDIT_COST.ai_grid_3;
  return CREDIT_COST.ai_grid_5;
}

/**
 * Credits one scan costs: an n×n grid with `skipped` points switched off.
 * `capUsd` is COST_MAX_PER_CREDIT_USD: the server passes its runtime value, the browser the default.
 */
export function scanCreditsFor(kind: "ai" | "maps", grid: number, skipped = 0, capUsd: number = DEFAULT_COST_MAX_PER_CREDIT_USD): number {
  const active = Math.max(1, grid * grid - Math.max(0, skipped));
  return kind === "maps" ? mapsCredits(active, capUsd) : aiCredits(active);
}

// ───────────────────────── copy, generated from the rule above ─────────────────────────

/** "3×3, 5×5 or 7×7" (conj "or") / "13×13 and 15×15" (conj "and") */
export function gridSizesText(sizes: readonly number[], conj: "or" | "and" = "or"): string {
  const t = sizes.map((n) => `${n}×${n}`);
  return t.length > 1 ? `${t.slice(0, -1).join(", ")} ${conj} ${t[t.length - 1]}` : t.join("");
}

/** Full Maps grids (nothing skipped) grouped by their credit cost, cheapest first. */
export function mapsCreditTiers(sizes: readonly number[] = MAPS_GRID_SIZES): { credits: number; sizes: number[] }[] {
  const tiers: { credits: number; sizes: number[] }[] = [];
  for (const n of sizes) {
    const credits = scanCreditsFor("maps", n);
    const tier = tiers.find((t) => t.credits === credits);
    if (tier) tier.sizes.push(n);
    else tiers.push({ credits, sizes: [n] });
  }
  return tiers.sort((x, y) => x.credits - y.credits);
}

/** The largest Maps grid one credit pays for in full, e.g. "11×11". */
export const largestOneCreditMapsGrid = (): string => {
  const n = Math.max(...(mapsCreditTiers().find((t) => t.credits === CREDIT_COST.maps_grid)?.sizes ?? [MAPS_GRID_SIZES[0]]));
  return `${n}×${n}`;
};

/** The Maps grids that cost more than one credit, e.g. "13×13 and 15×15 Maps grids use 2 credits". Empty when there are none. */
export function largerMapsGridsText(): string {
  return mapsCreditTiers()
    .filter((t) => t.credits > CREDIT_COST.maps_grid)
    .map((t) => `${gridSizesText(t.sizes, "and")} Maps ${t.sizes.length === 1 ? "grid uses" : "grids use"} ${t.credits} credits`)
    .join("; ");
}
