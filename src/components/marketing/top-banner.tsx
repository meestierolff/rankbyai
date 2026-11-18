"use client";

import { REFUND_DAYS } from "@/lib/pricing-constants";
import { useOffer } from "./offer-context";

/**
 * Thin banner above the header. Every claim is live: the "price goes up" sentence is shown only
 * while the deal is open, with the real number of sales per step.
 */
export function TopBanner() {
  const { offer } = useOffer();
  const text = offer?.open
    ? `${REFUND_DAYS}-day no-questions refund. Price goes up every ${offer.seatsPerStep} sales. Lock in your price and pay once.`
    : `${REFUND_DAYS}-day no-questions refund. One payment, no subscription.`;
  return (
    <div role="note" className="border-b border-[#161616] bg-lp-banner">
      <div className="mx-auto flex max-w-[1180px] items-center justify-center gap-[10px] px-6 py-[9px] text-center font-mono text-[12px] text-lp-muted">
        <span aria-hidden className="size-[6px] flex-none rounded-full bg-lp-accent" />
        <span>{text}</span>
      </div>
    </div>
  );
}
