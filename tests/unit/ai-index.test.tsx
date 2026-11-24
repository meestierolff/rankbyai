import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CityRecord } from "@/components/ai-index/city-record";
import { Cities } from "@/components/ai-index/cities";
import { cities, publishedAt, INDEX_FAQS, INDEX_PATH, indexPublished, webUrl, type IndexCity } from "@/lib/ai-index/data";
import { citySchema, hubSchema, indexSitemapPaths } from "@/lib/ai-index/schema";
import { snapshotSchema } from "@/lib/ai-index/validate";
import { setIndexCheckSource, takeIndexCheckSource } from "@/lib/ai-index/check-source";

// Synthetic fixtures test rendering contracts; they are never shipped as snapshot records.
const city: IndexCity = { country: "us", city: "Example City", slug: "example-city", query: "best SEO agency in Example City", status: "parsed", reason: "", agencies: [{ position: 1, name: "Example agency", domain: "" }, { position: 2, name: "Second example", domain: "example.org" }], sources: ["https://example.org/source"] };
const unparsed: IndexCity = { ...city, country: "uk", city: "Unresolved City", slug: "unresolved-city", query: "best SEO agency in Unresolved City", status: "wrong_country", reason: "The answer was about another country.", agencies: [], sources: [] };

describe("SEO Agency AI Index", () => {
  it("fails closed for absent data and refuses a partial or invalid published dataset", () => {
    if (!cities.length) expect(indexPublished).toBe(false);
    expect(snapshotSchema.safeParse({ publishedAt: null, updatedAt: null, cities: [] }).success).toBe(true);
    expect(snapshotSchema.safeParse({ publishedAt: "2026-11-24", updatedAt: "2026-11-24", cities: [city] }).success).toBe(false);
    expect(snapshotSchema.safeParse({ publishedAt: null, updatedAt: null, cities: [{ ...unparsed, agencies: city.agencies }] }).success).toBe(false);
  });
  it("renders cities and parse reasons in initial HTML without JavaScript", () => {
    const html = renderToStaticMarkup(<Cities cities={[city, unparsed]} />);
    expect(html).toContain(`${INDEX_PATH}/us/example-city`);
    expect(html).toContain(`${INDEX_PATH}/uk/unresolved-city`);
    expect(html).toContain("Unparseable: The answer was about another country.");
    expect(html).toContain("Example agency");
  });
  it("retains order and empty domains, and never renders agencies from unparseable records", () => {
    const html = renderToStaticMarkup(<CityRecord city={city} />);
    expect(html.indexOf("Example agency")).toBeLessThan(html.indexOf("Second example"));
    expect(html).not.toContain('href="https://"');
    expect(html).toContain("https://example.org/");
    const unresolved = renderToStaticMarkup(<CityRecord city={{ ...unparsed, agencies: city.agencies }} />);
    expect(unresolved).toContain(unparsed.reason);
    expect(unresolved).not.toContain("Example agency");
    expect(unresolved).toContain("No cited sources were returned for this run.");
  });
  it("uses the identical FAQ text in schema and the visible FAQ data", () => {
    const schema = hubSchema()["@graph"] as Record<string, unknown>[];
    const faq = schema.find(node => node["@type"] === "FAQPage")!;
    expect(faq.mainEntity).toEqual(INDEX_FAQS.map(item => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })));
    const dataset = schema.find(node => node["@type"] === "Dataset")!;
    expect(dataset.temporalCoverage).toBe("2026-11-23/2026-11-23");
    expect(dataset).not.toHaveProperty("license");
    expect(dataset).not.toHaveProperty("distribution");
    if (!publishedAt) expect(schema[0]).not.toHaveProperty("datePublished");
  });
  it("outputs an ordered ItemList for parsed cities and none for unparseable cities", () => {
    const list = (citySchema(city)["@graph"] as Record<string, unknown>[]).find(node => node["@type"] === "ItemList");
    expect(list).toMatchObject({ numberOfItems: 2, itemListElement: [{ position: 1, name: "Example agency" }, { position: 2, name: "Second example", url: "https://example.org/" }] });
    expect((citySchema(unparsed)["@graph"] as Record<string, unknown>[]).some(node => node["@type"] === "ItemList")).toBe(false);
    expect(indexSitemapPaths([city, unparsed])).toEqual([INDEX_PATH, `${INDEX_PATH}/us/example-city`, `${INDEX_PATH}/uk/unresolved-city`]);
  });
  it("rejects unsafe URLs", () => {
    expect(webUrl("")).toBeUndefined();
    expect(webUrl("javascript:alert(1)")).toBeUndefined();
    expect(webUrl("data:text/html,example")).toBeUndefined();
    expect(webUrl("example.org")).toBe("https://example.org/");
  });
  it("hands the source page to a free check once, without URL parameters", () => {
    setIndexCheckSource(`${INDEX_PATH}/us/example-city`);
    expect(takeIndexCheckSource()).toBe(`${INDEX_PATH}/us/example-city`);
    expect(takeIndexCheckSource()).toBeUndefined();
    setIndexCheckSource("https://example.org/");
    expect(takeIndexCheckSource()).toBeUndefined();
  });
});
