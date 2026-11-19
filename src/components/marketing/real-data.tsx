import Link from "next/link";
import { listRegionalPagesCached, type RegionalPage } from "@/lib/regional";

/**
 * Which public regional page the landing points to as real data, right under the sample-data tour.
 * `pages` are the published pages (each rests on at least 27 answers from 2 scans), sorted by
 * sample_count, most first. Return null to show no link.
 */
export function pickFeaturedPage(pages: RegionalPage[]): RegionalPage | null {
  // TODO(Mees): choose which page the landing features. Trade-offs:
  // - most answers (pages[0]): the most robust numbers, but may be a city outside the target markets;
  // - most recent (last_updated): proves the data is live, but may be the thinnest page;
  // - target markets first (labels.country US/GB/AU/NZ): matches the agencies being contacted;
  // - skip pages where one business holds most answers (top_businesses[0].answers / sample_count):
  //   those usually come from grids centred on that business and read as an advert for it.
  return pages[0] ?? null;
}

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
