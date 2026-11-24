"use client";

import { fmtPrice, formatClosesAt } from "@/lib/ladder";
import { cn } from "@/lib/utils";
import { useOffer, type LiveOffer } from "./offer-context";

/**
 * The one-line status of the lifetime deal, built only from the live offer (/api/offer).
 * Null unless the offer loaded, the deal is open and at least one seat was actually paid for:
 * the line is social proof, so it never appears before the first sale. `paidTotal` is the honest
 * count (paid and refunded orders); `soldTotal` also counts active checkout holds.
 * No countdown: the close date is static text.
 */
export function ladderLineParts(offer: LiveOffer | null): string[] | null {
  if (!offer || !offer.open || !(offer.paidTotal > 0)) return null;
  return [
    `${fmtPrice(offer.currentPriceUsd)} lifetime`,
    `${offer.seatsLeftAtCurrentPrice} left at this price`,
    `then ${fmtPrice(offer.nextPriceUsd)}`,
    `closes ${formatClosesAt(offer.closesAt)}`,
  ];
}

/** The same line as one sentence ("… · … · …"), or null when it is hidden. */
export const ladderLine = (offer: LiveOffer | null): string | null => ladderLineParts(offer)?.join(SEP) ?? null;

const SEP = " · ";

/** The live line as a small pill with the live dot (hero and pricing heading). Renders nothing when the line is hidden. */
export function LiveLadderLine({ className }: { className?: string }) {
  const { offer } = useOffer();
  const parts = ladderLineParts(offer);
  if (!parts) return null;
  return (
    <p
      data-live-ladder-line
      className={cn(
        "m-0 inline-flex max-w-full items-center gap-2 rounded-2xl border border-[#2a2a2a] bg-[rgba(0,0,0,0.6)] px-[13px] py-[6px] text-left font-mono text-[12px] leading-[1.5] text-[#bdbdbd] sm:rounded-full",
        className,
      )}
    >
      <span aria-hidden className="size-[6px] shrink-0 rounded-full bg-lp-accent shadow-[0_0_10px_var(--lp-accent)]" />
      {/* On a phone the line wraps only between parts, never inside the close date. */}
      <span>
        {parts.map((p, i) => (
          <span key={i}>
            {i > 0 ? SEP : null}
            <span className="whitespace-nowrap">{p}</span>
          </span>
        ))}
      </span>
    </p>
  );
}
