import { describe, expect, it } from "vitest";
import type { CitedUrl } from "@/lib/citations/inventory";
import { parseBacklinks, parseTraffic, type BacklinkPage } from "@/lib/providers/dataforseo";
import { actionFor, buildFilters, defaultTokens, estimateTargets, mergeTargets, targetDomain, targetsCsv, trafficOrder } from "@/lib/targets/plan";

/** Shapes as DataForSEO returned them on 23 Nov 2026 (addresses replaced by example domains). */
const RECORDED_BACKLINKS = {
  total_count: 1073,
  items: [
    { url_from: "https://www.toolreviews.example/blog/best-local-seo-tools/", domain_from: "www.toolreviews.example", page_from_title: "11 Best Local SEO Tools", page_from_rank: 209, domain_from_rank: 640, dofollow: true, first_seen: "2025-03-01 10:00:00 +00:00", last_seen: "2026-11-20 08:00:00 +00:00", url_to: "https://competitor.example/" },
    { url_from: "https://agency.example/blog/top-10-local-ranking-factors", domain_from: "agency.example", page_from_title: null, page_from_rank: 166, domain_from_rank: 300, dofollow: false, url_to: "https://competitor.example/blog" },
    { url_from: "not a url", page_from_rank: 1 },
  ],
};
const RECORDED_TRAFFIC = { items: [
  { target: "https://www.toolreviews.example/blog/best-local-seo-tools/", metrics: { organic: { etv: 8.129403429105878, count: 12 } } },
  { target: "https://agency.example/blog/top-10-local-ranking-factors", metrics: { organic: { etv: 0, count: 0 } } },
  { target: "https://none.example/x", metrics: null },
] };

describe("DataForSEO responses (recorded shapes)", () => {
  it("parses backlink pages and skips rows without a page address", () => {
    const r = parseBacklinks(RECORDED_BACKLINKS);
    expect(r.total).toBe(1073);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ url: "https://www.toolreviews.example/blog/best-local-seo-tools/", domain: "toolreviews.example", title: "11 Best Local SEO Tools", pageRank: 209, dofollow: true });
    expect(r.items[1].title).toBeNull();
  });
  it("parses traffic per page, null where DataForSEO gave no figure", () => {
    const t = parseTraffic(RECORDED_TRAFFIC);
    expect(t.get("https://www.toolreviews.example/blog/best-local-seo-tools/")).toBeCloseTo(8.13, 2);
    expect(t.get("https://agency.example/blog/top-10-local-ranking-factors")).toBe(0);
    expect(t.get("https://none.example/x")).toBeNull();
  });
});

describe("filter and estimate", () => {
  it("normalises competitor websites without guessing", () => {
    expect(targetDomain("https://www.LocalFalcon.com/pricing")).toBe("localfalcon.com");
    expect(targetDomain("localfalcon.com")).toBe("localfalcon.com");
    expect(targetDomain("Local Falcon")).toBeNull();
    expect(targetDomain("")).toBeNull();
  });
  it("uses best/top/review, plus the city and near-me only for a local business", () => {
    expect(defaultTokens("online", "Austin")).toEqual(["best", "top-", "review"]);
    expect(defaultTokens("local", "San José")).toEqual(["best", "top-", "review", "san-jose", "near-me"]);
  });
  it("builds DataForSEO's filter with at most 8 conditions joined by or", () => {
    expect(buildFilters(["best", "top-", "review"])).toEqual([["url_from", "ilike", "%best%"], "or", ["url_from", "ilike", "%top-%"], "or", ["url_from", "ilike", "%review%"]]);
    const withDirs = buildFilters(["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"], { directories: true });
    const conds = withDirs.filter((x) => x !== "or");
    expect(conds).toHaveLength(8);
    expect(conds[7]).toEqual(["domain_from", "in", expect.arrayContaining(["yelp.com"])]);
    expect(buildFilters(["50%_*off"])).toEqual([["url_from", "ilike", "%50off%"]]);
  });
  it("prices an upper bound from the published rates: 3 competitors + the business × 200 rows, 400 traffic pages", () => {
    const e = estimateTargets({ competitors: [{ name: "A", domain: "a.example" }, { name: null, domain: "b.example" }, { name: "C", domain: "c.example" }], clientDomain: "me.example", rows: 200, trafficCap: 400 });
    expect(e.calls).toBe(5);
    expect(e.lines[0]).toEqual({ provider: "dataforseo", label: "Backlinks of a.example: list pages, up to 200 rows", usd: expect.closeTo(0.0312, 6) });
    expect(e.lines[4].usd).toBeCloseTo(0.06, 6);
    expect(e.totalUsd).toBeCloseTo(0.1848, 6);
    expect(e.upTo).toBe(true);
  });
});

const page = (url: string, rank: number, title: string | null = null): BacklinkPage => ({ url, domain: new URL(url).hostname.replace(/^www\./, ""), title, pageRank: rank, domainRank: null, dofollow: true, firstSeen: null, lastSeen: null, urlTo: null });
const cited = (url: string, over: Partial<CitedUrl> = {}): CitedUrl => ({
  url, key: url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), domain: new URL(url).hostname.replace(/^www\./, ""), title: null, page_type: "listicle", type_confidence: "medium", type_why: "",
  answers: 3, answers_naming_client: 0, answers_naming_only_others: 3, engines: ["openai", "perplexity"], prompts: [0], first_seen: "2026-11-01T00:00:00Z", last_seen: "2026-11-20T00:00:00Z",
  disappeared_on: null, runs_cited: 2, page_check: null, missing: { basis: "answers", client_absent: true, competitors_present: ["Smile Haus"] }, ...over,
});

describe("merging competitors' list pages with the cited pages", () => {
  const A = { name: "Smile Haus", domain: "smilehaus.example" };
  const B = { name: null, domain: "enamel.example" };
  const input = {
    backlinks: [
      { competitor: A, pages: [page("https://guide.example/best-dentists/", 300, "The 10 Best Dentists"), page("https://www.yelp.com/biz/x", 400), page("https://reviews.example/top-10", 100)] },
      { competitor: B, pages: [page("https://guide.example/best-dentists", 250), page("https://smilehaus.example/blog/best-tips", 90)] },
    ],
    clientKeys: new Set(["reviews.example/top-10"]),
    citations: [cited("https://cited.example/best-austin-dentists"), cited("https://guide.example/best-dentists"), cited("https://maps.google.com/?cid=1", { page_type: "maps_listing" }), cited("https://named.example/best", { missing: { basis: "answers", client_absent: false, competitors_present: [] } })],
    ctx: { clientDomain: "northgate.example", competitorDomains: { "smilehaus.example": "Smile Haus", "enamel.example": "enamel.example" } },
  };

  it("lists each page once, with every competitor it links to, cited pages first, then by estimated traffic", () => {
    const etv = new Map<string, number | null>([["guide.example/best-dentists", 900], ["cited.example/best-austin-dentists", 50], ["reviews.example/top-10", 5000]]);
    const rows = mergeTargets({ ...input, etv });
    // Both cited pages have 3 answers, so traffic decides between them; uncited pages follow, by traffic, then DataForSEO rank.
    expect(rows.map((r) => r.key)).toEqual(["guide.example/best-dentists", "cited.example/best-austin-dentists", "reviews.example/top-10", "yelp.com/biz/x", "smilehaus.example/blog/best-tips"]);
    const guide = rows.find((r) => r.key === "guide.example/best-dentists")!;
    expect(guide).toMatchObject({ competitors_linked: ["Smile Haus", "enamel.example"], source: "both", etv: 900, page_rank: 300, title: "The 10 Best Dentists", action: "pitch", client_linked: false });
    expect(guide.cited).toMatchObject({ answers: 3 });
    expect(rows.find((r) => r.key === "cited.example/best-austin-dentists")).toMatchObject({ source: "citations", competitors_linked: [], action: "pitch" });
  });

  it("never adds a cited page the business is already named on, or a Maps listing", () => {
    const keys = mergeTargets({ ...input, etv: new Map() }).map((r) => r.key);
    expect(keys).not.toContain("named.example/best");
    expect(keys).not.toContain("maps.google.com?cid=1");
  });

  it("skips pages that already link to the business and competitors' own sites; directories are claimed", () => {
    const rows = mergeTargets({ ...input, etv: new Map() });
    expect(rows.find((r) => r.key === "reviews.example/top-10")).toMatchObject({ client_linked: true, action: "skip" });
    expect(rows.find((r) => r.key === "smilehaus.example/blog/best-tips")).toMatchObject({ page_type: "official_site", action: "skip" });
    expect(rows.find((r) => r.key === "yelp.com/biz/x")).toMatchObject({ page_type: "directory", action: "directory_claim" });
  });

  it("asks for traffic on cited pages first, then by DataForSEO rank", () => {
    expect(trafficOrder(input).map((o) => o.key).slice(0, 3)).toEqual(["cited.example/best-austin-dentists", "guide.example/best-dentists", "yelp.com/biz/x"]);
  });

  it("has a reason for every action", () => {
    expect(actionFor({ page_type: "forum", client_linked: false, client_named_on_page: null, competitors_linked: ["A"], cited: null }).action).toBe("skip");
    expect(actionFor({ page_type: "listicle", client_linked: null, client_named_on_page: true, competitors_linked: ["A"], cited: null })).toEqual({ action: "skip", reason: "Already links to or names the business." });
  });

  it("exports CSV with spreadsheet formulas neutralised", () => {
    const rows = mergeTargets({ ...input, etv: new Map() });
    rows[0].title = "=HYPERLINK(\"x\")";
    const csv = targetsCsv(rows);
    expect(csv.split("\r\n")[0]).toContain("estimated_traffic_dataforseo_etv");
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
  });
});
