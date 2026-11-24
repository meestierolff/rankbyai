import { COUNTRIES, ENTITY_LINE, INDEX_DESCRIPTION, INDEX_FAQS, INDEX_H1, INDEX_PATH, INDEX_URL, cityPath, publishedAt, updatedAt, webUrl, type IndexCity } from "./data";
import { faqLd, graph } from "@/lib/seo";

const site = "https://rankbyai.live";
const organization = { "@type": "Organization", name: "RankbyAI", url: site, email: "mees@rankbyai.live" };
const dates = () => ({ ...(publishedAt ? { datePublished: publishedAt } : {}), ...(updatedAt ? { dateModified: updatedAt } : {}) });
const breadcrumbs = (items: { name: string; url: string }[]) => ({ "@type": "BreadcrumbList", itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url })) });
export function hubSchema() {
  return graph(
    { "@type": "WebPage", name: INDEX_H1, url: INDEX_URL, description: INDEX_DESCRIPTION, isPartOf: { "@type": "WebSite", name: "RankbyAI", url: site }, inLanguage: "en", ...dates() },
    breadcrumbs([{ name: "Home", url: site }, { name: "SEO Agency AI Index", url: INDEX_URL }]),
    faqLd(INDEX_FAQS, `${INDEX_URL}#faq`),
    { "@type": "Dataset", name: "SEO Agency AI Index (23 November 2026)", description: "One ChatGPT run per city of the prompt “best SEO agency in {city}” for 387 cities in the US, UK, Australia and New Zealand, collected on 23 November 2026. A snapshot, not a ranking.", url: INDEX_URL, identifier: INDEX_URL, creator: organization, publisher: organization, temporalCoverage: "2026-11-23/2026-11-23", spatialCoverage: Object.values(COUNTRIES).map(name => ({ "@type": "Place", name })), isAccessibleForFree: true, variableMeasured: ["city", "country", "query", "agencies named (position, name, domain if given)", "cited sources"], measurementTechnique: "DataForSEO ChatGPT LLM Scraper, model gpt-6, one live run per city" },
  );
}
export function citySchema(city: IndexCity) {
  const url = `${site}${cityPath(city)}`;
  return graph(
    { "@type": "WebPage", name: `ChatGPT’s 23 November 2026 shortlist for “best SEO agency in ${city.city}”`, url, inLanguage: "en", isPartOf: { "@id": INDEX_URL }, ...dates() },
    breadcrumbs([{ name: "Home", url: site }, { name: "SEO Agency AI Index", url: INDEX_URL }, { name: COUNTRIES[city.country], url: `${INDEX_URL}#${city.country}` }, { name: city.city, url }]),
    ...(city.status === "parsed" ? [{ "@type": "ItemList", numberOfItems: city.agencies.length, itemListElement: city.agencies.map(agency => ({ "@type": "ListItem", position: agency.position, name: agency.name, ...(webUrl(agency.domain) ? { url: webUrl(agency.domain) } : {}) })) }] : []),
  );
}
export const indexLlmsEntry = `## SEO Agency AI Index\n${ENTITY_LINE}\nA snapshot, not a ranking. Method, city shortlists and corrections: ${INDEX_URL}\n`;
export const indexSitemapPaths = (rows: IndexCity[]) => [INDEX_PATH, ...rows.map(cityPath)];
