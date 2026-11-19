"use client";

import dynamic from "next/dynamic";
import { useState, type FormEvent } from "react";
import { milesBetween } from "@/lib/scans/grid";
import type { Pt } from "./centre-map";
import { inputClass } from "./ui";

const CentreMap = dynamic(() => import("./centre-map").then((m) => m.CentreMap), {
  ssr: false,
  loading: () => <div className="h-[360px] animate-pulse rounded-xl bg-surface" aria-label="Loading map" />,
});

const fmtMiles = (m: number) => (m < 0.1 ? "less than 0.1 miles" : `${m < 10 ? m.toFixed(1) : Math.round(m)} miles`);

interface Place { label: string; lat: number; lng: number }

/**
 * Choose a point on the map: where a grid is centred ("grid"), or where the business really is
 * ("pin"). Search an address, drag the marker, or click the map. `value` null means "the business's
 * own map point"; the parent decides what that is and what happens on save.
 */
export function CentrePicker({ mode, value, business, n = 0, radiusMiles, country, onChange }: {
  mode: "grid" | "pin";
  value: Pt | null;
  business: Pt | null;
  n?: number;
  radiusMiles: number;
  country?: string | null;
  onChange: (p: Pt | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = value ?? business;
  const moved = value && business ? milesBetween(value, business) : null;

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setBusy(true);
    setProblem(null);
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}${country ? `&country=${encodeURIComponent(country)}` : ""}`).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { places?: Place[]; message?: string }) : {};
    setBusy(false);
    if (!res?.ok) return setProblem(json.message ?? "The address search failed. Drag the map instead.");
    setPlaces(json.places ?? []);
    if (json.places?.length === 1) choose(json.places[0]);
  };
  const choose = (p: Place) => {
    onChange({ lat: p.lat, lng: p.lng });
    setPlaces(null);
    setQuery(p.label.split(",").slice(0, 2).join(","));
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={search} className="flex flex-wrap gap-2" role="search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={200}
          placeholder={mode === "grid" ? "Search an address or area to centre the grid" : "Search the business's address"}
          aria-label={mode === "grid" ? "Address or area for the grid centre" : "The business's address"}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="submit" disabled={busy || query.trim().length < 3} className="cursor-pointer rounded-[10px] border border-border-strong bg-transparent px-4 text-[14px] font-medium text-fg hover:bg-line disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? "Searching…" : "Find"}
        </button>
      </form>
      {problem ? <p role="alert" className="m-0 text-[13px] text-amber">{problem}</p> : null}
      {places ? (
        places.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 rounded-xl border border-border bg-inset p-2" aria-label="Places found">
            {places.map((p) => (
              <li key={`${p.lat},${p.lng}`}>
                <button type="button" onClick={() => choose(p)} className="w-full cursor-pointer rounded-lg border-0 bg-transparent px-3 py-2 text-left text-[13.5px] text-fg hover:bg-line">{p.label}</button>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-[13px] text-dim">No place found. Try a street and city, or drag the map.</p>
      ) : null}

      {shown ? (
        <CentreMap
          centre={shown}
          business={business}
          n={mode === "grid" ? n : 0}
          radiusMiles={mode === "grid" ? radiusMiles : 0.6}
          onMove={(p) => onChange(p)}
          label={mode === "grid" ? "Grid centre: drag it, or click the map" : "Business location: drag it, or click the map"}
          className="h-[360px]"
        />
      ) : (
        <p className="m-0 rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-[14px] text-muted-foreground">
          {mode === "grid" ? "This business has no map point yet. Search an address to choose where to centre the grid." : "Search the address to place the business on the map."}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-dim">
        <span aria-live="polite">
          {mode === "grid"
            ? value
              ? moved != null ? `Centre moved ${fmtMiles(moved)} from the business's map point.` : "Centre chosen on the map."
              : "Centred on the business's map point."
            : value && business ? `New point ${fmtMiles(moved ?? 0)} from the saved one.` : "Drag the marker or click the map to move it."}
        </span>
        {mode === "grid" && value && business ? (
          <button type="button" onClick={() => onChange(null)} className="cursor-pointer rounded-[9px] border border-border-strong bg-transparent px-3 py-[5px] text-[13px] font-medium text-fg hover:bg-line">
            Back to the business
          </button>
        ) : null}
      </div>
      <p className="m-0 text-[11.5px] text-faint">Address search by Nominatim · © OpenStreetMap contributors</p>
    </div>
  );
}
