"use client";

import { useEffect, useState } from "react";
import { CtaLink, LiveDot } from "@/components/brand/primitives";
import { fmtPrice } from "@/lib/ladder";
import { REFUND_DAYS } from "@/lib/pricing-constants";
import { BUY_HREF, CtaLabel, useOffer } from "./offer-context";

export function FinalCta() {
  const { offer } = useOffer();
  return (
    <section className="border-t border-line">
      <div className="container-page flex flex-col items-center gap-[26px] py-[clamp(96px,12vw,160px)] text-center">
        <h2 className="text-cta m-0 max-w-[960px]">Stop renting your AI visibility tracker.</h2>
        {offer?.open ? (
          <p className="m-0 max-w-[720px] text-[clamp(17px,1.5vw,21px)] leading-[1.55] text-pretty text-muted-foreground">
            {offer.seatsLeftAtCurrentPrice} left at <span className="text-fg">{fmtPrice(offer.currentPriceUsd)}</span>. The next{" "}
            {offer.seatsPerStep} buyers pay <span className="text-fg">{fmtPrice(offer.nextPriceUsd)}</span>. You pay for the data either way.
          </p>
        ) : null}
        <CtaLink href={BUY_HREF} size="lg">
          <CtaLabel label="Get lifetime access" />
        </CtaLink>
        <span className="text-[14px] text-dim">One payment · Your own keys · {REFUND_DAYS}-day refund</span>
      </div>
    </section>
  );
}

/** Sticky buy bar: hidden until the visitor has scrolled past the hero. */
export function StickyBar() {
  const { offer, notice, dismissNotice } = useOffer();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!offer?.open) return null;
  return (
    <>
      {notice ? (
        <div role="status" className="fixed top-[84px] left-1/2 z-50 flex w-[min(92vw,560px)] -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-[14px] shadow-popover">
          <span>{notice}</span>
          <button type="button" onClick={dismissNotice} className="cursor-pointer text-muted-foreground hover:text-fg" aria-label="Dismiss">✕</button>
        </div>
      ) : null}
      <div
        aria-hidden={!show}
        className="fixed inset-x-0 bottom-0 z-[35] border-t border-line bg-[rgba(11,11,11,0.9)] backdrop-blur-[12px] transition-transform duration-300"
        style={{ transform: show ? "translateY(0)" : "translateY(110%)" }}
      >
        <div className="container-page flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <LiveDot className="size-[9px]" />
            <div className="flex flex-col gap-[2px]">
              <span className="text-[16px]">
                <span className="font-semibold">{fmtPrice(offer.currentPriceUsd)}</span> <span className="text-muted-foreground">lifetime</span>
              </span>
              <span className="text-[13px] text-muted-foreground">
                <span className="text-danger">{offer.seatsLeftAtCurrentPrice}</span> left, then {fmtPrice(offer.nextPriceUsd)}
              </span>
            </div>
          </div>
          <CtaLink href={BUY_HREF} size="md" tabIndex={show ? 0 : -1}>Lock it in</CtaLink>
        </div>
      </div>
    </>
  );
}
