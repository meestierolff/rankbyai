"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";

export interface MapMarker {
  key: string;
  lat: number;
  lng: number;
  label: string;
  bg: string;
  fg: string;
  title: string;
  /** Not checked: a dashed ring. */
  dashed: boolean;
}

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
/** If the map has not drawn by then (tiles blocked, slow device), the caller shows the grid instead. */
const LOAD_TIMEOUT_MS = 12_000;

/**
 * A report's grid points on a real map (MapLibre GL + OpenFreeMap tiles, OpenStreetMap attribution).
 * Markers are buttons sized to the grid's spacing on screen, so a 15×15 grid stays readable at 375px:
 * labels show only when a marker is large enough to hold one. The caller keeps the dot grid as the
 * text equivalent and swaps it in when `onStatus("failed")` fires (no WebGL, tiles blocked).
 */
export function ReportMap({ markers, n, bounds, pin, selected, onSelect, onStatus, label, className }: {
  markers: MapMarker[];
  n: number;
  /** [[west, south], [east, north]] covering every layer, so switching layers never moves the map. */
  bounds: [[number, number], [number, number]];
  pin: { lat: number; lng: number; title: string } | null;
  selected: string | null;
  onSelect: (key: string) => void;
  onStatus: (status: "ready" | "failed") => void;
  label: string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const store = useRef<Map<string, MlMarker>>(new Map());
  const pinEl = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ markers, n, onSelect, onStatus });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    latest.current = { markers, n, onSelect, onStatus };
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    const fail = () => {
      if (!cancelled) latest.current.onStatus("failed");
    };
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !el.current) return;
        ml.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
        lib.current = ml;
        const m = new ml.Map({
          container: el.current,
          style: STYLE_URL,
          bounds,
          fitBoundsOptions: { padding: { top: 24, right: 48, bottom: 36, left: 24 } },
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
        });
        m.touchZoomRotate.disableRotation();
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.on("error", () => {});
        timer = setTimeout(() => {
          if (!m.loaded()) fail();
        }, LOAD_TIMEOUT_MS);
        // Keep the whole grid in view when the box changes size (rotation, fonts loading), until the reader moves the map.
        let moved = false;
        const fit = () => {
          const w = el.current?.clientWidth ?? 600;
          const pad = w < 480 ? { top: 14, right: 40, bottom: 26, left: 14 } : { top: 24, right: 48, bottom: 36, left: 24 };
          if (!moved) m.fitBounds(bounds, { padding: pad, animate: false });
        };
        m.on("dragstart", () => (moved = true));
        m.on("zoomstart", (e) => {
          if ((e as { originalEvent?: unknown }).originalEvent) moved = true;
        });
        observer = new ResizeObserver(() => {
          m.resize();
          fit();
        });
        observer.observe(el.current);
        m.once("load", () => {
          clearTimeout(timer);
          if (cancelled) return;
          fit();
          // On a narrow map the open attribution would cover the bottom rows: start it folded behind its "i" button.
          if ((el.current?.clientWidth ?? 999) < 480) el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
          setReady(true);
          latest.current.onStatus("ready");
        });
        map.current = m;
      } catch {
        fail(); // no WebGL, or the library could not load
      }
    })();
    const markersNow = store.current;
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer?.disconnect();
      markersNow.forEach((mk) => mk.remove());
      markersNow.clear();
      map.current?.remove();
      map.current = null;
    };
    // One map per page view; the bounds cover every layer, so nothing here changes afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers: created and removed as layers change; sized to the grid spacing at the current zoom.
  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!ready || !m || !ml) return;
    const seen = new Set<string>();
    for (const p of markers) {
      seen.add(p.key);
      let mk = store.current.get(p.key);
      if (!mk) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "rb-data";
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          latest.current.onSelect(p.key);
        });
        mk = new ml.Marker({ element: b }).setLngLat([p.lng, p.lat]).addTo(m);
        store.current.set(p.key, mk);
      }
      const b = mk.getElement() as HTMLButtonElement;
      b.setAttribute("aria-label", p.title);
      b.setAttribute("aria-pressed", String(p.key === selected));
      b.title = p.title;
      b.dataset.label = p.label;
      Object.assign(b.style, {
        borderRadius: "50%", padding: "0", cursor: "pointer", display: "grid", placeItems: "center",
        fontFamily: "var(--font-mono)", fontWeight: "600",
        // A point that was not checked keeps a dark fill so its dashed ring shows over any tile.
        border: p.dashed ? "1.5px dashed var(--rb-fg-2)" : "0",
        background: p.dashed ? "rgba(10,10,10,.55)" : p.bg,
        color: p.fg,
        boxShadow: p.key === selected ? "0 0 0 2px #0a0a0a, 0 0 0 4px var(--rb-fg)" : p.dashed ? "none" : "0 1px 4px rgba(0,0,0,.6)",
        zIndex: p.key === selected ? "4" : p.dashed ? "1" : "2",
      });
    }
    for (const [key, mk] of store.current) {
      if (!seen.has(key)) {
        mk.remove();
        store.current.delete(key);
      }
    }

    const resize = () => {
      const pts = latest.current.markers;
      const k = latest.current.n;
      let size = 36;
      if (k > 1 && pts.length > 1) {
        const lngs = pts.map((p) => p.lng);
        const lat = pts[0].lat;
        const a = m.project([Math.min(...lngs), lat]);
        const z = m.project([Math.max(...lngs), lat]);
        size = Math.max(10, Math.min(36, (Math.abs(z.x - a.x) / (k - 1)) * 0.74));
      }
      const font = Math.max(9, Math.min(12, size * 0.36));
      if (pinEl.current) pinEl.current.style.width = pinEl.current.style.height = `${Math.round(size + 14)}px`;
      for (const mk of store.current.values()) {
        const b = mk.getElement() as HTMLButtonElement;
        const text = b.dataset.label ?? "";
        const fits = size >= (text.length >= 3 ? 26 : 19);
        b.style.width = b.style.height = `${size}px`;
        b.style.fontSize = `${font}px`;
        b.textContent = fits ? text : "";
      }
    };
    resize();
    m.on("zoomend", resize);
    m.on("resize", resize);
    return () => {
      m.off("zoomend", resize);
      m.off("resize", resize);
    };
  }, [markers, selected, ready]);

  // The business itself: a hollow ring around its point (the grid is centred on it), never covering a result.
  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!ready || !m || !ml || !pin) return;
    const d = document.createElement("div");
    d.title = pin.title;
    d.setAttribute("aria-hidden", "true");
    Object.assign(d.style, {
      width: "50px", height: "50px", borderRadius: "50%", background: "transparent", border: "2px solid var(--rb-fg)",
      boxShadow: "0 0 0 2px rgba(0,0,0,.55), inset 0 0 0 2px rgba(0,0,0,.55)", pointerEvents: "none", zIndex: "3",
    });
    pinEl.current = d;
    const mk = new ml.Marker({ element: d }).setLngLat([pin.lng, pin.lat]).addTo(m);
    m.triggerRepaint();
    m.fire("resize");
    return () => {
      pinEl.current = null;
      mk.remove();
    };
  }, [pin, ready]);

  return <div ref={el} role="region" aria-label={label} className={className} />;
}
