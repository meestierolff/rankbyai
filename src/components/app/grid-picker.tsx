"use client";

import dynamic from "next/dynamic";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { pointName } from "@/components/brand/grid";
import { Segmented } from "@/components/brand/segmented";
import { buildGrid } from "@/lib/scans/grid";
import { centreIdx, skippedLine } from "@/lib/scans/skip";
import { cn } from "@/lib/utils";
import type { MapPoint } from "./grid-map";

const GridMap = dynamic(() => import("./grid-map").then((m) => m.GridMap), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-xl bg-surface" aria-label="Loading map" />,
});

/** Cell size per grid: at least 24 px (a comfortable touch target); a 15×15 grid scrolls sideways on a narrow phone. */
const cellPx = (n: number) => (n <= 5 ? 36 : n <= 9 ? 28 : 24);
/** Marker size on the picker map: the grid covers most of the map, so dense grids get small markers (zoom in to pick precisely). */
const pickerMarkerPx = (n: number) => (n >= 15 ? 14 : n >= 13 ? 16 : n >= 11 ? 18 : 22);

/** "Point H8 (business), checked"; "(grid centre)" when the grid was moved off the business. */
export function pickerLabel(n: number, idx: number, skipped: boolean, centredOnBusiness = true): string {
  const row = Math.floor(idx / n);
  const col = idx % n;
  return `Point ${pointName(row, col)}${idx === centreIdx(n) ? (centredOnBusiness ? " (business)" : " (grid centre)") : ""}, ${skipped ? "skipped" : "checked"}`;
}

/**
 * Pick the points of an n×n grid to leave out of a scan (water, a park, outside the service area).
 * Every point is a toggle button: aria-pressed means skipped. The grid is one tab stop; the arrow
 * keys move between points, Home and End go to the ends of a row, and Space or Enter toggles.
 * With the business location the same toggles can be shown on the real map.
 * Points are numbered as the server builds the grid (lib/scans/grid): idx = row × n + col, row 0 north.
 */
export function GridPicker({ n, skip, onChange, center, radiusMiles, centredOnBusiness = true }: {
  n: number;
  skip: readonly number[];
  onChange: (skip: number[]) => void;
  /** The business location. Without it only the grid view is offered. */
  center?: { lat: number; lng: number } | null;
  radiusMiles: number;
  /** False when the grid centre was moved off the business: the middle point is then just the centre. */
  centredOnBusiness?: boolean;
}) {
  const total = n * n;
  const skipped = new Set(skip);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [view, setView] = useState<"grid" | "map">("grid");
  const [notice, setNotice] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const hintId = useId();
  const tabStop = focusIdx != null && focusIdx < total ? focusIdx : centreIdx(n);

  const toggle = (idx: number) => {
    if (skipped.has(idx)) {
      setNotice(null);
      onChange(skip.filter((x) => x !== idx));
      return;
    }
    if (total - skipped.size <= 1) {
      setNotice("At least one point must stay checked.");
      return;
    }
    setNotice(null);
    onChange([...skip, idx].sort((a, b) => a - b));
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const row = Math.floor(idx / n);
    const col = idx % n;
    const to: Record<string, number> = {
      ArrowRight: col < n - 1 ? idx + 1 : idx,
      ArrowLeft: col > 0 ? idx - 1 : idx,
      ArrowDown: row < n - 1 ? idx + n : idx,
      ArrowUp: row > 0 ? idx - n : idx,
      Home: row * n,
      End: row * n + n - 1,
    };
    if (!(e.key in to)) return;
    e.preventDefault();
    setFocusIdx(to[e.key]);
    refs.current[to[e.key]]?.focus();
  };

  const size = cellPx(n);
  const gap = n >= 11 ? 2 : 4;
  const mapPoints: MapPoint[] = view === "map" && center
    ? buildGrid(center, n, radiusMiles).map((p) => {
        const off = skipped.has(p.idx);
        const isCentre = p.idx === centreIdx(n);
        return {
          key: `${n}:${p.idx}`, lat: p.lat, lng: p.lng, label: "", title: pickerLabel(n, p.idx, off, centredOnBusiness), pressed: off, skipped: off,
          bg: isCentre ? "var(--rb-fg)" : "var(--rb-fg-2)", fg: "var(--rb-bg)", size: pickerMarkerPx(n),
        };
      })
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground" aria-live="polite">{skippedLine(n, skipped.size)}</span>
        <span className="flex items-center gap-2">
          {center ? (
            <Segmented label="Show points on" size="sm" value={view} onChange={setView} className="w-[130px]" options={[{ value: "grid" as const, label: "Grid" }, { value: "map" as const, label: "Map" }]} />
          ) : null}
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              onChange([]);
            }}
            disabled={skipped.size === 0}
            className="cursor-pointer rounded-[9px] border border-border-strong bg-transparent px-3 py-[5px] text-[13px] font-medium text-fg hover:bg-line disabled:cursor-not-allowed disabled:opacity-40"
          >
            Skip none
          </button>
        </span>
      </div>
      <p id={hintId} className="m-0 text-[13px] text-dim">
        Switch off points you do not want tracked, such as water, a park or places outside the service area. Skipped points are not looked up and cost nothing.
        {view === "grid" ? " Arrow keys move between points." : " Zoom the map in to pick points precisely."}
      </p>

      {view === "map" && center ? (
        <GridMap key={`${center.lat},${center.lng},${radiusMiles}`} center={center} radiusMiles={radiusMiles} points={mapPoints} onSelect={(k) => toggle(Number(k.split(":")[1]))} className="h-[420px]" />
      ) : (
        <div className="overflow-x-auto pb-1">
          <div
            role="group"
            aria-label={`Points of the ${n}×${n} grid, north at the top`}
            aria-describedby={hintId}
            className="grid-well grid w-max rounded-xl"
            style={{ gridTemplateColumns: `repeat(${n}, ${size}px)`, gap, padding: 8 }}
          >
            {Array.from({ length: total }, (_, idx) => {
              const off = skipped.has(idx);
              const isCentre = idx === centreIdx(n);
              return (
                <button
                  key={`${n}:${idx}`}
                  ref={(el) => {
                    refs.current[idx] = el;
                  }}
                  type="button"
                  aria-pressed={off}
                  aria-label={pickerLabel(n, idx, off, centredOnBusiness)}
                  title={pickerLabel(n, idx, off, centredOnBusiness)}
                  tabIndex={idx === tabStop ? 0 : -1}
                  onClick={() => {
                    setFocusIdx(idx);
                    toggle(idx);
                  }}
                  onKeyDown={(e) => onKey(e, idx)}
                  className={cn(
                    "grid cursor-pointer place-items-center rounded-full p-0 transition-colors",
                    off ? "border-[1.5px] border-dashed border-faint bg-transparent hover:border-fg-2" : "border-0 bg-fg-2 hover:bg-fg",
                  )}
                  style={{ width: size, height: size }}
                >
                  {isCentre ? <span aria-hidden className={cn("block rounded-full", off ? "bg-faint" : "bg-bg")} style={{ width: Math.round(size / 3), height: Math.round(size / 3) }} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-dim">
        <span className="flex items-center gap-[6px]"><span aria-hidden className="size-[10px] rounded-full bg-fg-2" />Checked</span>
        <span className="flex items-center gap-[6px]"><span aria-hidden className="size-[10px] rounded-full border-[1.5px] border-dashed border-faint" />Skipped</span>
        <span className="flex items-center gap-[6px]"><span aria-hidden className="grid size-[10px] place-items-center rounded-full bg-fg-2"><span className="size-[4px] rounded-full bg-bg" /></span>{centredOnBusiness ? "The business" : "Grid centre"}</span>
      </p>
      {notice ? <p role="alert" className="m-0 text-[13px] text-amber">{notice}</p> : null}
    </div>
  );
}
