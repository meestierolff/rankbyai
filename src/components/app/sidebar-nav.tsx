"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_BOTTOM, NAV_GROUPS, type NavGroup } from "./nav";

function Group({ group, pathname, onNavigate }: { group: NavGroup; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="px-[10px] pt-[14px] pb-1 text-[11.5px] text-dim">{group.label}</span>
      {group.items.map((it) => {
        const active = it.prefix ? pathname === it.href || pathname.startsWith(it.href + "/") : pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-[8px] px-[10px] py-2 text-[14px] no-underline transition-colors duration-200",
              active ? "bg-[#1c1c1c] text-fg" : "text-[#9a9a9a] hover:bg-[#121212] hover:text-fg",
            )}
          >
            {/* The one place the brand orange marks state in the app: where you are. */}
            {active ? <span aria-hidden className="absolute top-1/2 left-0 h-[14px] w-[2px] -translate-y-1/2 rounded-full bg-accent-brand" /> : null}
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="App" className="flex flex-1 flex-col justify-between gap-4 overflow-y-auto">
      <div className="flex flex-col">
        {NAV_GROUPS.map((g) => <Group key={g.label} group={g} pathname={pathname} onNavigate={onNavigate} />)}
      </div>
      <Group group={NAV_BOTTOM} pathname={pathname} onNavigate={onNavigate} />
    </nav>
  );
}

/** Mobile navigation: a native disclosure, closed after every navigation. */
export function MobileNav() {
  return (
    <details className="group lg:hidden">
      <summary className="rounded-[9px] border border-border-heavy bg-[#0b0b0b] px-3 py-[7px] text-[14px] font-medium whitespace-nowrap">Menu</summary>
      <div className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-60px)] overflow-y-auto border-b border-line bg-inset px-3 pb-4 shadow-popover">
        <SidebarNav onNavigate={() => document.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"))} />
      </div>
    </details>
  );
}
