import { findings, coverage, coverageLine, stats } from "@/lib/ai-index/findings";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { PageShell } from "@/components/marketing/page-shell";
import { Cities } from "@/components/ai-index/cities";
import { Correction, IndexCta } from "@/components/ai-index/shared";
import { cities, cityPath, ENTITY_LINE, INDEX_DESCRIPTION, INDEX_FAQS, INDEX_H1, INDEX_TITLE, INDEX_URL, indexPublished, indexReady, OPENING } from "@/lib/ai-index/data";
import { hubSchema } from "@/lib/ai-index/schema";
import "@/components/ai-index/index.css";

export const metadata: Metadata = {
  title: { absolute: INDEX_TITLE }, description: INDEX_DESCRIPTION,
  alternates: { canonical: INDEX_URL }, robots: { index: indexPublished, follow: true },
  openGraph: { title: INDEX_TITLE, description: INDEX_DESCRIPTION, url: INDEX_URL },
};
export default function SeoAgencyIndexPage() {
  const examples = ["denver", "london", "sydney", "auckland"].map(slug => cities.find(city => city.slug === slug)).filter(city => city !== undefined);
  return <PageShell hideAiIndexLink>
    {indexReady ? <JsonLd data={hubSchema()} /> : null}
    <article className="ai-index">
      <header>
        <nav aria-label="Breadcrumb" className="index-note"><Link href="/">Home</Link> / SEO Agency AI Index</nav>
        <p className="index-eyebrow">Research · 23 November 2026 · ChatGPT</p>
        <h1>{INDEX_H1}</h1><p className="index-opening">{OPENING}</p><p>We make RankbyAI.</p>
        {!indexPublished ? <aside className="index-warning"><strong>Draft preview — not published.</strong><p>{indexReady ? "The complete 23 November dataset is loaded. Search indexing and discovery links remain off pending publication approval." : "This preview uses the summary supplied for the 23 November snapshot. City-by-city records are not available yet."}</p></aside> : null}
        <p className="index-note">{ENTITY_LINE}</p>
      </header>
      <nav className="index-jumps" aria-label="On this page"><a href="#methodology">Methodology</a><a href="#findings">Findings</a><a href="#cities">Cities</a><a href="#corrections">Request a correction</a><a href="#free-check">Run a free check</a></nav>
      <section id="methodology"><h2>How this snapshot was collected</h2>
        <ul><li>Prompt: <code>best SEO agency in {"{city}"}</code>.</li><li>Model: <code>gpt-6</code>, collected using the DataForSEO ChatGPT LLM Scraper. DataForSEO does not endorse this index.</li><li>Collection window: 23 November 2026, 11:21–12:55 CET (Europe/Amsterdam).</li><li>One run per city. {coverageLine}.</li><li>City coverage comes from the outreach lead list, rather than a census of cities.</li><li>We counted the numbered shortlist in {stats.parseMethods.numbered_list} parsed answers and the bullet shortlist for Alexandria, US. Opening previews, follow-up questions and map cards were excluded. Names and recorded positions retain their order, including gaps.</li><li>Domains were captured when supplied by the answer or a name-matching link. A blank domain means no website was captured, rather than that the agency has no website.</li><li>Sources come from DataForSEO’s returned source lists. Denver, Cardiff and Sydney have no captured source list.</li><li>Ambiguous, clarifying, wrong-country and multiple-list answers are marked unparseable. We do not guess or show a shortlist for those answers.</li></ul>
        <p>A citation is a source listed on that answer, not proof of why an agency was named. Answers vary between runs. This is a snapshot, not a ranking.</p><p>We make RankbyAI. This index is separate from the scan-built service-niche pages under <code>/ai/</code>, which use repeated scans and a minimum sample threshold.</p>
      </section>
      <section id="findings"><h2>What the {stats.total} answers show</h2><p>These figures describe one ChatGPT run per city on 23 November 2026.</p><div className="index-table-scroll" role="region" aria-label="Snapshot findings" tabIndex={0}><table className="index-facts"><caption>23 November 2026 snapshot · Denominators shown for each count</caption><tbody>{findings.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody></table></div></section>
      <section id="cities"><h2>Cities</h2><p>{coverageLine}. Each city page records one answer from 23 November 2026.</p>
        <div className="index-table-scroll"><table><caption>Coverage in the 23 November snapshot</caption><thead><tr><th scope="col">Country</th><th scope="col">Cities</th><th scope="col">Parsed</th><th scope="col">Unparseable</th></tr></thead><tbody>{coverage.map(country => <tr key={country.code}><th scope="row">{country.name}</th><td>{country.total}</td><td>{country.parsed}</td><td>{country.total-country.parsed}</td></tr>)}</tbody></table></div>
        {indexReady ? <Cities cities={cities} /> : <p className="index-warning">City-by-city records are not published yet. The summary above describes the 23 November snapshot.</p>}
        {examples.length ? <p>Example city records: {examples.map((city, i) => <span key={cityPath(city)}>{i ? " · " : ""}<Link href={cityPath(city)}>{city.city}</Link></span>)}</p> : null}
      </section>
      <Correction /><IndexCta />
      <section id="faq"><h2>Questions about this snapshot</h2>{INDEX_FAQS.map(faq => <details key={faq.q}><summary>{faq.q}</summary><p>{faq.a}</p></details>)}</section>
      <p className="index-note">Dataset: SEO Agency AI Index (23 November 2026). <a href="#methodology">Collection method</a> and correction policy above.</p>
    </article>
  </PageShell>;
}
