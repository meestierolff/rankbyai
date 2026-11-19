"use client";

import { useMemo, useState } from "react";
import { pointName } from "@/components/brand/grid";
import { cn } from "@/lib/utils";
import { aiPointLook, engineLabel, mapsPointLook } from "./model";
import { PointGrid, Swatch, type GridCell } from "./point-grid";
import { ReportMap, type MapMarker } from "./report-map";
import type { AiPoint, MapsPoint } from "./types";

type LayerKey = "ai" | "maps";

export interface MapSectionProps {
  businessName: string;
  ai: { n: number; points: AiPoint[]; caption: string; initial: number | null } | null;
  maps: { n: number; points: MapsPoint[]; keyword: string | null; caption: string; initial: number | null } | null;
  pin: { lat: number; lng: number } | null;
  /** Shown first: the map (default) or the grid. */
  initialView?: "map" | "grid";
}

const segWell = "inline-flex rounded-[10px] border border-lp-border bg-lp-well p-[3px]";
const segBtn = (on: boolean) =>
  cn(
    "rounded-[7px] px-3 py-[7px] text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    on ? "bg-[#232323] text-lp-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-lp-muted hover:text-lp-fg",
  );

/** The points' extent plus a margin, so the outer markers sit fully inside the map, clear of its controls. */
function boundsOf(points: { lat: number; lng: number }[]): [[number, number], [number, number]] {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const dLat = Math.max((n - s) * 0.1, 0.004);
  const dLng = Math.max((e - w) * 0.1, 0.004);
  return [[w - dLng, s - dLat], [e + dLng, n + dLat]];
}

/** The legend under each layer, in the product's data colours. */
export function LayerLegend({ layer }: { layer: LayerKey }) {
  const items = layer === "ai"
    ? [
        <Swatch key="g" bg="var(--rb-g1)" label="Named in the top 3" />,
        <Swatch key="a" bg="var(--rb-amber)" label="Named 4th or 5th" />,
        <Swatch key="n" bg="var(--rb-none)" label="Not named" />,
      ]
    : [
        <Swatch key="g" bg="var(--rb-g1)" label="Rank 1–3" />,
        <Swatch key="a" bg="var(--rb-amber)" label="4–10" />,
        <Swatch key="o" bg="var(--rb-orange)" label="11–20" />,
        <Swatch key="r" bg="var(--rb-red)" label="Not in the top 20" />,
      ];
  return (
    <div className="flex flex-col gap-2 text-[13px] text-lp-muted">
      <div className="flex flex-wrap gap-x-4 gap-y-2">{items}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-[7px]"><span aria-hidden className="grid size-[14px] place-items-center rounded-full bg-[#1a1a1a] font-mono text-[9px] font-bold text-fg-2">!</span>No result</span>
        <Swatch bg="transparent" dashed label="Not checked" />
        <span className="inline-flex items-center gap-[7px]"><span aria-hidden className="size-[13px] rounded-full border-2 border-fg" />The business</span>
      </div>
      {layer === "ai" ? <p className="m-0 text-[13px] text-dim">Number on a dot: assistants that named the business there, of those that answered.</p> : null}
    </div>
  );
}

/**
 * The map block of a report: the grid's points on a real map, with a toggle between the AI layer
 * (how many assistants named the business at each point) and the Google Maps layer (its rank).
 * The dot grid is rendered on the server first: it is what shows before the map has loaded, without
 * JavaScript, without WebGL, and in print.
 */
export function MapSection({ businessName, ai, maps, pin, initialView = "map" }: MapSectionProps) {
  const layers = useMemo(() => [ai ? ("ai" as const) : null, maps ? ("maps" as const) : null].filter((x): x is LayerKey => !!x), [ai, maps]);
  const [layer, setLayer] = useState<LayerKey>(layers[0]);
  const [view, setView] = useState<"map" | "grid">(initialView);
  const [mapState, setMapState] = useState<"loading" | "ready" | "failed">("loading");
  const [sel, setSel] = useState<Record<LayerKey, string | null>>({
    ai: ai?.initial != null ? String(ai.initial) : null,
    maps: maps?.initial != null ? String(maps.initial) : null,
  });

  const allPoints = useMemo(() => [...(ai?.points ?? []), ...(maps?.points ?? []), ...(pin ? [pin] : [])], [ai, maps, pin]);
  const bounds = useMemo(() => boundsOf(allPoints), [allPoints]);

  const current = layer === "ai" ? ai : maps;
  const n = current?.n ?? 1;
  const selected = sel[layer];

  const cells: GridCell[] = useMemo(() => {
    if (layer === "ai" && ai) return ai.points.map((p) => ({ key: String(p.idx), ...aiPointLook(p), selected: String(p.idx) === selected }));
    if (maps) return maps.points.map((p) => ({ key: String(p.idx), ...mapsPointLook(p), selected: String(p.idx) === selected }));
    return [];
  }, [layer, ai, maps, selected]);
  const markers: MapMarker[] = useMemo(() => {
    const pts = layer === "ai" ? ai?.points ?? [] : maps?.points ?? [];
    return pts.map((p, i) => ({ ...cells[i], key: `${layer}-${p.idx}`, lat: p.lat, lng: p.lng }));
  }, [layer, ai, maps, cells]);

  const select = (key: string) => setSel((s) => ({ ...s, [layer]: key.replace(/^(ai|maps)-/, "") }));
  const showMap = view === "map" && mapState !== "failed";
  const gridLabel = layer === "ai" ? `AI assistants at each of the ${ai?.points.length ?? 0} grid points` : `Google Maps rank at each of the ${maps?.points.length ?? 0} grid points`;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-lp-line px-[18px] py-[12px] print:hidden">
        {layers.length > 1 ? (
          <div className={segWell} role="group" aria-label="Show results from">
            <button type="button" aria-pressed={layer === "ai"} onClick={() => setLayer("ai")} className={segBtn(layer === "ai")}>AI assistants</button>
            <button type="button" aria-pressed={layer === "maps"} onClick={() => setLayer("maps")} className={segBtn(layer === "maps")}>Google Maps</button>
          </div>
        ) : (
          <span className="text-[14px] font-medium text-lp-fg">{layer === "ai" ? "AI assistants" : "Google Maps"}</span>
        )}
        <div className={segWell} role="group" aria-label="View">
          <button type="button" aria-pressed={showMap} disabled={mapState === "failed"} onClick={() => setView("map")} className={segBtn(showMap)}>Map</button>
          <button type="button" aria-pressed={!showMap} onClick={() => setView("grid")} className={segBtn(!showMap)}>Grid</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative border-lp-line p-3 sm:p-4 lg:border-r print:hidden">
          {view === "map" && mapState !== "failed" ? (
            <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-lp-line-2 bg-lp-well sm:aspect-[4/3]">
              <div className="absolute inset-0">
                <ReportMap
                  markers={markers}
                  n={n}
                  bounds={bounds}
                  pin={pin ? { ...pin, title: businessName } : null}
                  selected={selected ? `${layer}-${selected}` : null}
                  onSelect={select}
                  onStatus={setMapState}
                  label={`Map of the grid around ${businessName}. Each marker is a point; select one for its result.`}
                  className="h-full w-full"
                />
              </div>
              {mapState === "loading" ? (
                // Until the map has drawn (and without JavaScript), the grid shows the same points.
                <div className="absolute inset-0 grid place-items-center bg-lp-well p-4">
                  <PointGrid n={n} cells={cells} label={gridLabel} className="max-w-[440px]" />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <PointGrid n={n} cells={cells} onSelect={select} label={gridLabel} className="max-w-[560px]" />
              {mapState === "failed" ? <p className="m-0 text-[13px] text-dim">The map could not load in this browser, so the grid shows the same points.</p> : null}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5 p-[18px] print:hidden">
          <PointDetail layer={layer} ai={ai} maps={maps} selected={selected} />
          <LayerLegend layer={layer} />
          <p className="m-0 text-[13px] leading-normal text-dim">{current?.caption}</p>
        </div>
      </div>

      {/* Print: both grids, side by side, with their legends. */}
      <div className="hidden gap-6 p-4 print:grid print:grid-cols-2">
        {ai ? (
          <div className="flex flex-col gap-2">
            <h3 className="m-0 text-[14px] font-semibold">AI assistants</h3>
            <PointGrid n={ai.n} compact cells={ai.points.map((p) => ({ key: String(p.idx), ...aiPointLook(p) }))} label={`AI assistants at each of the ${ai.points.length} grid points`} />
            <LayerLegend layer="ai" />
          </div>
        ) : null}
        {maps ? (
          <div className="flex flex-col gap-2">
            <h3 className="m-0 text-[14px] font-semibold">Google Maps</h3>
            <PointGrid n={maps.n} compact cells={maps.points.map((p) => ({ key: String(p.idx), ...mapsPointLook(p) }))} label={`Google Maps rank at each of the ${maps.points.length} grid points`} />
            <LayerLegend layer="maps" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PointDetail({ layer, ai, maps, selected }: { layer: LayerKey; ai: MapSectionProps["ai"]; maps: MapSectionProps["maps"]; selected: string | null }) {
  if (layer === "ai" && ai) {
    const p = ai.points.find((x) => String(x.idx) === selected);
    return (
      <div aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-lp-line-2 bg-lp-surface p-4">
        {p ? (
          <>
            <div className="flex flex-col gap-[2px]">
              <span className="font-mono text-[13px] font-semibold text-lp-fg">Point {pointName(p.row, p.col)}</span>
              {p.area ? <span className="text-[13px] text-dim">{p.area}</span> : null}
            </div>
            {p.state === "skipped" ? (
              <p className="m-0 text-[14px] text-lp-muted">Not checked: this area was left out of the scan.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {p.results.map((r) => (
                  <li key={r.engine} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="text-lp-fg-2">{engineLabel(r.engine)}</span>
                    <span className={cn("font-mono text-[13px]", r.state === "named" ? "text-g1" : r.state === "not_named" ? "text-lp-muted" : "text-dim")}>
                      {r.state === "named" ? (r.position ? `named #${r.position}` : "named") : r.state === "not_named" ? "not named" : "no answer"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="m-0 text-[14px] text-lp-muted">Select a point to see what each assistant answered there.</p>
        )}
      </div>
    );
  }
  if (maps) {
    const p = maps.points.find((x) => String(x.idx) === selected);
    return (
      <div aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-lp-line-2 bg-lp-surface p-4">
        {p ? (
          <>
            <span className="font-mono text-[13px] font-semibold text-lp-fg">Point {pointName(p.row, p.col)}</span>
            <p className="m-0 text-[14px] leading-normal text-lp-fg-2">
              {p.state === "skipped"
                ? "Not checked: this area was left out of the scan."
                : p.state === "failed"
                  ? "No result came back for this point."
                  : p.rank != null && p.rank <= 20
                    ? <>Rank <span className="font-mono font-semibold text-lp-fg">#{p.rank}</span> on Google Maps{maps.keyword ? <> for “{maps.keyword}”</> : null}.</>
                    : <>Not in the Google Maps top 20{maps.keyword ? <> for “{maps.keyword}”</> : null}.</>}
            </p>
          </>
        ) : (
          <p className="m-0 text-[14px] text-lp-muted">Select a point to see the rank there.</p>
        )}
      </div>
    );
  }
  return null;
}
