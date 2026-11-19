import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { listRegionalPagesCached } from "@/lib/regional";
import { STATIC_PAGES } from "@/lib/site-pages";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Regional pages are listed only when they are indexable (27 answers from 2 scans).
  const regional = await listRegionalPagesCached();
  // The /ai index is listed only once it has a page to show.
  const fixed: MetadataRoute.Sitemap = STATIC_PAGES.filter((p) => p.path !== "/ai" || regional.length > 0).map((p) => ({
    url: `${publicEnv.siteUrl}${p.path === "/" ? "" : p.path}`,
    lastModified: p.updated,
    changeFrequency: p.path === "/" ? "daily" : "monthly",
    priority: p.path === "/" ? 1 : 0.5,
  }));
  return [...fixed, ...regional.map((r) => ({ url: `${publicEnv.siteUrl}/ai/${r.niche_slug}/${r.city_slug}`, lastModified: r.last_updated, changeFrequency: "weekly" as const, priority: 0.4 }))];
}
