import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AI_DISCLAIMER_TEXT } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { LogoLockup } from "./logo";

/* Brand primitives shared by the marketing site, the app, share pages and legal pages.
   Every value comes from the design tokens (src/styles/tokens.css). */

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-eyebrow", className)}>{children}</span>;
}

/** Full-width alternating band with hairlines top and bottom. */
export function Band({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("border-y border-line bg-bg-alt", className)}>
      {children}
    </section>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-border bg-surface", className)} {...props} />;
}

export function Pill({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1 text-[13px] text-muted-foreground", className)}
      {...props}
    />
  );
}

export function MonoPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("rounded-full border border-border-strong px-3 py-[5px] font-mono text-[13px] font-medium text-muted-foreground", className)}>
      {children}
    </span>
  );
}

/** Red dot with halo: the live-seats indicator. */
export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full bg-danger shadow-[0_0_0_4px_var(--rb-danger-ring)]", className)} />;
}

const ctaSizes = {
  sm: "px-[14px] py-[9px] text-[14.5px] font-medium rounded-[9px] gap-2",
  md: "px-[18px] py-3 text-[16px] font-semibold rounded-[10px] gap-2",
  lg: "px-7 py-[17px] text-[18px] font-semibold rounded-xl gap-3",
  block: "p-[17px] text-[18px] font-semibold rounded-xl gap-3 w-full justify-center",
} as const;

/**
 * Primary button: the cream button of the landing page (same sizes as `creamClass` there).
 * One per screen. Works on links and real buttons.
 */
export const ctaClass = (size: keyof typeof ctaSizes = "lg", className?: string) =>
  cn(
    "lp-cream inline-flex items-center text-center no-underline transition-[filter] hover:brightness-[1.04] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100",
    ctaSizes[size],
    className,
  );

/** Primary call to action. The label and price stay in ONE inline element; the arrow is separate. */
export function CtaLink({
  href, children, size = "lg", className, arrow = true, ...rest
}: { href: string; children: ReactNode; size?: keyof typeof ctaSizes; className?: string; arrow?: boolean } & Omit<ComponentProps<typeof Link>, "href">) {
  return (
    <Link href={href} className={ctaClass(size, className)} {...rest}>
      <span>{children}</span>
      {arrow ? <span aria-hidden>→</span> : null}
    </Link>
  );
}

/** Secondary button: the outline button of the landing page. */
export const secondaryClass = (className?: string) =>
  cn(
    "inline-flex items-center gap-2 rounded-[9px] border border-border-heavy bg-[#0b0b0b] px-[14px] py-[9px] text-[14.5px] font-medium text-fg no-underline transition-colors hover:border-[#555555] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-heavy",
    className,
  );

/** ✓ row used in feature checklists. */
export function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-4 text-[17px] leading-normal text-muted-foreground">
      <span aria-hidden className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[#1f1f1f] text-[12px] text-fg">✓</span>
      <span>{children}</span>
    </li>
  );
}

/** Label every demo visual as sample data (brief: no invented numbers outside labelled demos). */
export function SampleTag({ className }: { className?: string }) {
  return (
    <span className={cn("rounded-[5px] border border-border-strong px-[6px] py-[2px] font-mono text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase", className)}>
      Sample data
    </span>
  );
}

export const AI_DISCLAIMER = AI_DISCLAIMER_TEXT;

/** Required wherever AI results are shown. */
export function AiDisclaimer({ className }: { className?: string }) {
  return <p className={cn("text-[12px] leading-normal text-dim", className)}>{AI_DISCLAIMER}</p>;
}

const priorityStyle = {
  P0: "bg-red text-white",
  P1: "bg-orange text-bg",
  P2: "bg-amber text-bg",
  P3: "bg-[#3a3a3a] text-fg",
} as const;
export type Priority = keyof typeof priorityStyle;

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span className={cn("rounded-[5px] px-[7px] py-1 font-mono text-[12px] leading-none font-semibold", priorityStyle[priority], className)}>
      {priority}
    </span>
  );
}

export const scoreColor = (score: number) => (score >= 70 ? "var(--rb-g1)" : score >= 50 ? "var(--rb-amber)" : "var(--rb-orange)");

/** Conic score ring. `size` is the outer diameter in px. */
export function ScoreRing({ score, size = 120, label = true }: { score: number; size?: number; label?: boolean }) {
  const inner = Math.round(size * 0.815);
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div
      role="img"
      aria-label={`Score ${score} out of 100`}
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(${scoreColor(score)} 0 ${pct}%, var(--rb-track) ${pct}% 100%)` }}
    >
      <div className="flex items-baseline justify-center rounded-full bg-surface" style={{ width: inner, height: inner, paddingTop: inner * 0.31 }}>
        <span className="font-mono leading-none font-semibold" style={{ fontSize: Math.round(size * 0.3) }}>{score}</span>
        {label && size >= 96 ? <span className="font-mono text-[13px] font-medium text-dim">/100</span> : null}
      </div>
    </div>
  );
}

/** macOS-style window chrome used for every product mock. */
export function WindowBar({ url, compact }: { url: string; compact?: boolean }) {
  const dot = compact ? "size-[10px]" : "size-[11px]";
  return (
    <div className={cn("flex items-center gap-[14px] border-b border-line", compact ? "px-4 py-[11px]" : "px-[18px] py-[13px]")}>
      <div className={cn("flex", compact ? "gap-[6px]" : "gap-[7px]")} aria-hidden>
        <span className={cn(dot, "rounded-full bg-[#ff5f57]")} />
        <span className={cn(dot, "rounded-full bg-[#febc2e]")} />
        <span className={cn(dot, "rounded-full bg-[#28c840]")} />
      </div>
      <span className={cn("min-w-0 truncate rounded-full bg-[#1a1a1a] text-muted-foreground", compact ? "px-[14px] py-[5px] text-[12px]" : "px-4 py-[6px] text-[13px]")}>
        {url}
      </span>
    </div>
  );
}

export const MOCK_NAV = ["Dashboard", "Businesses", "AI Visibility", "Maps Grid", "Local AI Audit", "Prospects"] as const;

/** The app sidebar as it appears inside marketing mocks (mirrors the real /app shell). */
export function MockSidebar({ active }: { active: (typeof MOCK_NAV)[number] }) {
  return (
    <div className="hidden w-[170px] shrink-0 flex-col gap-[2px] border-r border-line px-[10px] py-4 sm:flex" aria-hidden>
      <span className="px-[10px] pt-[2px] pb-3">
        <LogoLockup height={16} size="sm" />
      </span>
      {MOCK_NAV.map((l) => (
        <span key={l} className={cn("rounded-lg px-[10px] py-2 text-[14px]", l === active ? "bg-[#1c1c1c] text-fg" : "text-[#9a9a9a]")}>
          {l}
        </span>
      ))}
      <span className="px-[10px] pt-[14px] pb-1 text-[12px] text-dim">Developers</span>
      <span className="px-[10px] py-2 text-[14px] text-[#9a9a9a]">API &amp; MCP</span>
    </div>
  );
}

/** Big mono number + label + caption (cost band, dashboards). */
export function Stat({ value, label, caption, valueClassName }: { value: ReactNode; label: ReactNode; caption?: ReactNode; valueClassName?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={cn("text-stat", valueClassName)}>{value}</span>
      <span className="text-[18px] font-medium">{label}</span>
      {caption ? <span className="text-[15px] text-dim">{caption}</span> : null}
    </div>
  );
}

export function Chevron() {
  return <span aria-hidden className="rb-chevron text-dim transition-transform">⌄</span>;
}
