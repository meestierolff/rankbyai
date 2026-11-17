/**
 * Lifetime price ladder (pure maths). The database view `ladder_state` implements the
 * same formula in SQL; tests assert the two agree.
 *
 *   price(n) = base + step × floor(sold ÷ seatsPerStep)
 *
 * `sold` counts paid AND refunded lifetime orders plus active checkout holds, so a refund
 * never lowers the price and two buyers can never both be shown the last seat of a tier.
 * The counter sets the price, not a timer.
 */
export interface LadderConfig {
  basePriceCents: number;
  stepCents: number;
  seatsPerStep: number;
  closesAt: string; // ISO timestamp
}

export const DEFAULT_LADDER: LadderConfig = {
  basePriceCents: 2900,
  stepCents: 1000,
  seatsPerStep: 5,
  closesAt: "2026-12-16T13:00:00Z",
};

export interface Offer {
  soldTotal: number;
  currentPriceUsd: number;
  nextPriceUsd: number;
  seatsLeftAtCurrentPrice: number;
  seatsPerStep: number;
  stepUsd: number;
  basePriceUsd: number;
  bandIndex: number;
  upcoming: { priceUsd: number; seats: number }[];
  closesAt: string;
  open: boolean;
}

export function bandIndexFor(sold: number, cfg: LadderConfig = DEFAULT_LADDER): number {
  return Math.floor(Math.max(0, sold) / cfg.seatsPerStep);
}

/** Price in cents for the NEXT buyer when `sold` seats are already taken. */
export function priceCentsFor(sold: number, cfg: LadderConfig = DEFAULT_LADDER): number {
  return cfg.basePriceCents + cfg.stepCents * bandIndexFor(sold, cfg);
}

/** Price the n-th buyer pays (1-based): sale #1 → base, #6 → base + step. */
export function priceCentsForSale(saleNumber: number, cfg: LadderConfig = DEFAULT_LADDER): number {
  return priceCentsFor(saleNumber - 1, cfg);
}

export function seatsLeftFor(sold: number, cfg: LadderConfig = DEFAULT_LADDER): number {
  return cfg.seatsPerStep - (Math.max(0, sold) % cfg.seatsPerStep);
}

export function buildOffer(sold: number, cfg: LadderConfig = DEFAULT_LADDER, now: Date = new Date()): Offer {
  const band = bandIndexFor(sold, cfg);
  const current = priceCentsFor(sold, cfg);
  return {
    soldTotal: sold,
    currentPriceUsd: current / 100,
    nextPriceUsd: (current + cfg.stepCents) / 100,
    seatsLeftAtCurrentPrice: seatsLeftFor(sold, cfg),
    seatsPerStep: cfg.seatsPerStep,
    stepUsd: cfg.stepCents / 100,
    basePriceUsd: cfg.basePriceCents / 100,
    bandIndex: band,
    upcoming: [1, 2, 3, 4].map((k) => ({ priceUsd: (current + cfg.stepCents * k) / 100, seats: cfg.seatsPerStep })),
    closesAt: cfg.closesAt,
    open: now.getTime() < new Date(cfg.closesAt).getTime(),
  };
}

/** "calm" with 5–3 seats left, "warm" at 2, "hot" at 1 (pricing card accent). */
export function heatFor(seatsLeft: number): "calm" | "warm" | "hot" {
  if (seatsLeft <= 1) return "hot";
  if (seatsLeft === 2) return "warm";
  return "calm";
}

/** Static close-date text. No countdowns anywhere (brief: no fake urgency). */
export function formatClosesAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false });
  return `${date} at ${time} UTC`;
}

export const fmtPrice = (usd: number) => (Number.isInteger(usd) ? `$${usd}` : `$${usd.toFixed(2)}`);
