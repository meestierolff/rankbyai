import "server-only";
import { isMockMode } from "@/lib/mock";
import { dbAdmin } from "@/lib/db/clients";
import { milesBetween, type GridPoint } from "./grid";

/**
 * Neighbourhood names for grid points.
 *
 * The brief suggested reverse-geocoding each point with Nominatim, but its usage policy forbids
 * systematic grid queries. Instead we make ONE OpenStreetMap Overpass request per area (cached),
 * fetch the named places inside the radius, and label each point with the nearest one. Points with
 * no named place nearby stay unlabelled and the prompt falls back to coordinates.
 */
export interface NamedPlace {
  name: string;
  kind: string;
  lat: number;
  lng: number;
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const UA = "RankbyAI/1.0 (+https://rankbyai.live; contact via site)";

export async function fetchPlaces(center: { lat: number; lng: number }, radiusMiles: number, kinds = "suburb|neighbourhood|quarter|town|village|city"): Promise<NamedPlace[]> {
  if (isMockMode()) return [];
  const radiusM = Math.round(Math.min(Math.max(radiusMiles, 0.5) * 1.5, 40) * 1609.34);
  const key = `places:${center.lat.toFixed(2)},${center.lng.toFixed(2)}:${Math.round(radiusM / 500)}:${kinds}`;
  const admin = dbAdmin();
  const cached = await admin.from("geo_cache").select("value").eq("key", key).maybeSingle();
  if (cached.data?.value) return cached.data.value as NamedPlace[];

  const query = `[out:json][timeout:12];node["place"~"^(${kinds})$"]["name"](around:${radiusM},${center.lat},${center.lng});out body 300;`;
  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: "data=" + encodeURIComponent(query),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { elements?: { lat: number; lon: number; tags?: Record<string, string> }[] };
    const places = (json.elements ?? [])
      .filter((e) => e.tags?.name)
      .map((e) => ({ name: e.tags!["name:en"] ?? e.tags!.name, kind: e.tags!.place, lat: e.lat, lng: e.lon }));
    await admin.from("geo_cache").upsert({ key, kind: "places", value: places });
    return places;
  } catch {
    return [];
  }
}

/** Nearest neighbourhood-level place within `maxMiles` of each point (city-level names are skipped: too coarse). */
export function labelPoints(points: GridPoint[], places: NamedPlace[], maxMiles = 1.25): (string | null)[] {
  const fine = places.filter((p) => p.kind === "suburb" || p.kind === "neighbourhood" || p.kind === "quarter" || p.kind === "village");
  return points.map((pt) => {
    let best: { name: string; d: number } | null = null;
    for (const p of fine) {
      const d = milesBetween(pt, p);
      if (d <= maxMiles && (!best || d < best.d)) best = { name: p.name, d };
    }
    return best?.name ?? null;
  });
}
