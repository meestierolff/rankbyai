import "server-only";
import { isMockMode } from "@/lib/mock";

/**
 * Address search for grid centres and business locations, through OpenStreetMap's Nominatim
 * (nominatim.openstreetmap.org). Its usage policy (operations.osmfoundation.org/policies/nominatim)
 * asks for an application that identifies itself, at most one request per second, cached results,
 * no search-as-you-type and visible attribution: the user agent below, the spacing and cache here,
 * one search per submit in the app, and the attribution line under the results.
 */
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "RankbyAI/1.0 (+https://rankbyai.live)";
const SPACING_MS = 1100;
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

/** Longest a search waits for its slot, and most searches queued at once, before answering "busy". */
const MAX_WAIT_MS = 3000;
const MAX_IN_FLIGHT = 5;

const cache = new Map<string, { at: number; places: Place[] }>();
let nextSlot = 0;
let inFlight = 0;

export class GeocodeError extends Error {}

/**
 * Waits for this instance's next free one-second slot; refuses (busy) rather than queue without end.
 * The spacing is per server instance: at today's traffic one instance serves these requests; a
 * shared limiter (database or KV) is the step if that changes.
 */
async function slot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  if (at - now > MAX_WAIT_MS || inFlight >= MAX_IN_FLIGHT) throw new GeocodeError("The address search is busy. Try again in a moment, or drag the map.");
  nextSlot = at + SPACING_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

/** Up to five places for a free-text address, optionally within one country (ISO 3166-1 alpha-2). */
export async function geocode(query: string, country?: string | null): Promise<Place[]> {
  const q = query.replace(/\s+/g, " ").trim();
  const cc = country && /^[A-Za-z]{2}$/.test(country) ? country.toLowerCase() : "";
  if (isMockMode()) return [{ label: `${q} (simulated)`, lat: 30.2849, lng: -97.7341 }];
  const key = `${cc}|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.places;

  await slot();
  inFlight++;
  try {
    return await lookup(key, q, cc);
  } finally {
    inFlight--;
  }
}

async function lookup(key: string, q: string, cc: string): Promise<Place[]> {
  const url = `${ENDPOINT}?format=jsonv2&limit=5&q=${encodeURIComponent(q)}${cc ? `&countrycodes=${cc}` : ""}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  } catch {
    throw new GeocodeError("The address search did not answer.");
  }
  if (!res.ok) throw new GeocodeError(res.status === 429 ? "The address search is busy. Try again in a minute." : "The address search failed.");
  const rows = (await res.json().catch(() => [])) as { display_name?: string; lat?: string; lon?: string }[];
  const places = rows
    .map((r) => ({ label: String(r.display_name ?? "").slice(0, 200), lat: Number(r.lat), lng: Number(r.lon) }))
    .filter((p) => p.label && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), places });
  return places;
}
