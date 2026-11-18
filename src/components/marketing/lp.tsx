import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Landing-page primitives (design handoff "landing redesign", Nov 2026).
 * Colours come from the --lp-* tokens in src/styles/tokens.css. The app keeps its own primitives
 * in components/brand; nothing here is used inside /app.
 */

/** The 3×3 dot mark: eight off-white dots around an orange centre. */
export function DotMark({ size = 22, className }: { size?: number; className?: string }) {
  const at = [3, 11, 19];
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden className={cn("shrink-0", className)}>
      {at.flatMap((cy, r) =>
        at.map((cx, c) => {
          const centre = r === 1 && c === 1;
          return <circle key={`${r}${c}`} cx={cx} cy={cy} r={centre ? 3.1 : 2.3} fill={centre ? "var(--lp-accent)" : "var(--lp-fg)"} />;
        }),
      )}
    </svg>
  );
}

/** Wordmark in the display face. */
export function LpWordmark({ className }: { className?: string }) {
  return <span className={cn("font-display text-[19px] leading-none font-extrabold tracking-[-0.01em]", className)}>RankbyAI</span>;
}

/**
 * The bezel around every product visual: a gradient outer frame with padding, and a dark inner
 * panel. `warm` is the brown-tinted variant used around the dashboard demo. `large` uses the
 * bigger radius and shadow.
 */
export function Bezel({
  children, warm = false, large = false, className, innerClassName, ...rest
}: { children: ReactNode; warm?: boolean; large?: boolean; innerClassName?: string } & ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border p-[9px]",
        large ? "rounded-[26px] p-[10px] shadow-lp-bezel-lg" : "rounded-[24px] shadow-lp-bezel",
        warm ? "border-[#2b2826] bg-[linear-gradient(180deg,#1d1a17,#0c0c0c)]" : "border-[#2a2a2a] bg-[linear-gradient(180deg,#1b1b1b,#0c0c0c)]",
        className,
      )}
      {...rest}
    >
      <div className={cn("overflow-hidden border border-[var(--lp-frame-inner-border)] bg-lp-inner", large ? "rounded-[18px]" : "rounded-[16px]", innerClassName)}>{children}</div>
    </div>
  );
}

/** Header row of a framed visual: a title on the left, a status on the right. */
export function BezelHeader({ title, status, className }: { title: ReactNode; status?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-lp-line px-[18px] py-[15px] text-[15px]", className)}>
      <span className="min-w-0 font-medium text-lp-fg">{title}</span>
      {status ? <span className="shrink-0 font-mono text-[12px] text-lp-dim">{status}</span> : null}
    </div>
  );
}

const creamSizes = {
  sm: "gap-2 rounded-[9px] px-[14px] py-[9px] text-[14.5px] font-medium",
  md: "gap-2 rounded-[10px] px-[18px] py-3 text-[16px] font-semibold",
  lg: "gap-3 rounded-xl px-7 py-[17px] text-[18px] font-semibold",
  block: "w-full justify-center gap-3 rounded-xl p-[17px] text-[18px] font-semibold",
} as const;
export type CreamSize = keyof typeof creamSizes;

/** Class list of the cream primary button, for links and real buttons alike. */
export const creamClass = (size: CreamSize = "lg", className?: string) =>
  cn(
    "lp-cream inline-flex items-center no-underline transition-[filter] hover:brightness-[1.04] disabled:cursor-not-allowed disabled:opacity-60",
    creamSizes[size],
    className,
  );

/** Cream primary call to action. The label (and price) stays in one inline element; the arrow is separate. */
export function CreamLink({
  href, children, size = "lg", arrow = true, className, ...rest
}: { href: string; children: ReactNode; size?: CreamSize; arrow?: boolean; className?: string } & Omit<ComponentProps<typeof Link>, "href">) {
  return (
    <Link href={href} className={creamClass(size, className)} {...rest}>
      <span>{children}</span>
      {arrow ? <span aria-hidden>→</span> : null}
    </Link>
  );
}

/** Outline secondary button on black. */
export const outlineClass = (className?: string) =>
  cn(
    "inline-flex items-center gap-2 rounded-[9px] border border-lp-border-3 bg-[#0b0b0b] px-[14px] py-[9px] text-[14.5px] font-medium text-lp-fg no-underline transition-colors hover:border-[#555555]",
    className,
  );

/** Mono, orange, uppercase label above a section heading. */
export function LpEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("lp-eyebrow", className)}>{children}</span>;
}

/** Underlined text link used under feature copy. */
export function LpTextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("border-b border-[#4d4d4d] pb-[3px] text-[16px] text-[#ece9e4] no-underline transition-colors hover:border-lp-accent hover:text-lp-fg", className)}>
      {children}
    </Link>
  );
}

/** "Sample data" label for every demo visual (no invented numbers outside labelled demos). */
export function LpSampleTag({ className }: { className?: string }) {
  return (
    <span className={cn("rounded-[5px] border border-lp-border-2 px-[6px] py-[2px] font-mono text-[10.5px] tracking-[0.06em] text-lp-dim uppercase", className)}>
      Sample data
    </span>
  );
}
