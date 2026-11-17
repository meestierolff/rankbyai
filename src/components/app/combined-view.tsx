"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AiDisclaimer } from "@/components/brand/primitives";
import { DotGrid, type CellView } from "@/components/brand/grid";
import { Segmented } from "@/components/brand/segmented";
import type { MapPoint } from "./grid-map";

const GridMap = dynamic(() => import("./grid-map").then((m) => m.GridMap), {
  ssr: false,
  loading: () => <div className="h-[480px] animate-pulse rounded-xl bg-surface" aria-label="Loading map" />,
});

type Layer = "maps" | "ai" | "both";

/** The AI grid drawn over the same map as the Maps grid (brief 7.3, "our twist"). */
export function CombinedView({
  center, radiusMiles, maps, ai, insight, mapsN, aiN,
}: {
  center: { lat: number; lng: number };
  radiusMiles: number;
  maps: MapPoint[] | null;
  ai: MapPoint[] | null;
  insight: string | null;
  mapsN: number;
  aiN: number;
}) {
  const [layer, setLayer] = useState<Layer>(maps && ai ? "both" : maps ? "maps" : "ai");
  const [view, setView] = useState<"map" | "grid">("map");
  const points: MapPoint[] = [
    ...(maps && layer !== "ai" ? maps.map((p) => ({ ...p, small: layer === "both" })) : []),
    ...(ai && layer !== "maps" ? ai : []),
  ];
  const cells = (pts: MapPoint[]): CellView[] => pts.map((p) => ({ key: p.key, bg: p.bg, fg: p.fg, label: p.label, title: p.title }));

  return (
    <div className="flex flex-col gap-4">
      {insight ? <p className="m-0 border-l-2 border-fg py-1 pl-4 text-[17px] leading-snug font-medium">{insight}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Layer" size="sm" value={layer} onChange={setLayer} className="min-w-[300px]"
          options={[
            { value: "maps" as const, label: "Maps rank", disabled: !maps },
            { value: "ai" as const, label: "AI mentions", disabled: !ai },
            { value: "both" as const, label: "Both", disabled: !maps || !ai },
          ]}
        />
        <Segmented label="View" size="sm" value={view} onChange={setView} className="w-[150px]" options={[{ value: "map" as const, label: "Map" }, { value: "grid" as const, label: "Grid" }]} />
      </div>
      {view === "map" ? (
        <GridMap center={center} radiusMiles={radiusMiles} points={points} className="h-[480px]" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {maps && layer !== "ai" ? (
            <div className="flex flex-col gap-2"><span className="text-[13px] text-muted-foreground">Google Maps rank · {mapsN}×{mapsN}</span><DotGrid n={mapsN} cells={cells(maps)} fontPx={mapsN >= 9 ? 9 : 11} gapPx={4} /></div>
          ) : null}
          {ai && layer !== "maps" ? (
            <div className="flex flex-col gap-2"><span className="text-[13px] text-muted-foreground">AI engines naming the business · {aiN}×{aiN}</span><DotGrid n={aiN} cells={cells(ai)} fontPx={13} gapPx={8} /></div>
          ) : null}
        </div>
      )}
      <p className="m-0 text-[12px] text-dim">Small markers: Google Maps rank. Large markers: how many AI engines named the business at that point.</p>
      {ai ? <AiDisclaimer /> : null}
    </div>
  );
}
