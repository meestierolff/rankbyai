import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { listRegionalPagesCached } from "@/lib/regional";
import { STATIC_PAGES } from "@/lib/site-pages";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${publicEnv.siteUrl}${p.path === "/" ? "" : p.path}`,
    lastModified: p.updated,
    changeFrequency: p.path === "/" ? "daily" : "monthly",
    priority: p.path === "/" ? 1 : 0.5,
  }));
  // Regional pages are listed only when they are indexable (27 answers from 2 scans).
  const regional = await listRegionalPagesCached();
  return [...fixed, ...regional.map((r) => ({ url: `${publicEnv.siteUrl}/ai/${r.niche_slug}/${r.city_slug}`, lastModified: r.last_updated, changeFrequency: "weekly" as const, priority: 0.4 }))];
}
