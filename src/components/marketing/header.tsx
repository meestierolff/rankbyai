import Link from "next/link";
import { HeaderCta } from "./header-cta";
import { DotMark, LpWordmark, outlineClass } from "./lp";

/** Sticky marketing header. `withOffer` is false on pages rendered outside an OfferProvider. */
export function Header({ withOffer = true }: { withOffer?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-lp-line bg-[rgba(0,0,0,0.72)] text-lp-fg backdrop-blur-[14px]">
      <div className="container-lp flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-[13px]">
        <Link href="/" className="flex items-center gap-[10px] text-lp-fg no-underline">
          <DotMark />
          <LpWordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-[10px]">
          <HeaderCta withOffer={withOffer} />
          <Link href="/#tour" className={outlineClass("hidden py-2 sm:inline-flex")}>See it work</Link>
          <Link href="/login" className="px-2 py-2 text-[14.5px] text-lp-muted no-underline transition-colors hover:text-lp-fg">Log in</Link>
        </nav>
      </div>
    </header>
  );
}
