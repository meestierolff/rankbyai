import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { STATIC_PAGES } from "@/lib/site-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  return STATIC_PAGES.map((p) => ({
    url: `${publicEnv.siteUrl}${p.path === "/" ? "" : p.path}`,
    lastModified: p.updated,
    changeFrequency: p.path === "/" ? "daily" : "monthly",
    priority: p.path === "/" ? 1 : 0.5,
  }));
}
