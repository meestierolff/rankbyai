import type { Metadata } from "next";
import Link from "next/link";
import { LogoLockup } from "@/components/brand/logo";

// Request-time only (session and query); a blocking render lets the page answer with real redirects.
export const instant = false;

export const metadata: Metadata = { title: "Connect an app", robots: { index: false, follow: false } };

/** The OAuth consent screen: the sign-in look, one framed panel. Framing is refused in next.config. */
export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rb-app flex min-h-dvh flex-col bg-bg text-fg">
      <header className="border-b border-line">
        <div className="container-lp flex items-center justify-between gap-4 py-[13px]">
          <Link href="/" className="no-underline" aria-label="RankbyAI home"><LogoLockup /></Link>
        </div>
      </header>
      <main className="container-lp flex flex-1 items-center justify-center py-[clamp(40px,8vw,96px)]">
        <div className="w-full max-w-[520px] rounded-[24px] border border-[#2a2a2a] bg-[linear-gradient(180deg,#1b1b1b,#0c0c0c)] p-[9px] shadow-lp-bezel">
          <div className="rounded-[16px] border border-border bg-inset p-[clamp(22px,5vw,36px)]">{children}</div>
        </div>
      </main>
    </div>
  );
}
