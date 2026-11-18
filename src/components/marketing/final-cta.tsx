"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtPrice } from "@/lib/ladder";
import { REFUND_DAYS } from "@/lib/pricing-constants";
import { CreamLink, outlineClass } from "./lp";
import { BUY_HREF, CtaLabel, useOffer } from "./offer-context";

export function FinalCta() {
  const { offer } = useOffer();
  return (
    <section className="relative overflow-hidden border-t border-[#121212] bg-lp-bg px-6 pt-[170px] pb-[180px] text-center text-lp-fg">
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-360px] left-1/2 ml-[-700px] h-[600px] w-[1400px] bg-[radial-gradient(closest-side,rgba(255,110,30,0.16),rgba(255,110,30,0)_100%)]"
      />
      <h2 className="relative m-0 text-[clamp(56px,10vw,128px)] leading-[0.95] font-semibold tracking-[-0.055em]">Stop renting.</h2>
      {offer?.open ? (
        <p className="relative mx-auto mt-[26px] mb-0 max-w-[520px] text-[18px] leading-[1.55] text-lp-muted">
          {offer.seatsLeftAtCurrentPrice} left at <span className="text-lp-fg">{fmtPrice(offer.currentPriceUsd)}</span>. The next {offer.seatsPerStep} buyers pay{" "}
          <span className="text-lp-fg">{fmtPrice(offer.nextPriceUsd)}</span>. You pay for the data either way.
        </p>
      ) : null}
      <div className="relative mt-10 flex flex-wrap justify-center gap-3">
        <CreamLink href={BUY_HREF} size="lg" arrow={false} className="px-6 py-[15px] text-[17px] font-medium">
          <CtaLabel label="Get lifetime access" />
        </CreamLink>
        <Link href="/login" className={outlineClass("rounded-xl px-6 py-[14px] text-[17px]")}>Sign in and look around</Link>
      </div>
      <div className="relative mt-[18px] font-mono text-[12px] text-lp-faint">One payment · Your own keys · {REFUND_DAYS}-day refund</div>
    </section>
  );
}

/** Sticky buy bar: hidden until the visitor has scrolled past the hero. */
export function StickyBar() {
  const { offer, notice, dismissNotice } = useOffer();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 640);
    const raf = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  if (!offer?.open) return null;
  return (
    <>
      {notice ? (
        <div role="status" className="fixed top-[84px] left-1/2 z-[60] flex w-[min(92vw,560px)] -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-lp-border-2 bg-lp-surface px-4 py-3 text-[14px] text-lp-fg shadow-lp-bezel">
          <span>{notice}</span>
          <button type="button" onClick={dismissNotice} className="cursor-pointer text-lp-muted hover:text-lp-fg" aria-label="Dismiss">✕</button>
        </div>
      ) : null}
      <div
        aria-hidden={!show}
        className="fixed inset-x-0 bottom-0 z-[35] border-t border-lp-line bg-[rgba(0,0,0,0.88)] text-lp-fg backdrop-blur-[14px] transition-transform duration-300"
        style={{ transform: show ? "translateY(0)" : "translateY(110%)" }}
      >
        <div className="container-lp flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <span aria-hidden className="size-[7px] flex-none rounded-full bg-lp-accent shadow-[0_0_10px_var(--lp-accent)]" />
            <div className="flex flex-col gap-[2px]">
              <span className="text-[16px]">
                <span className="font-semibold">{fmtPrice(offer.currentPriceUsd)}</span> <span className="text-lp-muted">lifetime</span>
              </span>
              <span className="font-mono text-[12px] text-lp-muted">
                <span className="text-lp-accent-text">{offer.seatsLeftAtCurrentPrice}</span> left, then {fmtPrice(offer.nextPriceUsd)}
              </span>
            </div>
          </div>
          <CreamLink href={BUY_HREF} size="md" tabIndex={show ? 0 : -1}>Lock it in</CreamLink>
        </div>
      </div>
    </>
  );
}
