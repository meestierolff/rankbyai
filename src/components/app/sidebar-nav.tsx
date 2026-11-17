"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_BOTTOM, NAV_GROUPS, type NavGroup } from "./nav";

function Group({ group, pathname, onNavigate }: { group: NavGroup; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="px-[10px] pt-[14px] pb-1 text-[12px] text-faint">{group.label}</span>
      {group.items.map((it) => {
        const active = it.prefix ? pathname === it.href || pathname.startsWith(it.href + "/") : pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-[10px] py-2 text-[14px] no-underline transition-colors",
              active ? "bg-line text-fg" : "text-[#9a9a9a] hover:bg-[#151515] hover:text-fg",
            )}
          >
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
    <nav aria-label="App" className="flex flex-1 flex-col justify-between gap-4">
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
      <summary className="rounded-[9px] border border-border-strong px-3 py-[7px] text-[14px] font-medium">Menu</summary>
      <div className="absolute inset-x-0 top-full z-40 border-b border-line bg-inset px-3 pb-4 shadow-popover">
        <SidebarNav onNavigate={() => document.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"))} />
      </div>
    </details>
  );
}
