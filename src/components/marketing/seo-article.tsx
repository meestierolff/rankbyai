import { packsOpen } from "@/lib/availability";
import { AuditSample } from "./audit-sample";
import { AuditPrice } from "./audit-price";
import { OfferProvider } from "./offer-context";
import { IndexResearchLink } from "@/components/ai-index/shared";
import Link from "next/link";
import Image from "next/image";
import { JsonLd } from "@/components/json-ld";
import { CtaLink, Eyebrow, SampleTag } from "@/components/brand/primitives";
import { AiGridMock } from "@/components/marketing/feature-mocks";
import { PageShell } from "@/components/marketing/page-shell";
import { cellFor, OUR_LIVE_PRICE, ROW_LABEL, ROWS, VENDOR_NAME, VERIFIED_ON, type DatedCell, type FactTable } from "@/lib/competitors";
import { legalEnv } from "@/lib/env";
import { fmtPrice, type Offer } from "@/lib/ladder";
import { getOfferCached } from "@/lib/offer";
import { breadcrumbLd, faqLd, graph, organizationLd, softwareLd, websiteLd } from "@/lib/seo";
import { publicEnv } from "@/lib/env-public";
import { seoPage, type Block, type Inline, type SeoPage } from "@/lib/seo-pages";

/** "https://www.brightlocal.com/pricing/" → "brightlocal.com/pricing" (the visible source label). */
const sourceLabel = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

export async function SeoArticle({ page }: { page: SeoPage }) {
  // Guides without a price table do not depend on the short-lived live offer.
  const result = page.table || page.factTable || page.showSampleAudit ? await getOfferCached() : null;
  const offer = result?.available ? result.offer : null;
  const ourPrice = offer
    ? `${fmtPrice(offer.currentPriceUsd)} today, one payment. It rises ${fmtPrice(offer.stepUsd)} after every ${offer.seatsPerStep} sales; the live price is on our pricing page`
    : "One payment; the live price is on our pricing page";
  const trail = [{ name: "Home", path: "/" }, ...(page.group === "blog" ? [{ name: "Guides", path: "/ai-visibility-tracker" }] : []), { name: page.showSampleAudit ? "Local SEO audit" : page.h1, path: page.path }];
  const site = publicEnv.siteUrl;
  const pageLd = page.schemaType === "WebPage"
    ? {
        "@type": "WebPage", "@id": `${site}${page.path}`, url: `${site}${page.path}`, name: page.h1, description: page.description,
        dateModified: page.updated, datePublished: page.published ?? page.updated, isPartOf: { "@id": `${site}/#website` }, publisher: { "@id": `${site}/#organization` },
      }
    : {
        "@type": "Article", headline: page.h1, description: page.description, dateModified: page.updated, datePublished: page.published ?? page.updated,
        mainEntityOfPage: `${site}${page.path}`, author: { "@id": `${site}/#organization` }, publisher: { "@id": `${site}/#organization` },
      };
  return (
    <PageShell>
      <JsonLd data={graph(organizationLd(), ...(page.schemaType === "WebPage" ? [websiteLd()] : []), breadcrumbLd(trail), faqLd(page.faqs, `${site}${page.path}#faq`), ...(page.showSampleAudit ? [softwareLd(offer)] : []), pageLd)} />
      <article className="container-page flex flex-col gap-12 pt-[clamp(48px,7vw,96px)] pb-[var(--rb-section-y)]">
        <header className="flex max-w-[820px] flex-col gap-5">
          <nav aria-label="Breadcrumb" className="text-[13px] text-dim">
            <Link href="/" className="text-dim no-underline hover:text-fg">Home</Link> <span aria-hidden>/</span> <span>{page.eyebrow}</span>
          </nav>
          <Eyebrow>{page.eyebrow}</Eyebrow>
          <h1 className="m-0 text-[clamp(34px,4.8vw,58px)] leading-[1.05] font-semibold tracking-[-0.04em] text-balance">{page.h1}</h1>
          {page.showSampleAudit ? <AuditSample /> : null}
          <p className="text-lead m-0">{page.answer}</p>
          {page.resultPreview ? (
            <figure className="m-0 flex flex-col gap-3">
              <Image src={page.resultPreview.src} alt={page.resultPreview.alt} width={page.resultPreview.width} height={page.resultPreview.height} sizes="(max-width: 868px) calc(100vw - 48px), 820px" preload className="h-auto w-full rounded-2xl border border-border" />
              <figcaption className="text-[13px] leading-normal text-dim">{page.resultPreview.caption}</figcaption>
            </figure>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            <CtaLink href="/#free-check" size="md" arrow={!page.ctaLabel} className={page.ctaLabel ? "h-auto max-w-full whitespace-normal text-left" : undefined}>{page.ctaLabel ?? "Run a free check"}</CtaLink>
            {!page.showSampleAudit ? <Link href="/pricing" className="text-[15px] font-medium text-fg underline underline-offset-[3px]">See pricing</Link> : null}
          </div>
          {page.ctaNote ? <p className="-mt-2 mb-0 max-w-[640px] text-[14px] leading-normal text-muted-foreground">{page.ctaNote}</p> : null}
          <p className="m-0 font-mono text-[12px] text-dim">Updated {new Date(page.updated).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}</p>
          {["/ai-visibility-tracker", "/local-seo-software"].includes(page.path) ? <IndexResearchLink label={page.path === "/ai-visibility-tracker" ? "a snapshot of ChatGPT’s SEO agency shortlists, 23 Nov 2026" : "SEO Agency AI Index"} /> : null}
          {page.entity ? <p className="m-0 max-w-[820px] text-[13.5px] leading-normal text-dim">{page.entity(legalEnv.entityName().trim())}</p> : null}
        </header>

        {page.showSampleGrid ? (
          <figure className="m-0 flex flex-col gap-3">
            <div className="overflow-hidden rounded-2xl border border-border bg-bg-alt p-[clamp(12px,2vw,24px)] pb-0"><AiGridMock /></div>
            <figcaption className="flex items-center gap-2 text-[13px] text-dim"><SampleTag /> What a local AI grid looks like. The business and the numbers are fictional.</figcaption>
          </figure>
        ) : null}

        {page.factTable ? (
          <section className="flex flex-col gap-4" aria-labelledby="compare">
            <FactTableView table={page.factTable} offer={offer} />
            {page.afterTable?.map((b, i) => <BlockView key={i} block={b} />)}
          </section>
        ) : page.table ? (
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
            {page.afterTable?.map((b, i) => <BlockView key={i} block={b} />)}
          </section>
        ) : null}

        <div className="flex max-w-[820px] flex-col gap-10">
          {page.sections.map((s) => (
            <section key={s.h2} className="flex flex-col gap-4">
              <h2 id={s.id ?? s.h2.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")} className="m-0 scroll-mt-24 text-[clamp(22px,2.6vw,30px)] leading-[1.15] font-semibold tracking-[-0.02em]">{s.h2}</h2>
              {s.body.map((b, i) => <BlockView key={i} block={b} />)}
              {page.showSampleAudit && s.id === "local-audit-cost" ? <>
                <OfferProvider initial={result?.available ? { ...result.offer, paidTotal: result.paidTotal } : null}><AuditPrice /></OfferProvider>
                <p className="m-0 text-[17px] leading-relaxed text-fg-2">{packsOpen() ? "Included-scan packs are also available if you prefer to use our keys." : "Included-scan packs are not on sale yet; bring your own DataForSEO account and AI keys."}</p>
                <Link href="/pricing" className="text-fg underline underline-offset-4">See pricing and scan costs</Link>
              </> : null}
            </section>
          ))}
        </div>

        <section className="flex max-w-[820px] flex-col gap-4" aria-labelledby="faq" id="faq">
          <h2 id="questions-and-answers" className="m-0 text-[clamp(22px,2.6vw,30px)] leading-[1.15] font-semibold tracking-[-0.02em]">Questions and answers</h2>
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
          {!page.ctaLabel ? <div><CtaLink href="/#free-check" size="md">Run a free check</CtaLink></div> : null}
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

const linkClass = "text-fg underline underline-offset-[3px] hover:text-fg-2";

/** Running text with links: pages on this site through next/link, vendor pages in a new tab without a referrer. */
function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === "string") return <span key={i}>{part}</span>;
        return part.href.startsWith("/")
          ? <Link key={i} href={part.href} className={linkClass}>{part.text}</Link>
          : <a key={i} href={part.href} rel="nofollow noopener noreferrer" target="_blank" className={linkClass}>{part.text}</a>;
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (typeof block === "string") return <p className="m-0 text-[17px] leading-relaxed text-fg-2">{block}</p>;
  if ("p" in block) return <p className="m-0 text-[17px] leading-relaxed text-fg-2"><InlineText parts={block.p} /></p>;
  if ("code" in block) return <pre className="m-0 overflow-x-auto rounded-xl border border-border bg-surface p-4 text-[13px] leading-relaxed text-fg"><code>{block.code}</code></pre>;
  if ("table" in block) return (
    <div role="region" aria-label={block.table.caption} tabIndex={0} className="overflow-x-auto rounded-2xl border border-border bg-surface focus-visible:outline-2 focus-visible:outline-offset-4">
      <table className="w-full min-w-[700px] border-collapse text-left text-[14px] leading-relaxed text-fg-2">
        <caption className="border-b border-line px-4 py-3 text-left font-medium text-fg">{block.table.caption}</caption>
        <thead><tr>{block.table.columns.map((column) => <th key={column} scope="col" className="border-b border-line px-4 py-3 font-semibold text-fg">{column}</th>)}</tr></thead>
        <tbody>{block.table.rows.map((row, i) => <tr key={i} className="border-b border-line align-top last:border-0">{row.map((parts, j) => j === 0
          ? <th key={j} scope="row" className="px-4 py-3 font-medium text-fg"><InlineText parts={parts} /></th>
          : <td key={j} className="px-4 py-3"><InlineText parts={parts} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  return <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-[17px] leading-relaxed text-fg-2">{block.list.map((li) => <li key={li}>{li}</li>)}</ul>;
}

/**
 * RankbyAI's price cell, from the live offer at render time. When the offer cannot be loaded the cell
 * shows no price at all (only a pointer to the pricing page): never a remembered or default figure.
 */
export function ourPriceCell(offer: Offer | null): DatedCell | null {
  if (!offer) return null;
  if (!offer.open) return { text: "The lifetime deal has closed", unknown: true };
  return { text: `${fmtPrice(offer.currentPriceUsd)} once, while the lifetime deal is open (live price)` };
}

/** A dated two-vendor table (lib/competitors.ts): every vendor cell links the page(s) it was read on. */
export function FactTableView({ table, offer }: { table: FactTable; offer: Offer | null }) {
  const live = ourPriceCell(offer);
  return (
    <>
      <h2 id="compare" className="m-0 text-[clamp(24px,3vw,34px)] leading-[1.1] font-semibold tracking-[-0.03em]">{table.caption}</h2>
      <p className="m-0 font-mono text-[12px] text-dim">Vendor figures checked {table.checkedOn}</p>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full border-collapse text-left text-[14px]" style={{ minWidth: 200 + table.columns.length * 210 }}>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line px-4 py-3 text-[13px] font-medium text-dim"><span className="sr-only">Feature</span></th>
              {table.columns.map((c) => <th key={c.name} scope="col" className={`border-b border-line px-4 py-3 text-[15px] font-semibold ${c.ours ? "text-g1" : ""}`}>{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.label} className="border-b border-line align-top last:border-0">
                <th scope="row" className="w-[200px] px-4 py-3 text-[14px] font-medium text-muted-foreground">{row.label}</th>
                {row.cells.map((raw, i) => {
                  if (raw === OUR_LIVE_PRICE && !live) {
                    return <td key={i} className="px-4 py-3 leading-normal text-dim"><Link href="/pricing" className="underline underline-offset-2 hover:text-fg">See pricing</Link></td>;
                  }
                  const cell = raw === OUR_LIVE_PRICE ? live! : raw;
                  return (
                    <td key={i} className={`px-4 py-3 leading-normal ${cell.unknown ? "text-dim" : "text-fg-2"}`}>
                      {cell.text}
                      {cell.readOn ? <span className="ml-1 font-mono text-[11.5px] text-dim">({cell.readOn})</span> : null}
                      {cell.sources?.map((src) => (
                        <a key={src} href={src} rel="nofollow noopener noreferrer" target="_blank" className="mt-1 block font-mono text-[11.5px] text-dim underline underline-offset-2 hover:text-fg">
                          {sourceLabel(src)}
                        </a>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 max-w-[820px] text-[13px] leading-normal text-dim">{table.footnote}</p>
    </>
  );
}

export function seoMetadata(page: SeoPage) {
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: { title: page.socialTitle ?? page.h1, description: page.description, url: page.path, type: "article" as const },
    twitter: { card: "summary_large_image" as const, title: page.socialTitle ?? page.h1, description: page.description },
  };
}
