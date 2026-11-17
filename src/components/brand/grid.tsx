import { cn } from "@/lib/utils";

/* Grid cell language from the handoff. The same cells are used in marketing mocks,
   on the app's MapLibre maps (as markers), in share pages and (as SVG) in PDFs. */

/** AI mention position → colours. 1–3 green shades, 4–5 amber, null = not mentioned. */
export function aiCellColors(position: number | null | undefined): { bg: string; fg: string; label: string } {
  if (!position) return { bg: "var(--rb-none)", fg: "var(--rb-faint)", label: "–" };
  if (position === 1) return { bg: "var(--rb-g1)", fg: "var(--rb-bg)", label: "1" };
  if (position === 2) return { bg: "var(--rb-g2)", fg: "var(--rb-fg)", label: "2" };
  if (position === 3) return { bg: "var(--rb-g3)", fg: "var(--rb-fg)", label: "3" };
  return { bg: "var(--rb-amber)", fg: "var(--rb-bg)", label: String(position) };
}

/** Google Maps rank → colours. 1–3 green, 4–10 amber, 11–20 orange, 20+ / absent red. */
export function mapsCellColors(rank: number | null | undefined): { bg: string; fg: string; label: string } {
  if (rank == null || rank > 20) return { bg: "var(--rb-red)", fg: "#ffffff", label: "20+" };
  if (rank <= 3) return { bg: "var(--rb-g1)", fg: "var(--rb-bg)", label: String(rank) };
  if (rank <= 10) return { bg: "var(--rb-amber)", fg: "var(--rb-bg)", label: String(rank) };
  return { bg: "var(--rb-orange)", fg: "var(--rb-bg)", label: String(rank) };
}

/** Hex fallbacks for surfaces that cannot use CSS variables (PDF, OG images, map canvas). */
export const DATA_HEX = { g1: "#3fbf6a", g2: "#2e8a4e", g3: "#2a5a38", none: "#232323", amber: "#e6b23a", orange: "#e57f35", red: "#d9473c" } as const;

export const pointName = (row: number, col: number) => `${String.fromCharCode(65 + row)}${col + 1}`;

export interface CellView {
  key: string;
  bg: string;
  fg: string;
  label: string;
  title: string;
  selected?: boolean;
  delayMs?: number;
}

/** A square dot-grid on the gridded well. Cells are real buttons (keyboard + screen-reader friendly). */
export function DotGrid({
  n, cells, onSelect, revealKey, className, fontPx = 11, gapPx = 5, padPx = 12,
}: {
  n: number;
  cells: CellView[];
  onSelect?: (index: number) => void;
  /** Change this value to replay the diagonal reveal animation. */
  revealKey?: string | number;
  className?: string;
  fontPx?: number;
  gapPx?: number;
  padPx?: number;
}) {
  return (
    <div
      key={revealKey}
      className={cn("grid-well grid rounded-xl", className)}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: gapPx, padding: padPx }}
    >
      {cells.map((c, i) => (
        <button
          key={c.key}
          type="button"
          aria-label={c.title}
          aria-pressed={onSelect ? !!c.selected : undefined}
          title={c.title}
          onClick={onSelect ? () => onSelect(i) : undefined}
          tabIndex={onSelect ? 0 : -1}
          className={cn(
            "grid aspect-square place-items-center rounded-full border-0 p-0 font-mono font-semibold",
            onSelect ? "cursor-pointer" : "cursor-default",
            revealKey !== undefined && "animate-rb-pop",
          )}
          style={{
            background: c.bg,
            color: c.fg,
            fontSize: fontPx,
            boxShadow: c.selected ? "0 0 0 2px var(--rb-inset), 0 0 0 4px var(--rb-fg)" : "none",
            animationDelay: c.delayMs ? `${c.delayMs}ms` : undefined,
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** Stacked 3-dot marker: one dot per engine (green top-3, amber 4–5, grey none, outline = unavailable). */
export function EngineDots({ positions, size = 8 }: { positions: (number | null | "unavailable")[]; size?: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden>
      {positions.map((p, i) => (
        <span
          key={i}
          className="rounded-full"
          style={{
            width: size,
            height: size,
            background: p === "unavailable" ? "transparent" : p == null ? "var(--rb-none)" : p <= 3 ? "var(--rb-g1)" : "var(--rb-amber)",
            border: p === "unavailable" ? "1px solid var(--rb-faint)" : p == null ? "1px solid #333" : "none",
          }}
        />
      ))}
    </span>
  );
}
