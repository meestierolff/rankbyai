import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/marketing/page-shell";
import { AI_DISCLAIMER_TEXT } from "@/lib/copy";
import { hasRegionalPages, listRegionalPagesCached, monthYear, titleCase } from "@/lib/regional";

export async function generateMetadata(): Promise<Metadata> {
  // An empty index is a thin page: keep it out of search until a regional page is public.
  const hasPages = await hasRegionalPages();
  return {
    title: "AI visibility by city",
    description: "Which local businesses AI assistants recommend, by niche and city, built from aggregated RankbyAI scans.",
    alternates: { canonical: "/ai" },
    ...(hasPages ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function AiIndexPage() {
  const pages = await listRegionalPagesCached();
  return (
    <ProsePage
      eyebrow="Regional data"
      title="AI visibility by city"
      intro="Which businesses do AI assistants recommend for a niche in a city? These pages are built from aggregated scans and published once there is enough data to be useful."
    >
      {pages.length === 0 ? (
        <>
          <h2>No pages yet</h2>
          <p>
            A regional page is published only when it is based on at least 27 AI answers from at least 2 separate scans. No niche and city has reached
            that yet, so there is nothing to list. Pages will appear here as scans accumulate.
          </p>
          <p>
            Meanwhile you can see real answers for one business: <Link href="/#free-check">run a free check</Link>.
          </p>
        </>
      ) : (
        <>
          <h2>Pages</h2>
          <ul>
            {pages.map((p) => (
              <li key={`${p.niche_slug}/${p.city_slug}`}>
                <Link href={`/ai/${p.niche_slug}/${p.city_slug}`}>{titleCase(p.labels.niche)} in {p.labels.city}</Link> ({p.sample_count} answers, updated {monthYear(p.last_updated)})
              </li>
            ))}
          </ul>
        </>
      )}
      <h2>How the data is collected</h2>
      <p>
        Through official APIs only, at fixed map points and dates. {AI_DISCLAIMER_TEXT} Pages are built from scans that ran on our own keys and from
        customers who chose to share their scans. They never identify the customer whose scan contributed data.
      </p>
      <p>Is your business on a page and you want it removed or corrected? Use the <Link href="/removal">removal request</Link> form.</p>
    </ProsePage>
  );
}
