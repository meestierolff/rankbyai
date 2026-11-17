import { DATAFORSEO_BUSINESS_INFO_PER_CALL, DATAFORSEO_MAPS_PER_POINT, type MapsMode } from "@/lib/pricing-constants";
import { providerFetch } from "./http";
import { ProviderError, type ValidationResult } from "./types";

/** DataForSEO: Google Maps SERP (queued and live), account balance, business profiles. Official API only. */
const BASE = "https://api.dataforseo.com/v3";

export type DfsCreds = { login: string; password: string };
const auth = (c: DfsCreds) => ({ Authorization: "Basic " + Buffer.from(`${c.login}:${c.password}`).toString("base64") });

interface DfsEnvelope<R> {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: { id: string; status_code: number; status_message: string; cost?: number; data?: { tag?: string }; result?: R[] | null }[];
}

/** DataForSEO returns HTTP 200 with an in-body status; 20000 = ok, 20100 = task created. */
function assertOk<R>(env: DfsEnvelope<R>): DfsEnvelope<R> {
  const code = env.status_code ?? 0;
  if (code >= 40000) {
    const kind = code === 40100 || code === 40101 ? "auth" : code === 40200 || code === 40210 ? "quota" : code === 40202 || code === 40209 ? "rate_limit" : code >= 50000 ? "unavailable" : "bad_request";
    throw new ProviderError("dataforseo", kind, env.status_message ?? `DataForSEO error ${code}`, code);
  }
  return env;
}

export interface MapsItem {
  rank: number;
  name: string;
  cid: string | null;
  placeId: string | null;
  domain: string | null;
  url: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  rating: number | null;
  reviews: number | null;
}

interface RawMapsItem {
  type?: string;
  rank_group?: number;
  title?: string;
  cid?: string | number | null;
  place_id?: string | null;
  domain?: string | null;
  url?: string | null;
  phone?: string | null;
  address?: string | null;
  address_info?: { city?: string | null; region?: string | null; country_code?: string | null } | null;
  latitude?: number | null;
  longitude?: number | null;
  category?: string | null;
  rating?: { value?: number | null; votes_count?: number | null } | null;
}

/** Organic Maps results only (paid placements have their own item type), in rank order. */
export function parseMapsItems(result: { items?: RawMapsItem[] | null } | null | undefined): MapsItem[] {
  return (result?.items ?? [])
    .filter((it) => it.type === "maps_search" && typeof it.rank_group === "number" && it.title)
    .map((it) => ({
      rank: it.rank_group as number,
      name: it.title as string,
      cid: it.cid != null ? String(it.cid) : null,
      placeId: it.place_id ?? null,
      domain: it.domain ?? null,
      url: it.url ?? null,
      phone: it.phone ?? null,
      address: it.address ?? null,
      city: it.address_info?.city ?? null,
      region: it.address_info?.region ?? null,
      country: it.address_info?.country_code ?? null,
      lat: it.latitude ?? null,
      lng: it.longitude ?? null,
      category: it.category ?? null,
      rating: it.rating?.value ?? null,
      reviews: it.rating?.votes_count ?? null,
    }))
    .sort((a, b) => a.rank - b.rank);
}

const coord = (lat: number, lng: number, zoom = 15) => `${lat.toFixed(7)},${lng.toFixed(7)},${zoom}z`;

export interface MapsTaskSpec {
  keyword: string;
  lat: number;
  lng: number;
  tag: string;
  pingbackUrl?: string;
}

/** Queue up to 100 Maps tasks in one call (a 9×9 grid = 81). Returns task ids and the charge per task. */
export async function postMapsTasks(creds: DfsCreds, specs: MapsTaskSpec[], mode: Exclude<MapsMode, "live">): Promise<{ tag: string; taskId: string | null; costUsd: number; error?: string }[]> {
  if (specs.length > 100) throw new ProviderError("dataforseo", "bad_request", "At most 100 tasks per request.");
  const env = assertOk(
    await providerFetch<DfsEnvelope<unknown>>(`${BASE}/serp/google/maps/task_post`, {
      provider: "dataforseo",
      headers: auth(creds),
      body: specs.map((s) => ({
        keyword: s.keyword,
        location_coordinate: coord(s.lat, s.lng),
        language_code: "en",
        depth: 20,
        priority: mode === "priority" ? 2 : 1,
        tag: s.tag,
        search_places: false,
        ...(s.pingbackUrl ? { pingback_url: s.pingbackUrl } : {}),
      })),
      timeoutMs: 60_000,
      retries: 1,
    }),
  );
  const byTag = new Map((env.tasks ?? []).map((t) => [t.data?.tag ?? "", t]));
  return specs.map((s) => {
    const t = byTag.get(s.tag);
    const ok = t && t.status_code < 40000;
    return { tag: s.tag, taskId: ok ? t.id : null, costUsd: ok ? (t.cost ?? DATAFORSEO_MAPS_PER_POINT[mode]) : 0, error: ok ? undefined : (t?.status_message ?? "Task was not created") };
  });
}

/** One live Maps lookup (about 6 seconds). */
export async function mapsLive(creds: DfsCreds, spec: { keyword: string; lat?: number; lng?: number; locationCode?: number; depth?: number }): Promise<{ items: MapsItem[]; costUsd: number }> {
  const env = assertOk(
    await providerFetch<DfsEnvelope<{ items?: RawMapsItem[] }>>(`${BASE}/serp/google/maps/live/advanced`, {
      provider: "dataforseo",
      headers: auth(creds),
      body: [
        {
          keyword: spec.keyword,
          ...(spec.lat != null && spec.lng != null ? { location_coordinate: coord(spec.lat, spec.lng), search_places: false } : { location_code: spec.locationCode ?? 2840 }),
          language_code: "en",
          depth: spec.depth ?? 20,
        },
      ],
      timeoutMs: 60_000,
      retries: 1,
    }),
  );
  const task = env.tasks?.[0];
  if (!task || task.status_code >= 40000) throw new ProviderError("dataforseo", "bad_request", task?.status_message ?? "Live lookup failed", task?.status_code);
  const depthUnits = Math.max(1, Math.ceil((spec.depth ?? 20) / 100));
  return { items: parseMapsItems(task.result?.[0]), costUsd: task.cost ?? env.cost ?? DATAFORSEO_MAPS_PER_POINT.live * depthUnits };
}

/** Result of a queued task. `ready: false` while DataForSEO is still working on it. Retrieval is free. */
export async function getMapsTask(creds: DfsCreds, taskId: string): Promise<{ ready: boolean; items: MapsItem[]; tag?: string; failed?: string }> {
  const env = await providerFetch<DfsEnvelope<{ items?: RawMapsItem[] }>>(`${BASE}/serp/google/maps/task_get/advanced/${encodeURIComponent(taskId)}`, {
    provider: "dataforseo",
    headers: auth(creds),
    timeoutMs: 30_000,
    retries: 1,
  });
  const task = env.tasks?.[0];
  if (!task) return { ready: false, items: [] };
  // 40601 "Task Handed", 40602 "Task in Queue": not ready yet.
  if (task.status_code === 40601 || task.status_code === 40602 || task.status_code === 20100) return { ready: false, items: [], tag: task.data?.tag };
  if (task.status_code >= 40000) return { ready: true, items: [], tag: task.data?.tag, failed: task.status_message };
  return { ready: true, items: parseMapsItems(task.result?.[0]), tag: task.data?.tag };
}

/** Free: doubles as credential validation and shows the account balance. */
export async function validateDataForSeo(creds: DfsCreds): Promise<ValidationResult> {
  try {
    const env = assertOk(
      await providerFetch<DfsEnvelope<{ login?: string; money?: { balance?: number } }>>(`${BASE}/appendix/user_data`, {
        provider: "dataforseo",
        headers: auth(creds),
        timeoutMs: 15_000,
      }),
    );
    const balance = env.tasks?.[0]?.result?.[0]?.money?.balance;
    return { ok: true, message: "Login works.", balanceUsd: typeof balance === "number" ? balance : null, hint: creds.login };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "DataForSEO rejected this login." };
  }
}

export interface BusinessInfo {
  name: string | null;
  description: string | null;
  category: string | null;
  additionalCategories: string[];
  cid: string | null;
  placeId: string | null;
  address: string | null;
  phone: string | null;
  url: string | null;
  domain: string | null;
  totalPhotos: number | null;
  rating: number | null;
  reviews: number | null;
  isClaimed: boolean | null;
  hasHours: boolean | null;
  attributes: string[];
  lat: number | null;
  lng: number | null;
}

interface RawBusinessInfo {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  additional_categories?: string[] | null;
  cid?: string | number | null;
  place_id?: string | null;
  address?: string | null;
  phone?: string | null;
  url?: string | null;
  domain?: string | null;
  total_photos?: number | null;
  rating?: { value?: number | null; votes_count?: number | null } | null;
  is_claimed?: boolean | null;
  work_time?: { work_hours?: { timetable?: Record<string, unknown> | null } | null } | null;
  attributes?: { available_attributes?: Record<string, string[]> | null } | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function parseBusinessInfo(it: RawBusinessInfo | null | undefined): BusinessInfo | null {
  if (!it) return null;
  const timetable = it.work_time?.work_hours?.timetable;
  return {
    name: it.title ?? null,
    description: it.description ?? null,
    category: it.category ?? null,
    additionalCategories: it.additional_categories ?? [],
    cid: it.cid != null ? String(it.cid) : null,
    placeId: it.place_id ?? null,
    address: it.address ?? null,
    phone: it.phone ?? null,
    url: it.url ?? null,
    domain: it.domain ?? null,
    totalPhotos: it.total_photos ?? null,
    rating: it.rating?.value ?? null,
    reviews: it.rating?.votes_count ?? null,
    isClaimed: it.is_claimed ?? null,
    hasHours: it.work_time === undefined ? null : !!timetable && Object.keys(timetable).length > 0,
    attributes: Object.values(it.attributes?.available_attributes ?? {}).flat(),
    lat: it.latitude ?? null,
    lng: it.longitude ?? null,
  };
}

/** Google Business Profile details for the audit (live). */
export async function businessInfoLive(creds: DfsCreds, ref: { cid?: string | null; placeId?: string | null; keyword?: string; locationCode?: number }): Promise<{ info: BusinessInfo | null; costUsd: number }> {
  const keyword = ref.cid ? `cid:${ref.cid}` : ref.placeId ? `place_id:${ref.placeId}` : ref.keyword;
  if (!keyword) throw new ProviderError("dataforseo", "bad_request", "A cid, place_id or keyword is required.");
  const env = assertOk(
    await providerFetch<DfsEnvelope<{ items?: RawBusinessInfo[] }>>(`${BASE}/business_data/google/my_business_info/live`, {
      provider: "dataforseo",
      headers: auth(creds),
      body: [{ keyword, location_code: ref.locationCode ?? 2840, language_code: "en" }],
      timeoutMs: 60_000,
      retries: 1,
    }),
  );
  const task = env.tasks?.[0];
  if (!task || task.status_code >= 40000) return { info: null, costUsd: task?.cost ?? 0 };
  return { info: parseBusinessInfo(task.result?.[0]?.items?.[0]), costUsd: task.cost ?? env.cost ?? DATAFORSEO_BUSINESS_INFO_PER_CALL };
}

/** DataForSEO country location codes for the markets we serve. */
export const LOCATION_CODES: Record<string, number> = { US: 2840, GB: 2826, CA: 2124, AU: 2036, IE: 2372, NZ: 2554 };
