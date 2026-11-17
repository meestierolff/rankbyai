"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";

export interface MapPoint {
  key: string;
  lat: number;
  lng: number;
  label: string;
  bg: string;
  fg: string;
  title: string;
  selected?: boolean;
  /** Smaller markers for a background layer (combined view). */
  small?: boolean;
}

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/**
 * Scan results on a real map (MapLibre GL JS + OpenFreeMap tiles, OpenStreetMap attribution).
 * Markers are real buttons in the brand's grid-cell style. If the map cannot load (no WebGL,
 * tiles blocked) the caller's grid view remains the accessible fallback.
 */
export function GridMap({ center, points, onSelect, radiusMiles, className }: {
  center: { lat: number; lng: number };
  points: MapPoint[];
  onSelect?: (key: string) => void;
  radiusMiles: number;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Map<string, MlMarker>>(new Map());
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !el.current) return;
        ml.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
        lib.current = ml;
        const dLat = (radiusMiles * 1.25) / 69;
        const dLng = dLat / Math.cos((center.lat * Math.PI) / 180);
        const m = new ml.Map({
          container: el.current,
          style: STYLE_URL,
          bounds: [[center.lng - dLng, center.lat - dLat], [center.lng + dLng, center.lat + dLat]],
          fitBoundsOptions: { padding: 28 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
        });
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.on("error", () => {});
        map.current = m;
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    const store = markers.current;
    return () => {
      cancelled = true;
      store.forEach((mk) => mk.remove());
      store.clear();
      map.current?.remove();
      map.current = null;
    };
    // The map is created once per scan; centre and radius do not change for a scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!ready || !m || !ml) return;
    const seen = new Set<string>();
    for (const p of points) {
      seen.add(p.key);
      let mk = markers.current.get(p.key);
      if (!mk) {
        const b = document.createElement("button");
        b.type = "button";
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current?.(p.key);
        });
        mk = new ml.Marker({ element: b }).setLngLat([p.lng, p.lat]).addTo(m);
        markers.current.set(p.key, mk);
      }
      const b = mk.getElement() as HTMLButtonElement;
      const size = p.small ? 22 : 34;
      b.setAttribute("aria-label", p.title);
      b.title = p.title;
      b.textContent = p.label;
      Object.assign(b.style, {
        width: `${size}px`, height: `${size}px`, borderRadius: "50%", border: "0", padding: "0", cursor: onSelectRef.current ? "pointer" : "default",
        background: p.bg, color: p.fg, font: `600 ${p.small ? 10 : 12}px var(--font-mono)`, display: "grid", placeItems: "center",
        boxShadow: p.selected ? "0 0 0 2px var(--rb-inset), 0 0 0 4px var(--rb-fg)" : "0 1px 4px rgba(0,0,0,.6)", zIndex: p.selected ? "3" : p.small ? "1" : "2",
        opacity: p.small ? "0.92" : "1",
      });
    }
    for (const [key, mk] of markers.current) {
      if (!seen.has(key)) {
        mk.remove();
        markers.current.delete(key);
      }
    }
  }, [points, ready]);

  if (failed) {
    return <div className={`grid place-items-center rounded-xl border border-border bg-well p-6 text-center text-[14px] text-muted-foreground ${className ?? ""}`}>The map could not load in this browser. Use the grid view.</div>;
  }
  return <div ref={el} className={`overflow-hidden rounded-xl border border-border bg-well ${className ?? ""}`} role="application" aria-label="Scan results on a map" />;
}
