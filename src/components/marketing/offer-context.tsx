"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { fmtPrice, type Offer } from "@/lib/ladder";
import { track, trackOnce } from "@/lib/analytics";

/**
 * Live lifetime offer for the whole marketing page: ONE source for every price and seat count
 * (header, hero, pricing card, ladder, final CTA, sticky bar). Server-rendered from the cached
 * offer, refreshed on mount, then polled every 15 s while the pricing section is on screen.
 */
export type LiveOffer = Offer & { paidTotal: number };

interface OfferCtx {
  offer: LiveOffer | null;
  /** Non-blocking notice when the price rose while the page was open. */
  notice: string | null;
  dismissNotice: () => void;
  refresh: () => Promise<LiveOffer | null>;
  setWatching: (on: boolean) => void;
}

const Ctx = createContext<OfferCtx | null>(null);

export function OfferProvider({ initial, children }: { initial: LiveOffer | null; children: ReactNode }) {
  const [offer, setOffer] = useState<LiveOffer | null>(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const last = useRef<LiveOffer | null>(initial);

  const refresh = useCallback(async (): Promise<LiveOffer | null> => {
    try {
      const res = await fetch("/api/offer", { cache: "no-store" });
      if (!res.ok) return last.current;
      const next = (await res.json()) as LiveOffer;
      const prev = last.current;
      if (prev && next.currentPriceUsd > prev.currentPriceUsd) {
        setNotice(`Price just moved to ${fmtPrice(next.currentPriceUsd)} (someone bought the last ${fmtPrice(prev.currentPriceUsd)} seat).`);
        track("price_changed_shown", { from_cents: prev.currentPriceUsd * 100, to_cents: next.currentPriceUsd * 100 });
      }
      last.current = next;
      setOffer(next);
      return next;
    } catch {
      return last.current;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!watching) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => clearInterval(id);
  }, [watching, refresh]);

  const value = useMemo(
    () => ({ offer, notice, dismissNotice: () => setNotice(null), refresh, setWatching }),
    [offer, notice, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOffer(): OfferCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOffer must be used inside <OfferProvider>");
  return ctx;
}

/** Start polling while `ref` is on screen; fires pricing_view once. */
export function useOfferWatch(ref: RefObject<HTMLElement | null>) {
  const { setWatching } = useOffer();
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setWatching(entry.isIntersecting);
        if (entry.isIntersecting) trackOnce("pricing_view");
      },
      { rootMargin: "100px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      setWatching(false);
    };
  }, [ref, setWatching]);
}

export const BUY_HREF = "/signup?next=/app/billing";

/** "Get lifetime access — $29" (label and price in one inline element), or just the label when the price is unavailable. */
export function CtaLabel({ label }: { label: string }) {
  const { offer } = useOffer();
  if (!offer) return <>{label}</>;
  if (!offer.open) return <>Lifetime deal closed</>;
  return <>{label} — {fmtPrice(offer.currentPriceUsd)}</>;
}

/** Inline live values for copy. Renders an em dash when the offer is unavailable (never a guess). */
export function OfferValue({ field }: { field: "price" | "next" | "left" | "step" | "seats" | "sold" }) {
  const { offer } = useOffer();
  if (!offer) return <>—</>;
  switch (field) {
    case "price": return <>{fmtPrice(offer.currentPriceUsd)}</>;
    case "next": return <>{fmtPrice(offer.nextPriceUsd)}</>;
    case "left": return <>{offer.seatsLeftAtCurrentPrice}</>;
    case "step": return <>{fmtPrice(offer.stepUsd)}</>;
    case "seats": return <>{offer.seatsPerStep}</>;
    case "sold": return <>{offer.paidTotal}</>;
  }
}
