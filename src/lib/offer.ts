import { cacheLife, cacheTag } from "next/cache";
import { buildOffer, type LadderConfig, type Offer } from "@/lib/ladder";
import { supabasePublicEnv } from "@/lib/env";
import { supabasePublic } from "@/lib/supabase/public";

/**
 * The live lifetime offer. One source for every price on the site.
 * When the database is unreachable we return `available: false` and the UI shows
 * "price unavailable" — we never fall back to a guessed number.
 */
export type OfferResult =
  | { available: true; offer: Offer; paidTotal: number }
  | { available: false; reason: "not_configured" | "unreachable" };

interface LadderStateRow {
  sold_total: number;
  paid_total: number;
  base_price_cents: number;
  step_cents: number;
  seats_per_step: number;
  closes_at: string;
}

export async function fetchOfferFresh(now: Date = new Date()): Promise<OfferResult> {
  if (!supabasePublicEnv.isConfigured()) return { available: false, reason: "not_configured" };
  try {
    const { data, error } = await supabasePublic().from("ladder_state").select("*").single<LadderStateRow>();
    if (error || !data) return { available: false, reason: "unreachable" };
    const cfg: LadderConfig = {
      basePriceCents: data.base_price_cents,
      stepCents: data.step_cents,
      seatsPerStep: data.seats_per_step,
      closesAt: new Date(data.closes_at).toISOString(),
    };
    return { available: true, offer: buildOffer(data.sold_total, cfg, now), paidTotal: data.paid_total };
  } catch {
    return { available: false, reason: "unreachable" };
  }
}

/** Cached for prerendered pages and JSON-LD. Revalidated every minute and on every sale (tag "offer"). */
export async function getOfferCached(): Promise<OfferResult> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 600 });
  cacheTag("offer");
  return fetchOfferFresh();
}
