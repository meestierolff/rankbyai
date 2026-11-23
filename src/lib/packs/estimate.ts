import type { Estimate } from "@/lib/cost-guard";
import { ENGINE_LABEL, type Engine } from "@/lib/pricing-constants";

/**
 * What a prompt pack run costs (pure). A run is one AI scan per prompt and repeat, so the estimate
 * is that scan's estimate (lib/cost-guard estimateScan: the same rates as run_ai_scan, measured
 * medians once they exist) × prompts × repeats. Nothing is hidden or rounded away: each engine's
 * line says how many answers it is.
 */
export interface PackEstimate extends Estimate {
  prompts: number;
  repeats: number;
  /** AI scans this run creates: prompts × repeats. */
  scans: number;
  /** Answers asked for: scans × points × engines. */
  answers: number;
  perScanUsd: number;
  note: string;
  /** The same pack at the business's map point and on the grids, so the user can choose (when computed). */
  alternatives?: PackAlternative[];
}

export interface PackAlternative {
  location: "pin" | "grid";
  grid_size: 1 | 3 | 5;
  answers: number;
  totalUsd: number;
  highUsd: number;
}

export function packEstimate(single: Estimate, prompts: number, repeats: number): PackEstimate {
  const scans = prompts * repeats;
  const perEngine = single.points;
  const lines = single.lines.map((l) => {
    const engine = l.provider as Engine;
    const name = ENGINE_LABEL[engine]?.short ?? l.provider;
    const n = perEngine * scans;
    return { provider: l.provider, label: `${name}, ${n} ${n === 1 ? "answer" : "answers"} (${prompts} ${prompts === 1 ? "prompt" : "prompts"} × ${repeats} ${repeats === 1 ? "run" : "runs"} × ${perEngine} ${perEngine === 1 ? "point" : "points"})`, usd: l.usd * scans };
  });
  return {
    ...single,
    totalUsd: single.totalUsd * scans,
    highUsd: single.highUsd * scans,
    // Prompt packs run on the user's own keys only: no included-scan credits are used.
    credits: 0,
    lines,
    prompts,
    repeats,
    scans,
    answers: single.points * single.lines.length * scans,
    perScanUsd: single.totalUsd,
    note: `${scans} AI ${scans === 1 ? "scan" : "scans"} (${prompts} ${prompts === 1 ? "prompt" : "prompts"} × ${repeats} ${repeats === 1 ? "run" : "runs"}) on your own API keys, at the rates of one AI scan. The high figure applies when Gemini's free monthly grounding allowance is used up. A scan that fails is not repeated.`,
  };
}

/** One alternative line from an estimate of the same pack at another location. */
export const alternativeOf = (e: PackEstimate, grid: 1 | 3 | 5): PackAlternative => ({
  location: grid === 1 ? "pin" : "grid", grid_size: grid, answers: e.answers, totalUsd: e.totalUsd, highUsd: e.highUsd,
});
