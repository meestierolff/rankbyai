import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { CtaLink, Eyebrow, SampleTag } from "@/components/brand/primitives";
import { AiGridMock } from "@/components/marketing/feature-mocks";
import { PageShell } from "@/components/marketing/page-shell";
import { cellFor, ROW_LABEL, ROWS, VENDOR_NAME, VERIFIED_ON } from "@/lib/competitors";
import { fmtPrice } from "@/lib/ladder";
import { getOfferCached } from "@/lib/offer";
import { breadcrumbLd, faqLd, graph, organizationLd } from "@/lib/seo";
import { publicEnv } from "@/lib/env-public";
import { seoPage, type SeoPage } from "@/lib/seo-pages";

/** "https://www.brightlocal.com/pricing/" → "brightlocal.com/pricing" (the visible source label). */
const sourceLabel = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

export async function SeoArticle({ page }: { page: SeoPage }) {
  const result = await getOfferCached();
  const offer = result.available ? result.offer : null;
  const ourPrice = offer
    ? `${fmtPrice(offer.currentPriceUsd)} today, one payment. It rises ${fmtPrice(offer.stepUsd)} after every ${offer.seatsPerStep} sales; the live price is on our pricing page`
    : "One payment; the live price is on our pricing page";
  const trail = [{ name: "Home", path: "/" }, ...(page.group === "blog" ? [{ name: "Guides", path: "/ai-visibility-tracker" }] : []), { name: page.h1, path: page.path }];
  const site = publicEnv.siteUrl;
  return (
    <PageShell>
      <JsonLd data={graph(organizationLd(), breadcrumbLd(trail), faqLd(page.faqs, `${site}${page.path}#faq`), {
        "@type": "Article", headline: page.h1, description: page.description, dateModified: page.updated, datePublished: page.published ?? page.updated,
        mainEntityOfPage: `${site}${page.path}`, author: { "@id": `${site}/#organization` }, publisher: { "@id": `${site}/#organization` },
      })} />
      <article className="container-page flex flex-col gap-12 pt-[clamp(48px,7vw,96px)] pb-[var(--rb-section-y)]">
        <header className="flex max-w-[820px] flex-col gap-5">
          <nav aria-label="Breadcrumb" className="text-[13px] text-dim">
            <Link href="/" className="text-dim no-underline hover:text-fg">Home</Link> <span aria-hidden>/</span> <span>{page.eyebrow}</span>
          </nav>
          <Eyebrow>{page.eyebrow}</Eyebrow>
          <h1 className="m-0 text-[clamp(34px,4.8vw,58px)] leading-[1.05] font-semibold tracking-[-0.04em] text-balance">{page.h1}</h1>
          <p className="text-lead m-0">{page.answer}</p>
          <div className="flex flex-wrap items-center gap-4">
            <CtaLink href="/#free-check" size="md">Run a free check</CtaLink>
            <Link href="/pricing" className="text-[15px] font-medium text-fg underline underline-offset-[3px]">See pricing</Link>
          </div>
          <p className="m-0 font-mono text-[12px] text-dim">Updated {new Date(page.updated).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}</p>
        </header>

        {page.showSampleGrid ? (
          <figure className="m-0 flex flex-col gap-3">
            <div className="overflow-hidden rounded-2xl border border-border bg-bg-alt p-[clamp(12px,2vw,24px)] pb-0"><AiGridMock /></div>
            <figcaption className="flex items-center gap-2 text-[13px] text-dim"><SampleTag /> What a local AI grid looks like. The business and the numbers are fictional.</figcaption>
          </figure>
        ) : null}

        {page.table ? (
          <section className="flex flex-col gap-4" aria-labelledby="compare">
            <h2 id="compare" className="m-0 text-[clamp(24px,3vw,34px)] leading-[1.1] font-semibold tracking-[-0.03em]">{page.table.caption}</h2>
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="w-full border-collapse text-left text-[14px]" style={{ minWidth: 200 + page.table.columns.length * 210 }}>
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-line px-4 py-3 text-[13px] font-medium text-dim"><span className="sr-only">Feature</span></th>
                    {page.table.columns.map((c) => <th key={c} scope="col" className={`border-b border-line px-4 py-3 text-[15px] font-semibold ${c === "rankbyai" ? "text-g1" : ""}`}>{VENDOR_NAME[c]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(page.table.rows ?? ROWS).map((row) => (
                    <tr key={row} className="border-b border-line align-top last:border-0">
                      <th scope="row" className="w-[200px] px-4 py-3 text-[14px] font-medium text-muted-foreground">{ROW_LABEL[row]}</th>
                      {page.table!.columns.map((c) => {
                        const cell = cellFor(c, row, ourPrice);
                        return (
                          <td key={c} className={`px-4 py-3 leading-normal ${cell.unknown ? "text-dim" : "text-fg-2"}`}>
                            {cell.text}
                            {cell.source ? (
                              <a href={cell.source} rel="nofollow noopener noreferrer" target="_blank" className="mt-1 block font-mono text-[11.5px] text-dim underline underline-offset-2 hover:text-fg">
                                {sourceLabel(cell.source)}
                              </a>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="m-0 max-w-[820px] text-[13px] leading-normal text-dim">
              Every cell about another tool was read on that vendor&apos;s own public page on {VERIFIED_ON}; the link under it is the page. Plans and prices change, so check the
              vendor&apos;s page before you decide. &ldquo;No mention found&rdquo; means the page we read says nothing about it; &ldquo;See their site&rdquo; means we hold no
              verified information and will not guess. We make RankbyAI.
            </p>
          </section>
        ) : null}

        <div className="flex max-w-[820px] flex-col gap-10">
          {page.sections.map((s) => (
            <section key={s.h2} className="flex flex-col gap-4">
              <h2 className="m-0 text-[clamp(22px,2.6vw,30px)] leading-[1.15] font-semibold tracking-[-0.02em]">{s.h2}</h2>
              {s.body.map((b, i) => typeof b === "string"
                ? <p key={i} className="m-0 text-[17px] leading-relaxed text-fg-2">{b}</p>
                : <ul key={i} className="m-0 flex list-disc flex-col gap-2 pl-5 text-[17px] leading-relaxed text-fg-2">{b.list.map((li) => <li key={li}>{li}</li>)}</ul>)}
            </section>
          ))}
        </div>

        <section className="flex max-w-[820px] flex-col gap-4" aria-labelledby="faq" id="faq">
          <h2 className="m-0 text-[clamp(22px,2.6vw,30px)] leading-[1.15] font-semibold tracking-[-0.02em]">Questions and answers</h2>
          <dl className="m-0 flex flex-col">
            {page.faqs.map((f) => (
              <div key={f.q} className="border-t border-line py-5 first:border-0 first:pt-0">
                <dt className="text-[18px] font-semibold">{f.q}</dt>
                <dd className="m-0 mt-2 text-[16px] leading-relaxed text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-[clamp(20px,3vw,36px)]">
          <h2 className="m-0 text-[clamp(22px,2.6vw,30px)] leading-[1.15] font-semibold tracking-[-0.02em]">See a real result before you decide</h2>
          <p className="m-0 max-w-[720px] text-[16px] leading-relaxed text-muted-foreground">
            The free check asks three AI assistants who they recommend at one business&apos;s own location, and looks up its Google Maps rank there. AI answers vary between runs, places and time.
          </p>
          <div><CtaLink href="/#free-check" size="md">Run a free check</CtaLink></div>
          <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
            {page.related.map((path) => {
              const target = seoPage(path);
              return <Link key={path} href={path} className="text-fg underline underline-offset-[3px]">{target ? target.h1 : path === "/pricing" ? "Pricing" : path}</Link>;
            })}
          </nav>
        </section>
      </article>
    </PageShell>
  );
}

export function seoMetadata(page: SeoPage) {
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: { title: page.h1, description: page.description, url: page.path, type: "article" as const },
    twitter: { card: "summary_large_image" as const, title: page.h1, description: page.description },
  };
}
