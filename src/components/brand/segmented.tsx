"use client";

import { cn } from "@/lib/utils";

export interface SegOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

/**
 * Segmented control, as on the landing page: a #121212 well, the active segment off-white.
 * Single- or multi-select. Labels wrap inside their segment and are never cut off; `columns`
 * (or the option count) sets the columns from 480px up, below that long controls stack in two.
 */
export function Segmented<T extends string | number>({
  options, value, onChange, label, size = "md", className, columns,
}: {
  options: SegOption<T>[];
  value: T | T[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
  columns?: number;
}) {
  const multi = Array.isArray(value);
  const isOn = (v: T) => (multi ? (value as T[]).includes(v) : value === v);
  const cols = columns ?? options.length;
  // Short labels (grid sizes, radii) fit side by side on any phone; only wordy ones need the two-column stack.
  const compact = size === "sm" || options.every((o) => (typeof o.label === "string" || typeof o.label === "number") && String(o.label).length <= 6);
  return (
    <div
      role={multi ? "group" : "radiogroup"}
      aria-label={label}
      className={cn(
        "grid gap-1 border border-[#1f1f1f] bg-well",
        // Phones: at most two columns, so three or four labelled options never squeeze into slivers.
        "grid-cols-[repeat(var(--seg-cols-sm),minmax(0,1fr))] min-[480px]:grid-cols-[repeat(var(--seg-cols),minmax(0,1fr))]",
        size === "md" ? "rounded-[11px] p-1" : "rounded-[9px] p-[3px]",
        className,
      )}
      style={{ "--seg-cols": cols, "--seg-cols-sm": compact ? cols : Math.min(cols, 2) } as React.CSSProperties}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role={multi ? "checkbox" : "radio"}
          aria-checked={isOn(o.value)}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-w-0 cursor-pointer border-0 leading-[1.25] font-medium text-balance break-words whitespace-normal transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            size === "md" ? "rounded-[8px] px-2 py-[10px] text-[14.5px]" : "rounded-[6px] px-[9px] py-[5px] text-[12px]",
            isOn(o.value) ? "bg-fg text-[#0b0b0b]" : "bg-transparent text-muted-foreground hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
