"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Small presentational parts shared by the four panels of the landing "four tools" preview
 * (design handoff, section 6). Values are the handoff's; colours come from the --lp-* tokens.
 */

/** A flag that turns itself off after `ms` (Copied ✓, Sample only, Running audit…). The timer is cleared on unmount. */
export function useFlash(ms: number): { on: boolean; fire: () => void; reset: () => void } {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => clear, [clear]);
  const fire = useCallback(() => {
    clear();
    setOn(true);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [clear, ms]);
  const reset = useCallback(() => {
    clear();
    setOn(false);
  }, [clear]);
  return { on, fire, reset };
}

/** Business name, a one-line description of the scan, and a control on the right. */
export function PreviewHead({ title, sub, children }: { title: ReactNode; sub: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[24px] leading-[1.2] font-semibold tracking-[-0.025em]">{title}</div>
        <div className="mt-[6px] text-[14px] text-[#8a8a8a]">{sub}</div>
      </div>
      {children}
    </div>
  );
}

/** Segmented control on a dark well; the active segment is #242424. */
export function PreviewSeg<T extends string>({
  label, options, value, onChange,
}: { label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-[11px] border border-[#1f1f1f] bg-lp-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer rounded-lg border-0 px-[13px] py-2 text-[13.5px] transition-colors",
            o.value === value ? "bg-[#242424] text-lp-fg" : "bg-transparent text-[#8a8a8a] hover:text-lp-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The row of stat cards. Each value is computed from the grid shown in the same panel. */
export function PreviewStats({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[10px]">
      {items.map((s) => (
        <div key={s.label} className="rounded-xl border border-lp-line-2 px-4 py-[14px]">
          <dt className="text-[12.5px] text-lp-dim">{s.label}</dt>
          <dd className="m-0 mt-1 text-[24px] font-semibold tracking-[-0.02em]">
            {s.value}
            {s.hint ? <span className="ml-2 text-[13px] font-normal tracking-normal text-lp-dim">{s.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The card next to a grid: what was found at the selected point. */
export function PreviewCard({ children, className, ...rest }: { children: ReactNode; className?: string; "aria-live"?: "polite" }) {
  return (
    <div className={cn("rounded-[14px] border border-[var(--lp-frame-inner-border)] bg-lp-surface p-[18px]", className)} {...rest}>
      {children}
    </div>
  );
}

/** Mono, uppercase caption above a list inside a card. */
export function PreviewLabel({ children }: { children: ReactNode }) {
  return <div className="mt-4 mb-2 font-mono text-[11px] tracking-[0.1em] text-lp-faint uppercase">{children}</div>;
}

/** One row of an ordered result list. The highlighted row is the business the grid is coloured by. */
export function RankRow({ rank, name, highlight, wide }: { rank: string; name: string; highlight: boolean; wide?: boolean }) {
  return (
    <li className={cn("flex items-center gap-[10px] rounded-lg px-[10px] py-[7px] text-[14px]", highlight ? "bg-[rgba(255,122,26,0.12)] text-[#ffd2b0]" : "text-lp-fg-2")}>
      <span className={cn("shrink-0 font-mono text-[12px]", wide ? "min-w-[26px]" : "w-[14px]", highlight ? "text-lp-accent-text" : "text-lp-faint")}>{rank}</span>
      <span className="min-w-0">{name}</span>
    </li>
  );
}

/** Colour key under a grid. A key may have several swatches (the three green shades of "named 1–3"). */
export function PreviewLegend({ items, note }: { items: { colors: string[]; label: string }[]; note?: string }) {
  return (
    <div className="mt-[14px] flex flex-wrap gap-x-[14px] gap-y-2 text-[12px] text-lp-dim">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-[6px]">
          <span className="flex gap-[2px]" aria-hidden>
            {it.colors.map((c) => <span key={c} className="size-[10px] rounded-[3px]" style={{ background: c }} />)}
          </span>
          {it.label}
        </span>
      ))}
      {note ? <span className="ml-auto">{note}</span> : null}
    </div>
  );
}
