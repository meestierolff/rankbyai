import { describe, expect, it } from "vitest";
import { classifyPage, normalizeUrl } from "@/lib/citations/classify";
import { buildInventory, businessNameOrNull, packResults, PAGE_DISAGREES, PAGE_INCONCLUSIVE, topCompetitors, type InvRun, type InvSample, type PageCheck } from "@/lib/citations/inventory";
import type { Estimate } from "@/lib/cost-guard";
import { packEstimate } from "@/lib/packs/estimate";
import { isPackRun, NOT_PACK_RUN, packLabel, parsePackLabel } from "@/lib/packs/label";
import { suggestBuyerPrompts, validatePackPrompt, validatePackPrompts } from "@/lib/packs/prompts";
import { isSideRun } from "@/lib/scans/consistency";

const RUN = "0f8b7c3e-1111-4222-8333-944455556666";

describe("pack labels", () => {
  it("round-trips and marks pack scans as side runs", () => {
    const l = packLabel(RUN, 3, 2);
    expect(l).toBe(`pack:${RUN}:3:2`);
    expect(parsePackLabel(l)).toEqual({ run: RUN, prompt: 3, repeat: 2 });
    expect(isPackRun(l)).toBe(true);
    expect(isSideRun(l)).toBe(true);
    expect(isSideRun(null)).toBe(false);
    expect(parsePackLabel("consistency:x:A1")).toBeNull();
  });
  it("filters in the query, null-safe", () => {
    expect(NOT_PACK_RUN).toContain("label.is.null");
  });
});

describe("pack prompts", () => {
  it("accepts plain buyer prompts that run_ai_scan's template rule would refuse", () => {
    expect(validatePackPrompt("Who is the best dentist near me?")).toBeNull();
    expect(validatePackPrompt("Is Smile Haus a good dentist, or is there a better option?")).toBeNull();
    expect(validatePackPrompt("Best {service} in {city}")).toBeNull();
  });
  it("refuses short prompts, unknown placeholders, duplicates and too many", () => {
    expect(validatePackPrompt("best?")).toMatch(/at least/);
    expect(validatePackPrompt("Best {category} near {place}")).toMatch(/Unknown placeholder \{category\}/);
    expect(validatePackPrompts(["Who is the best dentist?", "who is the best  dentist?"])).toEqual({ error: expect.stringMatching(/repeats an earlier/) });
    expect(validatePackPrompts(Array.from({ length: 16 }, (_, i) => `Best dentist number ${i}`))).toEqual({ error: expect.stringMatching(/at most 15/) });
    expect(validatePackPrompts([])).toEqual({ error: "Add at least one prompt." });
  });
  it("suggests about ten distinct prompts from stored fields only", () => {
    const s = suggestBuyerPrompts({ service: "dentist", city: "Austin", neighbourhood: "Zilker", category: "Cosmetic dentist", competitors: ["Smile Haus", "smile haus", "Enamel Dentistry"] });
    const texts = s.map((x) => x.text);
    expect(texts).toContain("Who is the best dentist in Austin?");
    expect(texts).toContain("Who is the best dentist near me?");
    expect(texts).toContain("Best dentist near Zilker, Austin");
    expect(texts).toContain("Who is the best Cosmetic dentist in Austin?");
    expect(texts.filter((t) => t.startsWith("Is "))).toEqual([
      "Is Smile Haus a good dentist in Austin, or is there a better option?",
      "Is Enamel Dentistry a good dentist in Austin, or is there a better option?",
    ]);
    expect(s.length).toBeGreaterThanOrEqual(8);
    expect(s.length).toBeLessThanOrEqual(12);
    expect(new Set(texts).size).toBe(texts.length);
  });
  it("invents no competitor and no city", () => {
    const s = suggestBuyerPrompts({ service: "plumber" });
    expect(s.some((x) => x.kind === "competitor")).toBe(false);
    expect(s.every((x) => !/ in /.test(x.text))).toBe(true);
    expect(s[0].text).toBe("Who is the best plumber near me?");
  });
});

describe("pack estimate", () => {
  const single: Estimate = {
    points: 1, skipped: 0, totalUsd: 0.0158, highUsd: 0.0298, credits: 1, basis: "published prices",
    lines: [{ provider: "openai", label: "ChatGPT, 1 sample", usd: 0.0117 }, { provider: "perplexity", label: "Perplexity, 1 sample", usd: 0.0025 }, { provider: "gemini", label: "Gemini, 1 sample", usd: 0.0016 }],
  };
  it("is one scan's estimate × prompts × repeats, with no credits", () => {
    const e = packEstimate(single, 10, 2);
    expect(e.scans).toBe(20);
    expect(e.answers).toBe(60);
    expect(e.totalUsd).toBeCloseTo(0.316, 6);
    expect(e.highUsd).toBeCloseTo(0.596, 6);
    expect(e.credits).toBe(0);
    expect(e.lines[0]).toEqual({ provider: "openai", label: "ChatGPT, 20 answers (10 prompts × 2 runs × 1 point)", usd: expect.closeTo(0.234, 6) });
    expect(e.lines.reduce((s, l) => s + l.usd, 0)).toBeCloseTo(e.totalUsd, 6);
  });
});

describe("cited page addresses and types", () => {
  it("drops tracking parameters, fragments, www and trailing slashes", () => {
    expect(normalizeUrl("https://www.Example.com/best-dentists-austin/?utm_source=chatgpt.com#top")).toEqual({
      key: "example.com/best-dentists-austin", url: "https://www.example.com/best-dentists-austin", domain: "example.com",
    });
    expect(normalizeUrl("https://example.com/?page=2&utm_medium=x")?.key).toBe("example.com?page=2");
    expect(normalizeUrl("ftp://example.com/x")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
  it("classifies by address and title, with a confidence", () => {
    const ctx = { clientDomain: "northgatedental.com", competitorDomains: { "smilehaus.com": "Smile Haus" } };
    expect(classifyPage({ url: "https://maps.google.com/?cid=123" }, ctx).type).toBe("maps_listing");
    expect(classifyPage({ url: "https://www.northgatedental.com/about" }, ctx)).toMatchObject({ type: "official_site", owner: "client" });
    expect(classifyPage({ url: "https://smilehaus.com/" }, ctx)).toMatchObject({ type: "official_site", owner: "competitor", competitor: "Smile Haus" });
    expect(classifyPage({ url: "https://www.yelp.com/search?find_desc=best+dentist", title: "THE BEST 10 Dentists in Austin" }, ctx).type).toBe("directory");
    expect(classifyPage({ url: "https://www.reddit.com/r/Austin/comments/x" }, ctx).type).toBe("forum");
    expect(classifyPage({ url: "https://blog.example.com/x", title: "The 12 Best Dentists in Austin (2026)" }, ctx)).toMatchObject({ type: "listicle", confidence: "high" });
    expect(classifyPage({ url: "https://news.example.com/best-dentists-austin" }, ctx)).toMatchObject({ type: "listicle", confidence: "medium" });
    expect(classifyPage({ url: "https://example.com/dentist-reviews" }, ctx)).toMatchObject({ type: "review", confidence: "medium" });
    expect(classifyPage({ url: "https://example.com/contact" }, ctx)).toMatchObject({ type: "other", confidence: "low" });
  });
});

describe("cited-page inventory (acceptance: three answers with known URLs)", () => {
  const runs: InvRun[] = [{ id: "r1", created_at: "2026-11-20T10:00:00Z", finished: true }];
  const LIST = "https://www.austinguide.com/best-dentists/?utm_source=chatgpt.com";
  const s = (over: Partial<InvSample>): InvSample => ({ run_id: "r1", prompt_idx: 0, engine: "openai", status: "done", mentioned: false, named_businesses: [], sources: [], ...over });
  const samples: InvSample[] = [
    s({ engine: "openai", mentioned: true, named_businesses: [{ name: "Northgate Family Dental", you: true }, { name: "Smile Haus" }], sources: [{ url: LIST, title: "The 10 Best Dentists in Austin" }, { url: "https://www.yelp.com/biz/northgate" }] }),
    s({ engine: "perplexity", mentioned: false, named_businesses: [{ name: "Smile Haus" }, { name: "Enamel Dentistry" }], sources: [{ url: "https://austinguide.com/best-dentists" }, { url: "https://dentalnews.com/top-10-austin-dentists" }] }),
    s({ engine: "gemini", prompt_idx: 1, mentioned: false, named_businesses: [{ name: "Smile Haus" }], sources: [{ url: "https://dentalnews.com/top-10-austin-dentists", title: "Top 10 Austin dentists" }] }),
  ];
  const ctx = { clientName: "Northgate Family Dental", clientDomain: "northgatedental.com" };

  it("counts each page once per answer and merges tracking variants", () => {
    const inv = buildInventory(runs, samples, new Map(), ctx);
    expect(inv.answers).toBe(3);
    expect(inv.answers_with_sources).toBe(3);
    expect(inv.urls.map((u) => [u.key, u.answers, u.answers_naming_client])).toEqual([
      ["austinguide.com/best-dentists", 2, 1],
      ["dentalnews.com/top-10-austin-dentists", 2, 0],
      ["yelp.com/biz/northgate", 1, 1],
    ]);
    const list = inv.urls[0];
    expect(list.title).toBe("The 10 Best Dentists in Austin");
    expect(list.page_type).toBe("listicle");
    expect(list.engines).toEqual(["openai", "perplexity"]);
    expect(inv.domains.map((d) => [d.domain, d.answers, d.urls])).toEqual([["austinguide.com", 2, 1], ["dentalnews.com", 2, 1], ["yelp.com", 1, 1]]);
  });

  it("flags a page cited only in answers that named competitors as missing, on the answers basis", () => {
    const inv = buildInventory(runs, samples, new Map(), ctx);
    const news = inv.urls.find((u) => u.domain === "dentalnews.com")!;
    expect(news.missing).toEqual({ basis: "answers", client_absent: true, competitors_present: ["Smile Haus", "Enamel Dentistry"] });
    expect(news.answers_naming_only_others).toBe(2);
    expect(inv.urls.find((u) => u.domain === "austinguide.com")!.missing.client_absent).toBe(false);
  });

  const check = (url_key: string, over: Partial<PageCheck>): PageCheck => ({ url_key, status: "ok", fetched_at: "2026-11-20T11:00:00Z", title: null, client_named: false, competitors_named: [], ...over });

  it("uses a page read only when the page shows a business the citing answers named", () => {
    const inv = buildInventory(runs, samples, new Map([["dentalnews.com/top-10-austin-dentists", check("dentalnews.com/top-10-austin-dentists", { competitors_named: ["Smile Haus"] })]]), ctx);
    expect(inv.urls[1].missing).toEqual({ basis: "page", client_absent: true, competitors_present: ["Smile Haus"] });
  });

  it("reports a page read that contradicts an answer instead of calling the page missing", () => {
    // An answer named the business while citing austinguide; the page read did not find the name.
    const inv = buildInventory(runs, samples, new Map([["austinguide.com/best-dentists", check("austinguide.com/best-dentists", { competitors_named: ["Smile Haus"] })]]), ctx);
    expect(inv.urls[0].missing).toMatchObject({ basis: "answers", client_absent: false, note: PAGE_DISAGREES });
  });

  it("keeps the answers basis when the read found no business at all, or the page could not be read", () => {
    const inv = buildInventory(runs, samples, new Map([
      ["dentalnews.com/top-10-austin-dentists", check("dentalnews.com/top-10-austin-dentists", { competitors_named: [] })],
      ["yelp.com/biz/northgate", check("yelp.com/biz/northgate", { status: "failed", client_named: null })],
    ]), ctx);
    expect(inv.urls[1].missing).toMatchObject({ basis: "answers", client_absent: true, note: PAGE_INCONCLUSIVE });
    expect(inv.urls[2].missing).toEqual({ basis: "answers", client_absent: false, competitors_present: ["Smile Haus"] });
    // A page that names the business settles it on the page basis.
    const named = buildInventory(runs, samples, new Map([["dentalnews.com/top-10-austin-dentists", check("dentalnews.com/top-10-austin-dentists", { client_named: true })]]), ctx);
    expect(named.urls[1].missing).toMatchObject({ basis: "page", client_absent: false });
  });

  it("dates first seen, last seen and disappeared on over finished runs", () => {
    const three: InvRun[] = [
      { id: "r1", created_at: "2026-11-01T00:00:00Z", finished: true },
      { id: "r2", created_at: "2026-11-08T00:00:00Z", finished: true },
      { id: "r3", created_at: "2026-11-15T00:00:00Z", finished: true },
      { id: "r4", created_at: "2026-11-22T00:00:00Z", finished: false },
    ];
    const cited = (run: string, url: string) => s({ run_id: run, sources: [{ url }] });
    const inv = buildInventory(three, [cited("r1", "https://a.com/x"), cited("r2", "https://a.com/x"), cited("r3", "https://b.com/y"), cited("r4", "https://c.com/z")], new Map(), ctx);
    const a = inv.urls.find((u) => u.domain === "a.com")!;
    expect([a.first_seen, a.last_seen, a.disappeared_on, a.runs_cited]).toEqual(["2026-11-01T00:00:00Z", "2026-11-08T00:00:00Z", "2026-11-15T00:00:00Z", 2]);
    expect(inv.urls.find((u) => u.domain === "b.com")!.disappeared_on).toBeNull();
    // An unfinished run counts for nothing yet.
    expect(inv.urls.some((u) => u.domain === "c.com")).toBe(false);
  });
});

describe("names from free-form answers (seen on real answers, 23 Nov 2026)", () => {
  it("drops headings and sentences the list parser stored, and trims a cut-off bracket", () => {
    expect(businessNameOrNull("10 Austin dentist options")).toBeNull();
    expect(businessNameOrNull("shortlist, not a definitive ranking")).toBeNull();
    expect(businessNameOrNull("South Austin Dental Associates (Dr")).toBe("South Austin Dental Associates");
  });
  it("keeps real names, including ones that start with a number or have a small word", () => {
    for (const n of ["5 Star Dentists", "1st Choice Dental", "24 Hour Plumbing", "Dr. Smith and Associates", "Craft of Dentistry", "Tech Ridge Dental (Austin)"]) expect(businessNameOrNull(n)).toBe(n);
  });
});

describe("pack results", () => {
  it("rates mentions per prompt and engine and shares answers only over stored names", () => {
    const smp = (prompt_idx: number, engine: "openai" | "gemini", mentioned: boolean, names: string[], position: number | null = null): InvSample => ({
      run_id: "r1", prompt_idx, engine, status: "done", mentioned, mention_position: position, sources: [],
      named_businesses: names.map((n) => ({ name: n, you: n === "Northgate Family Dental" })),
    });
    const r = packResults(["p0", "p1"], [
      smp(0, "openai", true, ["Smile Haus", "Northgate Family Dental"], 2),
      smp(0, "gemini", false, ["Smile Haus"]),
      smp(1, "openai", false, []),
      { ...smp(1, "gemini", false, []), status: "failed" },
    ], ["openai", "gemini"], "Northgate Family Dental");
    expect(r.answers).toBe(3);
    expect(r.mention_rate).toBe(33.3);
    expect(r.prompts[0]).toMatchObject({ answers: 2, named_client: 1, mention_rate: 50, top_names: [{ name: "Smile Haus", answers: 2 }] });
    expect(r.prompts[0].engines[0]).toMatchObject({ engine: "openai", avg_position: 2 });
    expect(r.prompts[1]).toMatchObject({ answers: 1, mention_rate: 0 });
    // 2 answers named any business: Smile Haus in both, the client in one.
    expect(r.share_of_answers).toEqual([
      { name: "Smile Haus", you: false, answers: 2, share: 100 },
      { name: "Northgate Family Dental", you: true, answers: 1, share: 50 },
    ]);
    expect(topCompetitors([smp(0, "openai", true, ["Smile Haus", "Northgate Family Dental"])], "Northgate Family Dental")).toEqual([{ name: "Smile Haus", answers: 1 }]);
  });
});
