"use client";

import Link from "next/link";
import { useRef } from "react";
import { fmtPrice, formatClosesAt } from "@/lib/ladder";
import { useOffer, useOfferWatch } from "./offer-context";

/**
 * The one price sentence in a guide, from the live offer (server-seeded, refreshed via /api/offer).
 * Never a remembered figure: when the offer cannot be loaded it points at the pricing page instead.
 */
export function GuideOfferLine() {
  const { offer } = useOffer();
  const ref = useRef<HTMLSpanElement>(null);
  useOfferWatch(ref);
  if (!offer) return <span ref={ref}>The live price is on the <Link href="/pricing">pricing page</Link>.</span>;
  if (!offer.open) return <span ref={ref}>The lifetime deal has closed; current terms are on the <Link href="/pricing">pricing page</Link>.</span>;
  // The price steps up after every few sales; the close date ends the deal. Say both, so "$29 until
  // 16 December" is never implied.
  const seats = offer.seatsLeftAtCurrentPrice;
  return (
    <span ref={ref}>
      Lifetime access is <strong>{fmtPrice(offer.currentPriceUsd)}</strong> today, then <strong>{fmtPrice(offer.nextPriceUsd)}</strong> after the next{" "}
      {seats === 1 ? "sale" : `${seats} sales`}. The lifetime deal closes on <strong>{formatClosesAt(offer.closesAt)}</strong>.
    </span>
  );
}
