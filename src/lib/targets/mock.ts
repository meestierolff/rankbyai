import type { BacklinkPage } from "@/lib/providers/dataforseo";

/**
 * Simulated DataForSEO Backlinks and traffic answers for tests and local runs without vendors
 * (RANKBYAI_MOCK_PROVIDERS=1). Shaped like the real ones measured on 23 Nov 2026; every address is
 * an example domain. Deterministic per target.
 */
const SHARED = "https://bestlocal.example/best-dentists-2026";

export function mockBacklinks(target: string, limit: number, isClient: boolean): BacklinkPage[] {
  const slug = target.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const page = (url: string, title: string | null, rank: number): BacklinkPage => ({
    url, domain: new URL(url).hostname.replace(/^www\./, ""), title, pageRank: rank, domainRank: rank + 50, dofollow: true,
    firstSeen: "2026-05-01 00:00:00 +00:00", lastSeen: "2026-11-20 00:00:00 +00:00", urlTo: `https://${target}/`,
  });
  const pages = isClient
    ? [page("https://reviews.example/client-review", "Client review", 120)]
    : [
        page(SHARED, "The 10 Best Dentists in 2026", 300),
        page(`https://top-lists.example/top-10-${slug}`, `Top 10 picks including ${target}`, 220),
        page("https://www.yelp.com/search?find_desc=best+dentist", "THE BEST 10 Dentists", 400),
        page(`https://${slug}-fans.example/review`, null, 90),
        // The business itself is on this one (the client's backlinks list it too).
        page("https://reviews.example/client-review", "Client review", 120),
      ];
  return pages.slice(0, Math.max(0, limit));
}

/** A traffic figure per page that is stable per address; one page gets none, as real answers do. */
export function mockTraffic(urls: string[]): Map<string, number | null> {
  return new Map(urls.map((u, i) => [u, u.includes("fans.example") ? null : 1000 - i * 37]));
}
