import Link from "next/link";
import type { ReactNode } from "react";
import { Logo, LogoLockup } from "@/components/brand/logo";
import { secondaryClass } from "@/components/brand/primitives";
import type { SessionContext } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { planLabel } from "./first-run";
import { MobileNav, SidebarNav } from "./sidebar-nav";

/**
 * The /app frame, in the landing look: black page, a #0a0a0a sidebar with hairlines, the dot
 * mark, and a translucent top bar like the landing header.
 */
export function AppShell({ ctx, children, banner }: { ctx: SessionContext; children: ReactNode; banner?: ReactNode }) {
  const lifetime = ctx.workspace.plan === "lifetime";
  const seat = lifetime ? ctx.workspace.lifetime_seat : null;
  return (
    <div className="rb-app flex min-h-dvh bg-bg text-fg">
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-inset px-[10px] py-4 lg:flex">
        <Link href="/app" className="flex items-center px-[10px] pt-[4px] pb-[10px] no-underline" aria-label="RankbyAI dashboard">
          <LogoLockup height={18} size="sm" />
        </Link>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-[rgba(0,0,0,0.72)] px-[clamp(16px,3vw,32px)] py-[10px] backdrop-blur-[14px]">
          <div className="flex min-w-0 items-center gap-3">
            {/* Below the sidebar breakpoint the mark lives here, so the brand is on every screen. */}
            <Link href="/app" className="shrink-0 lg:hidden" aria-label="RankbyAI dashboard"><Logo height={18} /></Link>
            <MobileNav />
            <span className="min-w-0 truncate text-[14px] text-muted-foreground">{ctx.workspace.name}</span>
            <span
              title={planLabel(ctx.workspace.plan, seat)}
              className={cn("shrink-0 rounded-full border px-[10px] py-[3px] font-mono text-[11px] font-medium tracking-[0.04em] whitespace-nowrap uppercase", lifetime ? "border-g2 text-g1" : "border-border-strong text-dim")}
            >
              {lifetime ? <>Lifetime{seat != null ? <span className="hidden sm:inline"> · seat #{seat}</span> : null}</> : "Not purchased"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {ctx.isAdmin ? <Link href="/admin" className="text-[14px] text-muted-foreground no-underline transition-colors hover:text-fg">Admin</Link> : null}
            <span className="hidden max-w-[220px] truncate text-[13px] text-dim md:inline">{ctx.user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className={secondaryClass("cursor-pointer px-3 py-[7px] text-[14px] whitespace-nowrap")}>
                Sign out
              </button>
            </form>
          </div>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-[1200px] min-w-0 flex-1 px-[clamp(16px,3vw,32px)] py-[clamp(20px,3vw,36px)]">{children}</main>
      </div>
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="rb-app flex min-h-dvh bg-bg" aria-busy="true" aria-label="Loading the app">
      <div className="hidden w-[232px] shrink-0 border-r border-line bg-inset lg:block" />
      <div className="min-w-0 flex-1">
        <div className="h-[53px] border-b border-line" />
        <div className="p-[clamp(16px,3vw,32px)]">
          <div className="h-8 w-56 max-w-full animate-pulse rounded-lg bg-surface-2" />
          <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-[14px] border border-border bg-surface" />)}
          </div>
        </div>
      </div>
    </div>
  );
}
