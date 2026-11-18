import { cn } from "@/lib/utils";

export interface GridCell {
  key: string;
  bg: string;
  fg: string;
  label: string;
  title: string;
  /** Not checked: an outlined, empty dot. */
  dashed: boolean;
  selected?: boolean;
}

/** Spacing and label rules per grid size, so a 15×15 grid stays legible at 375px. */
function sizing(n: number) {
  if (n <= 3) return { gap: 12, pad: 16, labels: "inline" };
  if (n <= 5) return { gap: 9, pad: 14, labels: "inline" };
  if (n <= 7) return { gap: 6, pad: 12, labels: "inline" };
  if (n <= 11) return { gap: 4, pad: 10, labels: "hidden sm:inline" };
  return { gap: 3, pad: 8, labels: "hidden md:inline" };
}

/**
 * The report's dot grid: the map's text equivalent, its no-WebGL fallback and its print version.
 * Every cell carries its full description (screen readers read the list; sighted users get a
 * tooltip). Labels shrink with the grid and hide on narrow screens for the largest grids, where the
 * colour and the legend carry the meaning.
 */
export function PointGrid({
  n, cells, onSelect, label, className, compact = false,
}: {
  n: number;
  cells: GridCell[];
  onSelect?: (key: string) => void;
  /** Accessible name of the whole grid. */
  label: string;
  className?: string;
  /** Print / PDF-like rendering: no interaction, smaller padding. */
  compact?: boolean;
}) {
  const s = sizing(n);
  return (
    <div className={cn("grid-well w-full rounded-xl", className)} style={{ padding: compact ? Math.min(8, s.pad) : s.pad, containerType: "inline-size" }}>
      <ol
        aria-label={label}
        className="m-0 grid list-none p-0"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: s.gap }}
      >
        {cells.map((c) => {
          const dot = (
            <>
              <span aria-hidden className={cn("leading-none", s.labels)}>{c.label}</span>
              <span className="sr-only">{c.title}</span>
            </>
          );
          const style = {
            background: c.bg,
            color: c.fg,
            // Font follows the cell size: about a third of a cell, between 8 and 14px.
            fontSize: `clamp(8px, calc(100cqi / ${n} * 0.3), 14px)`,
            border: c.dashed ? "1.5px dashed var(--rb-faint)" : undefined,
            boxShadow: c.selected ? "0 0 0 2px var(--rb-inset), 0 0 0 4px var(--rb-fg)" : undefined,
          } as const;
          const cls = "rb-data grid aspect-square w-full place-items-center rounded-full p-0 font-mono font-semibold tabular-nums";
          return (
            <li key={c.key} className="flex">
              {onSelect ? (
                <button type="button" title={c.title} aria-pressed={!!c.selected} onClick={() => onSelect(c.key)} className={cn(cls, "cursor-pointer border-0")} style={style}>
                  {dot}
                </button>
              ) : (
                <span title={c.title} className={cls} style={style}>{dot}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Legend swatch. */
export function Swatch({ bg, dashed = false, label }: { bg: string; dashed?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-[7px]">
      <span aria-hidden className="rb-data size-[10px] shrink-0 rounded-full" style={{ background: bg, border: dashed ? "1.5px dashed var(--rb-faint)" : undefined }} />
      {label}
    </span>
  );
}
