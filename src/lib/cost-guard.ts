import "server-only";
import { gridSizesText, scanCreditsFor } from "@/lib/cost/credits";
import { estimateAiGrid, estimateMapsGrid, type EngineRates } from "@/lib/cost/estimate";
import { costEnv } from "@/lib/env";
import {
  AI_GRID_SIZES, ENGINE_LABEL, ENGINES, MAPS_GRID_SIZES, type AiGridSize, type Engine, type MapsGridSize, type MapsMode,
} from "@/lib/pricing-constants";
import { dbAdmin } from "@/lib/db/clients";
import { validateSkipPoints } from "@/lib/scans/skip";

/**
 * Cost guard (brief 10.2). Estimate before every run; for house-key scans, hard caps:
 * per credit, per day (credits) and per day (free checks). BYOK scans are the user's own spend:
 * we only apply a per-request sanity limit and a concurrency limit.
 */
/** `skip`: idx of the grid points not to check (lib/scans/skip). They are never sent to a vendor and cost nothing. */
export type ScanSpec =
  | { kind: "ai"; grid: AiGridSize; engines: Engine[]; skip?: number[] }
  | { kind: "maps"; grid: MapsGridSize; mode: MapsMode; skip?: number[] };

export interface Estimate {
  /** Grid points that will be checked. */
  points: number;
  /** Grid points switched off for this scan. */
  skipped: number;
  totalUsd: number;
  /** Upper bound when Gemini grounding falls outside the monthly free allowance. */
  highUsd: number;
  lines: { provider: string; label: string; usd: number }[];
  credits: number;
  basis: "published prices" | "measured median";
}

export const BYOK_MAX_RUNNING_SCANS = 3;

export function validateSpec(spec: ScanSpec): string | null {
  if (spec.kind === "ai") {
    if (!(AI_GRID_SIZES as readonly number[]).includes(spec.grid)) return `AI grids are ${gridSizesText(AI_GRID_SIZES)}.`;
    if (spec.engines.length === 0) return "Pick at least one AI engine.";
    if (spec.engines.some((e) => !ENGINES.includes(e))) return "Unknown AI engine.";
    if (new Set(spec.engines).size !== spec.engines.length) return "Each engine can be picked once.";
    return validateSkipPoints(spec.grid, spec.skip);
  }
  if (!(MAPS_GRID_SIZES as readonly number[]).includes(spec.grid)) return `Maps grids are ${gridSizesText(MAPS_GRID_SIZES)}.`;
  if (!["standard", "priority", "live"].includes(spec.mode)) return "Unknown Maps mode.";
  return validateSkipPoints(spec.grid, spec.skip);
}

/** Credits for a scan: one rule shared with the browser and the margin test (lib/cost/credits), at this deployment's per-credit cap. */
export function creditsFor(spec: ScanSpec): number {
  return scanCreditsFor(spec.kind, spec.grid, spec.skip?.length ?? 0, costEnv.get().COST_MAX_PER_CREDIT_USD);
}

let medianCache: { at: number; rates: Partial<EngineRates> } | null = null;

/** Trailing median cost per engine once ≥ 50 real samples exist; published-price estimates until then. */
export async function measuredRates(): Promise<Partial<EngineRates>> {
  if (medianCache && Date.now() - medianCache.at < 10 * 60_000) return medianCache.rates;
  const rates: Partial<EngineRates> = {};
  try {
    const { data } = await dbAdmin().rpc("engine_cost_medians", { p_min_samples: 50, p_window: 200 });
    for (const row of (data ?? []) as { engine: Engine; median_usd: number }[]) rates[row.engine] = Number(row.median_usd);
  } catch {}
  medianCache = { at: Date.now(), rates };
  return rates;
}

export async function estimateScan(spec: ScanSpec): Promise<Estimate> {
  const skipped = spec.skip?.length ?? 0;
  if (spec.kind === "maps") {
    const e = estimateMapsGrid(spec.grid, spec.mode, skipped);
    return {
      points: e.points, skipped, totalUsd: e.totalUsd, highUsd: e.totalUsd, credits: creditsFor(spec), basis: "published prices",
      lines: [{ provider: "dataforseo", label: `DataForSEO Maps, ${e.points} ${e.points === 1 ? "point" : "points"} (${spec.mode})`, usd: e.totalUsd }],
    };
  }
  const measured = await measuredRates();
  const e = estimateAiGrid(spec.grid, spec.engines, { measured, geminiInsideFreeAllowance: true, skipped });
  return {
    points: e.points,
    skipped,
    totalUsd: e.totalUsd,
    highUsd: e.rangeUsd.high,
    credits: creditsFor(spec),
    basis: spec.engines.every((en) => measured[en] !== undefined) ? "measured median" : "published prices",
    lines: spec.engines.map((en) => ({ provider: en, label: `${ENGINE_LABEL[en].short}, ${e.points} ${e.points === 1 ? "sample" : "samples"}`, usd: e.perEngineUsd[en] ?? 0 })),
  };
}

export async function runningScanCount(workspaceId: string): Promise<number> {
  const { count } = await dbAdmin().from("scans").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("status", ["queued", "running"]);
  return count ?? 0;
}

export type HouseFunding = "credits" | "free" | "internal";

export async function houseSpendToday(funding: HouseFunding): Promise<number> {
  const { data } = await dbAdmin().rpc("house_spend");
  return ((data ?? []) as { funding: string; usd: number }[]).filter((r) => r.funding === funding).reduce((s, r) => s + Number(r.usd), 0);
}

/** May this house-funded action start today? Reserves nothing; `logHouseSpend` records the commit. */
export async function houseBudgetCheck(funding: HouseFunding, estUsd: number): Promise<{ ok: boolean; message?: string }> {
  if (funding === "internal") return { ok: true };
  const env = costEnv.get();
  const cap = funding === "free" ? env.COST_DAILY_FREE_CAP_USD : env.COST_DAILY_HOUSE_CAP_USD;
  const spent = await houseSpendToday(funding);
  if (spent + estUsd > cap) {
    return { ok: false, message: funding === "free" ? "Today's free checks are used up. Yours is queued for tomorrow." : "Included scans are at today's capacity. Try again tomorrow, or run this scan on your own keys." };
  }
  return { ok: true };
}

export async function logHouseSpend(funding: HouseFunding, scanId: string | null, perProvider: Record<string, number>) {
  const rows = Object.entries(perProvider).filter(([, usd]) => usd > 0).map(([provider, usd]) => ({ provider, usd, scan_id: scanId, funding, kind: "commit" }));
  if (rows.length) await dbAdmin().from("spend_log").insert(rows);
}

/** Hard cap on house spend for a credit-funded action: credits × COST_MAX_PER_CREDIT_USD. A free check gets a fixed small cap. */
export function houseCapUsd(funding: HouseFunding, credits: number): number {
  if (funding === "internal") return Number.POSITIVE_INFINITY;
  if (funding === "free") return 0.1;
  return Math.max(1, credits) * costEnv.get().COST_MAX_PER_CREDIT_USD;
}
