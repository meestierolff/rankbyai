import Link from "next/link";
import { LogoLockup } from "@/components/brand/logo";

/**
 * The frame around the OAuth consent screen: the sign-in look (black page, the logo, one bezel
 * panel), so connecting an app feels like the rest of RankbyAI. Used by app/oauth and its preview.
 */
export function OAuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rb-app flex min-h-dvh flex-col bg-bg text-fg">
      <header className="border-b border-line">
        <div className="container-lp flex items-center justify-between gap-4 py-[13px]">
          <Link href="/" className="no-underline" aria-label="RankbyAI home"><LogoLockup /></Link>
          <Link href="/support" className="px-2 py-2 text-[14.5px] text-muted-foreground no-underline transition-colors hover:text-fg">Help</Link>
        </div>
      </header>
      <main className="container-lp flex flex-1 items-center justify-center py-[clamp(32px,7vw,88px)]">
        <div className="w-full max-w-[540px] rounded-[24px] border border-[#2a2a2a] bg-[linear-gradient(180deg,#1b1b1b,#0c0c0c)] p-[9px] shadow-lp-bezel">
          <div className="rounded-[16px] border border-border bg-inset p-[clamp(22px,5vw,36px)]">{children}</div>
        </div>
      </main>
    </div>
  );
}
