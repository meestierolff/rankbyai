"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import { buildGrid } from "@/lib/scans/grid";

export type Pt = { lat: number; lng: number };

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

const gridData = (centre: Pt, n: number, radiusMiles: number) => ({
  type: "FeatureCollection" as const,
  features: n > 1 ? buildGrid(centre, n, radiusMiles).map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] } })) : [],
});

const boundsFor = (c: Pt, radiusMiles: number): [[number, number], [number, number]] => {
  const dLat = (Math.max(radiusMiles, 0.5) * 1.3) / 69;
  const dLng = dLat / Math.cos((c.lat * Math.PI) / 180);
  return [[c.lng - dLng, c.lat - dLat], [c.lng + dLng, c.lat + dLat]];
};

/**
 * A map with one point to move: the centre of a grid (its points drawn around it) or a business's
 * pin. Drag the marker or click the map to move it. The business's own pin is shown for reference.
 */
export function CentreMap({ centre, business, n, radiusMiles, onMove, label, className }: {
  centre: Pt;
  business: Pt | null;
  /** Points per side of the grid to draw; 0 draws no grid (moving a business pin). */
  n: number;
  radiusMiles: number;
  onMove: (p: Pt) => void;
  label: string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const marker = useRef<MlMarker | null>(null);
  const pin = useRef<MlMarker | null>(null);
  const onMoveRef = useRef(onMove);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !el.current) return;
        ml.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
        const m = new ml.Map({ container: el.current, style: STYLE_URL, bounds: boundsFor(centre, radiusMiles), fitBoundsOptions: { padding: 24 }, attributionControl: { compact: true }, cooperativeGestures: true });
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.on("error", () => {});
        m.on("click", (e) => onMoveRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
        m.on("load", () => {
          m.addSource("grid", { type: "geojson", data: gridData(centre, n, radiusMiles) });
          m.addLayer({ id: "grid", type: "circle", source: "grid", paint: { "circle-radius": n >= 11 ? 3 : 4.5, "circle-color": "#d6d3ce", "circle-opacity": 0.85, "circle-stroke-width": 1, "circle-stroke-color": "#0b0b0b" } });
          if (!cancelled) setReady(true);
        });
        // The point being moved: a ring with a dot, draggable.
        const handle = document.createElement("div");
        Object.assign(handle.style, { width: "28px", height: "28px", borderRadius: "50%", border: "3px solid #ff7a1a", background: "rgba(11,11,11,.55)", boxShadow: "0 0 0 2px #0b0b0b", cursor: "grab", display: "grid", placeItems: "center" });
        const dot = document.createElement("span");
        Object.assign(dot.style, { width: "6px", height: "6px", borderRadius: "50%", background: "#ff7a1a", display: "block" });
        handle.appendChild(dot);
        handle.setAttribute("aria-label", label);
        handle.title = label;
        const mk = new ml.Marker({ element: handle, draggable: true }).setLngLat([centre.lng, centre.lat]).addTo(m);
        mk.on("dragend", () => {
          const p = mk.getLngLat();
          onMoveRef.current({ lat: p.lat, lng: p.lng });
        });
        marker.current = mk;
        if (business) {
          const ring = document.createElement("div");
          Object.assign(ring.style, { width: "16px", height: "16px", borderRadius: "50%", border: "2.5px solid #f4f2ee", background: "transparent", pointerEvents: "none" });
          ring.title = "The business's map point";
          pin.current = new ml.Marker({ element: ring }).setLngLat([business.lng, business.lat]).addTo(m);
        }
        map.current = m;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      marker.current?.remove();
      pin.current?.remove();
      map.current?.remove();
      map.current = null;
    };
    // The map is created once; the effects below follow the centre, grid and pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the centre (moved by drag, click, search or reset): marker, grid, and the view when it left it.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    marker.current?.setLngLat([centre.lng, centre.lat]);
    if (ready) (m.getSource("grid") as GeoJSONSource | undefined)?.setData(gridData(centre, n, radiusMiles));
    if (!m.getBounds().contains([centre.lng, centre.lat])) m.fitBounds(boundsFor(centre, radiusMiles), { padding: 24, duration: 600 });
  }, [centre, n, radiusMiles, ready]);

  useEffect(() => {
    if (business) pin.current?.setLngLat([business.lng, business.lat]);
  }, [business]);

  if (failed) return <div className={`grid place-items-center rounded-xl border border-border bg-well p-6 text-center text-[14px] text-muted-foreground ${className ?? ""}`}>The map could not load in this browser. Use the address search above.</div>;
  return <div ref={el} className={`overflow-hidden rounded-xl border border-border bg-well ${className ?? ""}`} role="application" aria-label={label} />;
}
