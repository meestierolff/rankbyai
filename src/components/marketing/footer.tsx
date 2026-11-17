import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { NOT_AFFILIATED } from "@/lib/copy";
import { legalEnv } from "@/lib/env";

const LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/removal", label: "Removal request" },
  { href: "/docs/api", label: "API docs" },
  { href: "/ai", label: "AI visibility by city" },
  { href: "/llms.txt", label: "llms.txt" },
];

/** 9.16 Footer. The operator line comes from LEGAL_* env; nothing is invented when they are unset. */
export function Footer({ padForStickyBar = false }: { padForStickyBar?: boolean }) {
  const entity = legalEnv.entityName();
  const address = legalEnv.address();
  const email = legalEnv.email();
  return (
    <footer className="border-t border-line">
      <div className={`container-page flex flex-wrap items-end justify-between gap-6 pt-10 ${padForStickyBar ? "pb-[120px]" : "pb-12"}`}>
        <div className="flex max-w-[520px] flex-col gap-[10px]">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <Logo height={30} />
            <span className="text-[17px] font-semibold">rankbyai<span className="text-dim">.live</span></span>
          </Link>
          <span className="text-[14px] leading-normal text-dim">
            {entity ? `RankbyAI is operated by ${entity}${address ? `, ${address}` : ""}. ` : ""}
            {NOT_AFFILIATED}
          </span>
        </div>
        <nav aria-label="Footer" className="flex max-w-[560px] flex-wrap gap-x-7 gap-y-3 text-[15px]">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-muted-foreground no-underline transition-colors hover:text-fg">{l.label}</Link>
          ))}
          {email ? <a href={`mailto:${email}`} className="text-muted-foreground no-underline transition-colors hover:text-fg">Contact</a> : null}
        </nav>
      </div>
    </footer>
  );
}
