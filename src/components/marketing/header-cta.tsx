"use client";

import { CtaLink } from "@/components/brand/primitives";
import { BUY_HREF, CtaLabel } from "./offer-context";

export function HeaderCta({ withOffer }: { withOffer: boolean }) {
  return (
    <CtaLink href={BUY_HREF} size="sm">
      {withOffer ? (
        <>
          <span className="hidden sm:inline"><CtaLabel label="Get lifetime access" /></span>
          <span className="sm:hidden"><CtaLabel label="Get access" /></span>
        </>
      ) : (
        "Get lifetime access"
      )}
    </CtaLink>
  );
}
