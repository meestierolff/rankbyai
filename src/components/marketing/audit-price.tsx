"use client";

import { useRef } from "react";
import { fmtPrice } from "@/lib/ladder";
import { useOffer, useOfferWatch } from "./offer-context";

/** Server-seeded from the offer service; refreshed via /api/offer, including at zero sales. */
export function AuditPrice() {
  const { offer } = useOffer();
  const ref = useRef<HTMLParagraphElement>(null);
  useOfferWatch(ref);
  return <p ref={ref} className="m-0 text-[18px] font-medium text-fg">
    {!offer ? "The live price is temporarily unavailable." : !offer.open ? "The lifetime deal has closed." : `${fmtPrice(offer.currentPriceUsd)} once for lifetime access · next ${fmtPrice(offer.nextPriceUsd)}.`}
  </p>;
}
