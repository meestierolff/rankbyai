import { CREDIT_COST, DATAFORSEO_MAPS_PER_POINT } from "@/lib/pricing-constants";

/*
 * First-run and funding rules for the signed-in app. Pure functions of plain values (no database,
 * no browser), shared by server pages and client forms and covered by tests/unit/app-first-run.test.ts.
 *
 * Nothing here decides what the server allows: every route still checks keys, credits and the
 * daily capacity itself. These rules only make a form OPEN on the option that can actually run,
 * and say up front what would otherwise come back as an error after submit.
 */

export type FundingChoice = "byok" | "credits";

/** Credits one scan costs. Same table and same rule as creditsFor() in lib/cost-guard (server-only). */
export function scanCredits(kind: "ai" | "maps", grid: number): number {
  if (kind === "maps") return CREDIT_COST.maps_grid;
  return grid === 5 ? CREDIT_COST.ai_grid_5 : grid === 3 ? CREDIT_COST.ai_grid_3 : CREDIT_COST.ai_grid_1;
}

export interface FundingFacts {
  /** The workspace has a valid own key for this action. */
  ownKeys: boolean;
  /** Included-scan credit balance. */
  credits: number;
  /** Credits this action costs. */
  cost: number;
  /** Our own keys for this action are in place on this deployment. */
  includedOpen: boolean;
}

/** Why included scans cannot pay for this action today, in plain words; null when they can. */
export function creditsBlocker({ credits, cost, includedOpen }: Omit<FundingFacts, "ownKeys">): string | null {
  if (!includedOpen) return "Included scans are not switched on for this yet. It runs on your own API keys today.";
  if (credits < cost) {
    return credits === 0
      ? `You have no included scan credits. This needs ${plural(cost, "credit")}: buy a pack on the Billing page, or use your own keys.`
      : `This needs ${plural(cost, "credit")} and you have ${credits}. Buy a pack on the Billing page, pick a smaller run, or use your own keys.`;
  }
  return null;
}

/**
 * The "Paid with" option a form opens on: own keys when the workspace has them, otherwise included
 * scans when those can pay for it. With neither, it stays on own keys and the form says what is missing.
 */
export function defaultFunding(facts: FundingFacts): FundingChoice {
  if (facts.ownKeys) return "byok";
  return creditsBlocker(facts) === null ? "credits" : "byok";
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "12 credits left" under the funding control, so the option label itself stays short. */
export const creditsLeft = (credits: number) => `${plural(credits, "included scan credit")} left`;

// ───────────────────────── plan and seat ─────────────────────────

/** Lifetime access with or without a numbered seat. Never a dash for a missing number. */
export function planLabel(plan: string, seat: number | null | undefined): string {
  if (plan !== "lifetime") return "Not purchased";
  return seat != null ? `Lifetime · seat #${seat}` : "Lifetime";
}
export const seatText = (seat: number | null | undefined): string | null => (seat != null ? `Seat #${seat}` : null);

// ───────────────────────── dashboard ─────────────────────────

/** Hint under "API keys connected". With credits, keys are not needed to start scanning. */
export function keysHint(validKeys: number, credits: number, includedOpen: boolean): string {
  if (validKeys > 0) return "Tested and encrypted";
  if (credits > 0 && includedOpen) return "Not needed for scans paid with included credits. Adding a business still needs a DataForSEO login.";
  return "Add DataForSEO and one AI key to start";
}

export interface FirstRunFacts {
  /** Lifetime access not bought: real scans are switched off. */
  locked: boolean;
  /** Businesses in the workspace. */
  businesses: number;
  /** Scans that finished (done or partial), of any kind. */
  finishedScans: number;
  /** The newest scan that is still queued or running, if any. */
  activeScan: { id: string; kind: "ai" | "maps" } | null;
  /** The newest scan failed and nothing is running. */
  lastScanFailed: boolean;
  /** A valid DataForSEO login: the listing search of step 1 runs on it and cannot be paid with credits. */
  hasSearchKey: boolean;
  /** What the first AI check costs, from the app's own estimator; null when nothing can pay for it yet. */
  checkCost: string | null;
}

export interface FirstRunStep {
  key: "business" | "check" | "report";
  title: string;
  detail: string;
  href: string;
  /** Link text. */
  action: string;
  state: "done" | "current" | "todo";
}

const scanPath = (s: { id: string; kind: "ai" | "maps" }) => `/app/${s.kind === "ai" ? "ai-visibility" : "maps-grid"}/${s.id}`;

/**
 * The "Get started" checklist. Returns null once the workspace has finished a scan: from then on
 * the dashboard shows its real numbers instead.
 */
export function firstRunSteps(f: FirstRunFacts): FirstRunStep[] | null {
  if (f.finishedScans > 0) return null;
  const hasBusiness = f.businesses > 0;
  const searchCost = `$${DATAFORSEO_MAPS_PER_POINT.live.toFixed(3)}`;

  const business: FirstRunStep = {
    key: "business",
    title: "Add your first business",
    state: hasBusiness ? "done" : "current",
    ...(hasBusiness
      ? { detail: `${plural(f.businesses, "business")} added.`, href: "/app/businesses", action: "Businesses" }
      : f.locked
        ? { detail: "Search the Google listing by name and confirm it. Needs lifetime access.", href: "/app/businesses", action: "See the form" }
        : f.hasSearchKey
          ? { detail: `Search the Google listing by name and confirm it. One lookup on your DataForSEO key: ${searchCost}.`, href: "/app/businesses", action: "Add a business" }
          : {
              detail: `The listing search runs on your own DataForSEO login (${searchCost} per search). Included scan credits cannot pay for this step, so add that login first.`,
              href: "/app/settings/keys",
              action: "Add your DataForSEO login",
            }),
  };

  const check: FirstRunStep = {
    key: "check",
    title: "Run your first AI check",
    state: hasBusiness ? "current" : "todo",
    ...(f.activeScan
      ? { detail: "Running now. The grid fills in point by point; you can leave the page and come back.", href: scanPath(f.activeScan), action: "Watch it run" }
      : {
          detail: `${f.lastScanFailed ? "Your last scan did not finish. " : ""}${f.checkCost ?? "Needs one AI key (Settings → API keys) or included scan credits."} You see the estimate before anything runs.`,
          href: "/app/ai-visibility",
          action: "Run an AI check",
        }),
  };

  const report: FirstRunStep = {
    key: "report",
    title: "Open the report and share it",
    state: "todo",
    detail: "The result shows where each AI engine names the business and who it names instead. From there, the business page gives you a live link your client can open without an account.",
    href: f.activeScan ? scanPath(f.activeScan) : "/app/ai-visibility",
    action: f.activeScan ? "Open the scan" : "Where reports appear",
  };

  return [business, check, report];
}
