"use client";

import { CreamLink } from "./lp";
import { BUY_HREF, CtaLabel } from "./offer-context";

export function HeaderCta({ withOffer }: { withOffer: boolean }) {
  return (
    <CreamLink href={BUY_HREF} size="sm" arrow={false}>
      {withOffer ? <CtaLabel label="Get access" /> : "Get access"}
    </CreamLink>
  );
}
