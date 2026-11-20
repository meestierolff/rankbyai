import Link from "next/link";
import { listRegionalPagesCached, type RegionalPage } from "@/lib/regional";

/**
 * Which public regional page the landing points to as real data, right under the sample-data tour.
 * `pages` are the published pages (each rests on at least 27 answers from 2 scans), sorted by
 * sample_count, most first. Return null to show no link.
 */
export function pickFeaturedPage(pages: RegionalPage[]): RegionalPage | null {
  // Only cities in the markets the outreach targets, so a visiting agency sees a place it knows.
  // A page where one business holds more than half the answers usually comes from grids centred on
  // that business: it reads as an advert for it, so it is never the example. `pages` is already
  // sorted by answers, most first, so the first page left is the best-supported one.
  const balanced = (p: RegionalPage) => (p.top_businesses[0]?.answers ?? 0) <= p.sample_count / 2;
  return pages.find((p) => FEATURED_COUNTRIES.has((p.labels.country ?? "").toUpperCase()) && balanced(p)) ?? null;
}

/** The markets RankbyAI's outreach targets: US, UK, Australia, New Zealand, Canada, Ireland. */
const FEATURED_COUNTRIES = new Set(["US", "GB", "AU", "NZ", "CA", "IE"]);

/**
 * "The tour is sample data; here is real data." Renders nothing until a regional page is public.
 * A cached read (listRegionalPagesCached), so it is part of the prerendered page.
 */
export async function RealDataLink() {
  const page = pickFeaturedPage(await listRegionalPagesCached());
  if (!page) return null;
  const { niche, city } = page.labels;
  return (
    <p className="container-lp m-0 -mt-2 pb-6 text-center text-[14px] leading-[1.6] text-lp-muted">
      The tour above is sample data. For real answers collected through the official APIs, see{" "}
      <Link href={`/ai/${page.niche_slug}/${page.city_slug}`} className="text-lp-fg underline underline-offset-[3px]">
        which {niche} AI assistants recommend in {city}
      </Link>{" "}
      <span className="text-lp-dim">({page.sample_count} answers)</span>, or browse{" "}
      <Link href="/ai" className="text-lp-fg underline underline-offset-[3px]">
        AI visibility by city
      </Link>
      .
    </p>
  );
}
