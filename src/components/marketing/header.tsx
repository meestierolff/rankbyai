import Link from "next/link";
import { LogoLockup } from "@/components/brand/logo";
import { HeaderCta } from "./header-cta";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

/** Sticky marketing header. `cta` is omitted on pages rendered outside an OfferProvider. */
export function Header({ withOffer = true }: { withOffer?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[rgba(11,11,11,0.82)] backdrop-blur-[12px]">
      <div className="container-page flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-[14px]">
        <Link href="/" className="no-underline" aria-label="RankbyAI home">
          <LogoLockup priority />
        </Link>
        <nav aria-label="Main" className="order-3 flex w-full justify-between gap-[clamp(16px,3vw,36px)] text-[15px] md:order-none md:w-auto md:justify-start">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-muted-foreground no-underline transition-colors hover:text-fg">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-[22px]">
          <Link href="/login" className="text-[15px] font-medium text-fg no-underline hover:text-white">Log in</Link>
          <HeaderCta withOffer={withOffer} />
        </div>
      </div>
    </header>
  );
}
