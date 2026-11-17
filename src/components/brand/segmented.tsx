"use client";

import { cn } from "@/lib/utils";

export interface SegOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

/** Segmented control from the handoff: inset well, active segment is light. Single- or multi-select. */
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
  return (
    <div
      role={multi ? "group" : "radiogroup"}
      aria-label={label}
      className={cn("grid gap-1 border border-border bg-inset", size === "md" ? "rounded-xl p-[5px]" : "rounded-[9px] p-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
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
            "cursor-pointer border-0 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            size === "md" ? "rounded-lg px-[6px] py-[11px] text-[15px]" : "rounded-[6px] px-[9px] py-[5px] text-[12px]",
            isOn(o.value) ? "bg-fg text-bg" : "bg-transparent text-muted-foreground hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
