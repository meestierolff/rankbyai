import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import type { SessionContext } from "@/lib/auth";
import { MobileNav, SidebarNav } from "./sidebar-nav";

/** The /app frame: the same sidebar the marketing mocks show, built from the same tokens. */
export function AppShell({ ctx, children, banner }: { ctx: SessionContext; children: ReactNode; banner?: ReactNode }) {
  const lifetime = ctx.workspace.plan === "lifetime";
  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-inset px-[10px] py-4 lg:flex">
        <Link href="/app" className="flex items-center gap-2 px-[10px] pt-[2px] pb-2 text-[15px] font-semibold no-underline" aria-label="RankbyAI dashboard">
          <Logo height={22} />
          <span>rankbyai<span className="text-dim">.live</span></span>
        </Link>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-[rgba(11,11,11,0.86)] px-[clamp(16px,3vw,32px)] py-[10px] backdrop-blur-[12px]">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNav />
            <span className="truncate text-[14px] text-muted-foreground">{ctx.workspace.name}</span>
            <span className={`rounded-full border px-[10px] py-[3px] font-mono text-[11px] font-medium tracking-[0.04em] uppercase ${lifetime ? "border-g2 text-g1" : "border-border-strong text-dim"}`}>
              {lifetime ? `Lifetime · seat #${ctx.workspace.lifetime_seat ?? "—"}` : "Not purchased"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {ctx.isAdmin ? <Link href="/admin" className="text-[14px] text-muted-foreground no-underline hover:text-fg">Admin</Link> : null}
            <span className="hidden max-w-[220px] truncate text-[13px] text-dim sm:inline">{ctx.user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="cursor-pointer rounded-[9px] border border-border-strong bg-transparent px-3 py-[7px] text-[14px] font-medium text-fg hover:bg-line">
                Sign out
              </button>
            </form>
          </div>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-[clamp(16px,3vw,32px)] py-[clamp(20px,3vw,36px)]">{children}</main>
      </div>
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh bg-bg" aria-busy="true" aria-label="Loading the app">
      <div className="hidden w-[232px] shrink-0 border-r border-line bg-inset lg:block" />
      <div className="flex-1 p-8">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-line" />
        <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface" />)}
        </div>
      </div>
    </div>
  );
}
