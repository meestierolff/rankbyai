import Link from "next/link";
import { LogoLockup } from "@/components/brand/logo";

/** Login and sign-up: the landing look. Black page, the dot mark, one framed panel, one cream button. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rb-app flex min-h-dvh flex-col bg-bg text-fg">
      <header className="border-b border-line">
        <div className="container-lp flex items-center justify-between gap-4 py-[13px]">
          <Link href="/" className="no-underline" aria-label="RankbyAI home"><LogoLockup /></Link>
          <Link href="/#pricing" className="px-2 py-2 text-[14.5px] text-muted-foreground no-underline transition-colors hover:text-fg">Pricing</Link>
        </div>
      </header>
      <main className="container-lp flex flex-1 items-center justify-center py-[clamp(40px,8vw,96px)]">
        {/* The bezel of the landing page's product frames, at form size. */}
        <div className="w-full max-w-[460px] rounded-[24px] border border-[#2a2a2a] bg-[linear-gradient(180deg,#1b1b1b,#0c0c0c)] p-[9px] shadow-lp-bezel">
          <div className="rounded-[16px] border border-border bg-inset p-[clamp(22px,5vw,36px)]">{children}</div>
        </div>
      </main>
    </div>
  );
}
