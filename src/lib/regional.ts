import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { dbAdmin, dbAnon } from "@/lib/db/clients";
import { ENGINES, ENGINE_LABEL, type Engine } from "@/lib/pricing-constants";
import { namesMatch, normalizeName } from "@/lib/scans/match";
import { publicEnv } from "@/lib/env";
import { pingIndexNow } from "@/lib/indexnow";

/**
 * Public regional pages (brief 12): "Which {niche} do AI assistants recommend in {City}?"
 *
 * Built only from scans that may be published: scans that ran on our own keys, and scans from
 * workspaces that opted in. A page never says whose scan contributed. Visitors can read a page only
 * once it rests on at least 27 answers from at least 2 scans: row-level security hides thinner pages
 * completely, so they are neither reachable nor in the sitemap.
 */
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export interface RegionalPage {
  niche_slug: string;
  city_slug: string;
  labels: { niche: string; city: string; region: string | null; country: string | null };
  engine_stats: Partial<Record<Engine, { answers: number }>>;
  top_businesses: { name: string; answers: number }[];
  maps_leaders: { name: string; top3_points: number }[];
  sample_count: number;
  scans_count: number;
  first_seen: string;
  last_updated: string;
  indexable: boolean;
}

const COLS = "niche_slug, city_slug, labels, engine_stats, top_businesses, maps_leaders, sample_count, scans_count, first_seen, last_updated, indexable";

export async function listRegionalPages(onlyIndexable = true): Promise<RegionalPage[]> {
  const q = dbAnon().from("regional_pages").select(COLS).order("sample_count", { ascending: false }).limit(500);
  const { data } = onlyIndexable ? await q.eq("indexable", true) : await q;
  return (data ?? []) as RegionalPage[];
}

/** Cached list for prerendered pages (the index and the sitemap). Refreshed every ten minutes. */
export async function listRegionalPagesCached(): Promise<RegionalPage[]> {
  "use cache";
  cacheLife({ stale: 600, revalidate: 600, expire: 3600 });
  cacheTag("regional");
  return listRegionalPages(true).catch(() => []);
}

/**
 * Whether any regional page is public. Until one is, links to /ai stay off the footer, sitemap and
 * llms.txt: a visitor following "AI by city" should find real data, not an empty index.
 */
export async function hasRegionalPages(): Promise<boolean> {
  return (await listRegionalPagesCached()).length > 0;
}

/** Cached page lookup: a regional page changes at most once a day. */
export async function getRegionalPageCached(niche: string, city: string): Promise<RegionalPage | null> {
  "use cache";
  cacheLife({ stale: 600, revalidate: 600, expire: 3600 });
  cacheTag("regional");
  return getRegionalPage(niche, city);
}

export async function getRegionalPage(niche: string, city: string): Promise<RegionalPage | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(niche) || !/^[a-z0-9-]{1,60}$/.test(city)) return null;
  const { data } = await dbAnon().from("regional_pages").select(COLS).eq("niche_slug", niche).eq("city_slug", city).maybeSingle();
  return (data as RegionalPage | null) ?? null;
}

interface ScanRow { id: string; kind: "ai" | "maps"; niche: string | null; keyword: string | null; funding: string; created_at: string; summary: { top_competitors?: { name: string; top3_points?: number }[] } | null; businesses: { city: string | null; region: string | null; country: string | null } | { city: string | null; region: string | null; country: string | null }[] | null; workspaces: { share_scans_for_regional_pages: boolean } | { share_scans_for_regional_pages: boolean }[] | null }
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * Rebuild every regional page from the scans that may be published. Idempotent; run by cron.
 * Pages that became public or gained answers are announced through IndexNow (production only).
 */
export async function rebuildRegionalPages(): Promise<{ pages: number; indexable: number; announced: number }> {
  const admin = dbAdmin();
  const { data } = await admin
    .from("scans")
    .select("id, kind, niche, keyword, funding, created_at, summary, businesses(city, region, country), workspaces(share_scans_for_regional_pages)")
    .in("status", ["done", "partial"]).order("created_at", { ascending: false }).limit(3000);
  const publishable = ((data ?? []) as unknown as ScanRow[]).filter((s) => s.funding !== "byok" || one(s.workspaces)?.share_scans_for_regional_pages === true);

  const groups = new Map<string, { labels: RegionalPage["labels"]; ai: ScanRow[]; maps: ScanRow[] }>();
  for (const s of publishable) {
    const b = one(s.businesses);
    const term = (s.kind === "ai" ? s.niche : s.keyword)?.trim();
    if (!b?.city || !term) continue;
    const key = `${slugify(term)}/${slugify(b.city)}`;
    if (key.startsWith("/") || key.endsWith("/")) continue;
    const g = groups.get(key) ?? { labels: { niche: term.toLowerCase(), city: b.city, region: b.region, country: b.country }, ai: [], maps: [] };
    (s.kind === "ai" ? g.ai : g.maps).push(s);
    groups.set(key, g);
  }

  // What was public before this rebuild, so only new or grown pages are announced to search engines.
  const { data: before } = await admin.from("regional_pages").select("niche_slug, city_slug, sample_count, indexable");
  const previous = new Map(((before ?? []) as { niche_slug: string; city_slug: string; sample_count: number; indexable: boolean }[]).map((r) => [`${r.niche_slug}/${r.city_slug}`, r]));
  const changed: string[] = [];

  let indexable = 0;
  for (const [key, g] of groups) {
    if (!g.ai.length) continue;
    const [niche_slug, city_slug] = key.split("/");
    const ids = g.ai.map((s) => s.id).slice(0, 200);
    const { data: samples } = await admin.from("ai_samples").select("engine, named_businesses").in("scan_id", ids).eq("status", "done").limit(5000);
    const rows = (samples ?? []) as { engine: Engine; named_businesses: { name: string }[] | null }[];
    const engine_stats: RegionalPage["engine_stats"] = {};
    const named: { name: string; answers: number }[] = [];
    for (const r of rows) {
      engine_stats[r.engine] = { answers: (engine_stats[r.engine]?.answers ?? 0) + 1 };
      // One count per answer, however often the answer repeats a name.
      const seen = new Set<string>();
      for (const n of r.named_businesses ?? []) {
        if (!n?.name || seen.has(normalizeName(n.name))) continue;
        seen.add(normalizeName(n.name));
        const hit = named.find((x) => namesMatch(x.name, n.name));
        if (hit) hit.answers++;
        else named.push({ name: n.name, answers: 1 });
      }
    }
    const leaders = new Map<string, { name: string; top3_points: number }>();
    for (const s of g.maps) for (const c of s.summary?.top_competitors ?? []) {
      const k = normalizeName(c.name);
      leaders.set(k, { name: c.name, top3_points: (leaders.get(k)?.top3_points ?? 0) + (c.top3_points ?? 0) });
    }
    const row = {
      niche_slug, city_slug, labels: g.labels, engine_stats,
      top_businesses: named.sort((a, b) => b.answers - a.answers).slice(0, 15),
      maps_leaders: [...leaders.values()].sort((a, b) => b.top3_points - a.top3_points).slice(0, 10),
      sample_count: rows.length, scans_count: g.ai.length, last_updated: g.ai[0].created_at,
    };
    const { error } = await admin.from("regional_pages").upsert(row, { onConflict: "niche_slug,city_slug" });
    if (error) throw new Error(`regional page upsert failed: ${error.message}`);
    if (rows.length >= 27 && g.ai.length >= 2) {
      indexable++;
      const was = previous.get(key);
      if (!was?.indexable || was.sample_count !== rows.length) changed.push(key);
    }
  }
  const wasAnyPublic = [...previous.values()].some((r) => r.indexable);
  const urls = changed.map((k) => `${publicEnv.siteUrl}/ai/${k}`);
  // The /ai index lists the pages, so it changes with them; it is announced too, and first appears with the first page.
  if (urls.length || (indexable > 0 && !wasAnyPublic)) urls.push(`${publicEnv.siteUrl}/ai`);
  const pinged = await pingIndexNow(urls);
  return { pages: groups.size, indexable, announced: pinged.sent };
}

export const engineLine = (p: RegionalPage) => ENGINES.filter((e) => p.engine_stats[e]).map((e) => `${ENGINE_LABEL[e].short}: ${p.engine_stats[e]!.answers} answers`).join(" · ");
export const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
export const titleCase = (s: string) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
