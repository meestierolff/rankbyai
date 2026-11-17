import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { CtaLink, Eyebrow } from "@/components/brand/primitives";
import { PageShell } from "@/components/marketing/page-shell";
import { AI_DISCLAIMER_TEXT } from "@/lib/copy";
import { publicEnv } from "@/lib/env-public";
import { engineLine, getRegionalPageCached as getRegionalPage, monthYear, titleCase } from "@/lib/regional";
import { breadcrumbLd, faqLd, graph } from "@/lib/seo";

type Props = { params: Promise<{ niche: string; city: string }> };

// A blocking route: the lookup finishes before any byte is sent (the proxy already answers 404 for unknown pages).
export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await io();
  const { niche, city } = await params;
  const page = await getRegionalPage(niche, city);
  if (!page) return { robots: { index: false, follow: false } };
  const title = `Which ${page.labels.niche} do AI assistants recommend in ${page.labels.city}? (${monthYear(page.last_updated)})`;
  return {
    title,
    description: `The ${page.labels.niche} businesses that ChatGPT, Perplexity and Gemini named most often in ${page.labels.city}, from ${page.sample_count} answers collected through official APIs.`,
    alternates: { canonical: `/ai/${niche}/${city}` },
    // A page is public only once it rests on 27 answers from 2 scans (a database rule), so every page a visitor can reach is indexable.
    robots: { index: true, follow: true },
  };
}

export default async function RegionalPage({ params }: Props) {
  await io();
  const { niche, city } = await params;
  const page = await getRegionalPage(niche, city);
  if (!page) notFound();
  const { labels } = page;
  const where = [labels.city, labels.region].filter(Boolean).join(", ");
  const top = page.top_businesses;
  const path = `/ai/${niche}/${city}`;
  const faqs = [
    { q: `Which ${labels.niche} do AI assistants recommend most in ${labels.city}?`, a: top.length ? `In ${page.sample_count} answers collected up to ${monthYear(page.last_updated)}, the businesses named most often were ${top.slice(0, 3).map((b) => `${b.name} (${b.answers} answers)`).join(", ")}. ${AI_DISCLAIMER_TEXT}` : "No business was named often enough to list yet." },
    { q: "How was this measured?", a: `The question “Who are the best ${labels.niche} near me?” was asked through the official APIs of the AI engines at fixed map points in ${labels.city}. This page counts how many answers named each business. It rests on ${page.sample_count} answers from ${page.scans_count} scans.` },
    { q: "Is this a ranking of the best businesses?", a: "No. It is a count of which businesses AI assistants named, at the points and dates sampled. It says nothing about the quality of a business, and the answers change over time." },
  ];
  const site = publicEnv.siteUrl;
  return (
    <PageShell>
      <JsonLd data={graph(
        breadcrumbLd([{ name: "Home", path: "/" }, { name: "AI visibility by city", path: "/ai" }, { name: `${titleCase(labels.niche)} in ${labels.city}`, path }]),
        { "@type": "ItemList", name: `${titleCase(labels.niche)} named by AI assistants in ${labels.city}`, numberOfItems: top.length, itemListElement: top.map((b, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "LocalBusiness", name: b.name, address: { "@type": "PostalAddress", addressLocality: labels.city, ...(labels.region ? { addressRegion: labels.region } : {}) } } })) },
        { "@type": "Dataset", name: `AI assistant recommendations for ${labels.niche} in ${labels.city}`, description: `Counts of businesses named by ChatGPT, Perplexity and Gemini for ${labels.niche} in ${where}: ${page.sample_count} answers from ${page.scans_count} scans, collected through official APIs.`, url: `${site}${path}`, dateModified: page.last_updated, creator: { "@type": "Organization", name: "RankbyAI", url: site }, isAccessibleForFree: true },
        faqLd(faqs, `${site}${path}#faq`),
      )} />
      <article className="container-page flex flex-col gap-10 pt-[clamp(48px,7vw,96px)] pb-[var(--rb-section-y)]">
        <header className="flex max-w-[860px] flex-col gap-5">
          <nav aria-label="Breadcrumb" className="text-[13px] text-dim"><Link href="/ai" className="text-dim no-underline hover:text-fg">AI visibility by city</Link> <span aria-hidden>/</span> <span>{where}</span></nav>
          <Eyebrow>Regional data · {monthYear(page.last_updated)}</Eyebrow>
          <h1 className="m-0 text-[clamp(32px,4.6vw,54px)] leading-[1.06] font-semibold tracking-[-0.04em] text-balance">Which {labels.niche} do AI assistants recommend in {labels.city}?</h1>
          <p className="text-lead m-0">
            {top.length ? <>Across {page.sample_count} answers from ChatGPT, Perplexity and Gemini, {top[0].name} was named most often ({top[0].answers} answers).</> : <>There are {page.sample_count} answers so far and no business stands out yet.</>} This is a count of what the assistants said at the points and dates sampled, not a ranking of quality.
          </p>
        </header>

        <section className="flex flex-col gap-4" aria-labelledby="named">
          <h2 id="named" className="m-0 text-[clamp(22px,2.6vw,30px)] font-semibold tracking-[-0.02em]">Businesses named most often</h2>
          {top.length === 0 ? <p className="m-0 text-[16px] text-muted-foreground">None yet.</p> : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="w-full min-w-[480px] border-collapse text-left text-[15px]">
                <thead><tr className="text-[13px] text-dim"><th scope="col" className="border-b border-line px-4 py-3 font-medium">#</th><th scope="col" className="border-b border-line px-4 py-3 font-medium">Business</th><th scope="col" className="border-b border-line px-4 py-3 font-medium">Named in</th></tr></thead>
                <tbody>
                  {top.map((b, i) => (
                    <tr key={b.name} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-mono text-dim">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{b.name}</td>
                      <td className="px-4 py-3 font-mono">{b.answers} of {page.sample_count} answers</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="m-0 text-[13px] text-dim">{engineLine(page)}</p>
        </section>

        {page.maps_leaders.length ? (
          <section className="flex flex-col gap-3" aria-labelledby="maps">
            <h2 id="maps" className="m-0 text-[clamp(22px,2.6vw,30px)] font-semibold tracking-[-0.02em]">Most often in the Google Maps top 3</h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px] text-fg-2">{page.maps_leaders.slice(0, 8).map((m) => <li key={m.name}>{m.name} <span className="font-mono text-[13px] text-dim">· top 3 at {m.top3_points} sampled points</span></li>)}</ul>
          </section>
        ) : null}

        <section className="flex max-w-[820px] flex-col gap-3" aria-labelledby="method">
          <h2 id="method" className="m-0 text-[clamp(22px,2.6vw,30px)] font-semibold tracking-[-0.02em]">How this was measured</h2>
          <p className="m-0 text-[16px] leading-relaxed text-muted-foreground">
            The same question was asked through the official APIs of the AI engines at fixed map points in {where}. This page counts the answers that named each business. It is built from {page.sample_count} answers in {page.scans_count} {page.scans_count === 1 ? "scan" : "scans"}, first collected in {monthYear(page.first_seen)} and last updated in {monthYear(page.last_updated)}. {AI_DISCLAIMER_TEXT}
          </p>
          <p className="m-0 text-[16px] leading-relaxed text-muted-foreground">
            RankbyAI is not affiliated with the businesses listed. Is your business on this page and you want it removed or corrected? <Link href={`/removal?page=${encodeURIComponent(path)}`} className="text-fg underline underline-offset-2">Send a removal or correction request</Link>; we handle it within 7 days.
          </p>
        </section>

        <section className="flex max-w-[820px] flex-col gap-4" id="faq">
          <h2 className="m-0 text-[clamp(22px,2.6vw,30px)] font-semibold tracking-[-0.02em]">Questions and answers</h2>
          <dl className="m-0 flex flex-col">{faqs.map((f) => <div key={f.q} className="border-t border-line py-4 first:border-0 first:pt-0"><dt className="text-[17px] font-semibold">{f.q}</dt><dd className="m-0 mt-2 text-[16px] leading-relaxed text-muted-foreground">{f.a}</dd></div>)}</dl>
        </section>

        <section className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface p-[clamp(20px,3vw,36px)]">
          <h2 className="m-0 text-[clamp(22px,2.6vw,30px)] font-semibold tracking-[-0.02em]">Check one business, free</h2>
          <p className="m-0 max-w-[680px] text-[16px] leading-relaxed text-muted-foreground">See who three AI assistants recommend at a business&apos;s own location, and its Google Maps rank there.</p>
          <CtaLink href="/#free-check" size="md">Run a free check</CtaLink>
        </section>
      </article>
    </PageShell>
  );
}
