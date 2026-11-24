import { execFileSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { cities, findCity, indexPublished, INDEX_FAQS } from "@/lib/ai-index/data";
import { stats } from "@/lib/ai-index/findings";
import { CityRecord } from "@/components/ai-index/city-record";
import { Cities } from "@/components/ai-index/cities";
import { citySchema, hubSchema } from "@/lib/ai-index/schema";

type CsvRow = Record<string, string>;
const csvRows: CsvRow[] = JSON.parse(execFileSync("python3", ["-c", 'import csv,json; print(json.dumps(list(csv.DictReader(open("data/ai-index/index-2026-11.csv", encoding="utf-8")))))'], { encoding: "utf8" }));
const recomputed = JSON.parse(execFileSync("python3", ["-c", 'import runpy,json,pathlib; m=runpy.run_path("scripts/import-ai-index.py"); print(json.dumps(m["aggregate"](m["import_rows"](pathlib.Path("data/ai-index/index-2026-11.csv")))))'], { encoding: "utf8" }));

describe("real 23 November source CSV", () => {
  it("matches all source counts and precomputed aggregates using the original normalisation", () => {
    expect(csvRows).toHaveLength(387);
    expect(csvRows.filter(r => r.parse_status === "parsed")).toHaveLength(336);
    expect(csvRows.filter(r => r.parse_status === "unparseable")).toHaveLength(51);
    expect(recomputed).toEqual(stats);
    expect(stats).toMatchObject({ mentions: 1610, uniqueNames: 1387, singleCity: 1236, multiCity: 151, fiveCities: 5, tenCities: 0, mean: 4.79, median: 5, min: 1, max: 7, fiveNames: 213, withSources: 325, anyDirectory: 211, australianLists: 28, withoutAgencyDomain: 227, directories: { Clutch: 146, "Expertise.com": 100, "The Manifest": 83, UpCity: 0 } });
    expect(stats.countries).toEqual({ us: { total: 273, parsed: 224, directories: 182 }, uk: { total: 53, parsed: 52, directories: 21 }, au: { total: 54, parsed: 54, directories: 4 }, nz: { total: 7, parsed: 6, directories: 4 } });
    expect(stats.reasons).toEqual({ ambiguous_city_unresolved: 15, clarifying_question_no_agencies: 15, wrong_country: 14, ambiguous_multiple_cities: 7 });
  });
  it("preserves all source records, positions, blank domains, citations, timestamps and model", () => {
    expect(cities).toHaveLength(387);
    expect(new Set(cities.map(c => `${c.country}/${c.slug}`)).size).toBe(387);
    for (const row of csvRows) {
      const city = cities.find(c => c.country === row.country.toLowerCase() && c.city === row.city)!;
      expect(city).toBeDefined();
      expect(city.agencies).toEqual(JSON.parse(row.agencies_json));
      expect(city.sources).toEqual(JSON.parse(row.sources_json).map((s: {url: string}) => s.url));
      expect(city.sourceDetails).toEqual(JSON.parse(row.sources_json));
      expect(city).toMatchObject({ model: row.model, collectedUtc: row.datetime_collected_utc, collectedAmsterdam: row.datetime_collected_europe_amsterdam, query: row.query, parseNotes: row.parse_notes });
      const nodes = citySchema(city)["@graph"] as Record<string,unknown>[];
      const list = nodes.find(n => n["@type"] === "ItemList");
      if (row.parse_status === "parsed") expect(list).toMatchObject({ numberOfItems: Number(row.n_agencies), itemListElement: city.agencies.map(a => ({position:a.position,name:a.name})) });
      else { expect(city.agencies).toEqual([]); expect(list).toBeUndefined(); expect(city.reason).not.toContain("_"); }
    }
    expect(findCity("us", "fairfax")?.agencies.map(a => a.position)).toEqual([2,3,4,5]);
  });
  it("renders 387 city links and the real unparseable explanations in raw HTML", () => {
    const html = renderToStaticMarkup(<Cities cities={cities} />);
    expect((html.match(/href="\/ai-index\/seo-agencies\//g) || [])).toHaveLength(387);
    for (const slug of ["dublin", "springfield"]) {
      const city = findCity("us",slug)!;
      const record = renderToStaticMarkup(<CityRecord city={city} />);
      expect(record).toContain(city.reason);
      expect(record).not.toContain('class="index-shortlist"');
    }
  });
  it("keeps visible FAQ and schema text identical with real data", () => {
    const faq = (hubSchema()["@graph"] as Record<string,unknown>[]).find(n=>n["@type"]==="FAQPage")!;
    expect(faq.mainEntity).toEqual(INDEX_FAQS.map(f => ({"@type":"Question",name:f.q,acceptedAnswer:{"@type":"Answer",text:f.a}})));
  });
  it("defaults to a private preview and enables every discovery consumer through one flag", async () => {
    expect(indexPublished).toBe(false);
    vi.stubEnv("AI_INDEX_PUBLIC","true"); vi.resetModules();
    expect((await import("@/lib/ai-index/data")).indexPublished).toBe(true);
    vi.stubEnv("AI_INDEX_PUBLIC","false"); vi.resetModules();
    expect((await import("@/lib/ai-index/data")).indexPublished).toBe(false);
    vi.unstubAllEnvs(); vi.resetModules();
  });
});
