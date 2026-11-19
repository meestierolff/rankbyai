import { describe, expect, it } from "vitest";
import { aadFor, decryptSecret, encryptSecret, fromBytea, hashApiKey, toBytea } from "@/lib/crypto";
import { parseBusinessInfo, parseMapsItems } from "@/lib/providers/dataforseo";
import { parseGeminiResponse } from "@/lib/providers/gemini";
import { openAiCostUsd, parseOpenAiResponse } from "@/lib/providers/openai";
import { parsePerplexityResponse } from "@/lib/providers/perplexity";
import { buildGrid, milesBetween } from "@/lib/scans/grid";
import { findInMaps, jaroWinkler, mentionedInText, namesMatch, positionInNames } from "@/lib/scans/match";
import { parseNamedBusinesses } from "@/lib/scans/parse";
import { DEFAULT_PROMPT_TEMPLATE, buildPrompt, validateTemplate } from "@/lib/scans/prompt";
import { combinedInsight, summarizeAi, summarizeMaps, type AiSampleRow } from "@/lib/scans/summary";

describe("key vault crypto (AES-256-GCM)", () => {
  const ws = "11111111-1111-1111-1111-111111111111";
  it("round-trips and never stores plaintext", () => {
    const secret = "sk-test-THIS-IS-A-SECRET-1234567890";
    const sealed = encryptSecret(secret, aadFor(ws, "openai"));
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.authTag).toHaveLength(16);
    expect(sealed.ciphertext.toString("utf8")).not.toContain("SECRET");
    expect(decryptSecret(sealed, aadFor(ws, "openai"))).toBe(secret);
    const viaDb = { ...sealed, ciphertext: fromBytea(toBytea(sealed.ciphertext)), iv: fromBytea(toBytea(sealed.iv)), authTag: fromBytea(toBytea(sealed.authTag)) };
    expect(decryptSecret(viaDb, aadFor(ws, "openai"))).toBe(secret);
  });
  it("uses a fresh IV every time", () => {
    const a = encryptSecret("same", aadFor(ws, "openai"));
    const b = encryptSecret("same", aadFor(ws, "openai"));
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });
  it("binds a ciphertext to its workspace and provider (AAD) and detects tampering", () => {
    const sealed = encryptSecret("secret", aadFor(ws, "openai"));
    expect(() => decryptSecret(sealed, aadFor(ws, "gemini"))).toThrow();
    expect(() => decryptSecret(sealed, aadFor("22222222-2222-2222-2222-222222222222", "openai"))).toThrow();
    const tampered = { ...sealed, ciphertext: Buffer.from(sealed.ciphertext) };
    tampered.ciphertext[0] ^= 1;
    expect(() => decryptSecret(tampered, aadFor(ws, "openai"))).toThrow();
  });
  it("hashes API keys with the pepper", () => {
    expect(hashApiKey("rbai_live_abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("rbai_live_abc")).toBe(hashApiKey("rbai_live_abc"));
    expect(hashApiKey("rbai_live_abc")).not.toBe(hashApiKey("rbai_live_abd"));
  });
});

describe("grid geometry", () => {
  const c = { lat: 30.2672, lng: -97.7431 };
  it("1×1 is the centre", () => expect(buildGrid(c, 1, 2)).toEqual([{ idx: 0, row: 0, col: 0, lat: c.lat, lng: c.lng }]));
  it("n×n spans ±radius with the centre in the middle, row 0 in the north", () => {
    for (const n of [3, 5, 7, 9, 11, 13, 15]) {
      const g = buildGrid(c, n, 2);
      expect(g).toHaveLength(n * n);
      const mid = g[(n * n - 1) / 2];
      expect(mid.lat).toBeCloseTo(c.lat, 6);
      expect(mid.lng).toBeCloseTo(c.lng, 6);
      expect(g[0].lat).toBeGreaterThan(g[n * n - 1].lat);
      expect(g[0].lng).toBeLessThan(g[n - 1].lng);
      expect(milesBetween(c, { lat: g[0].lat, lng: c.lng })).toBeCloseTo(2, 1);
      expect(milesBetween(c, { lat: c.lat, lng: g[n - 1].lng })).toBeCloseTo(2, 1);
    }
  });
});

describe("prompt", () => {
  it("fills the default template", () => {
    expect(buildPrompt(DEFAULT_PROMPT_TEMPLATE, { neighbourhood: "North Loop", city: "Austin", service: "dentists", lat: 30.3, lng: -97.7 })).toBe(
      "I'm in North Loop, Austin. Who are the best dentists near me? Recommend up to 5 specific businesses by name, each with a one-line reason.",
    );
  });
  it("falls back to coordinates instead of inventing a place name", () => {
    const p = buildPrompt(DEFAULT_PROMPT_TEMPLATE, { neighbourhood: null, city: "Austin", service: "dentists", lat: 30.312345, lng: -97.724567 });
    expect(p).toContain("the area around 30.312, -97.725, Austin");
  });
  it("validates custom templates", () => {
    expect(validateTemplate(DEFAULT_PROMPT_TEMPLATE)).toBeNull();
    expect(validateTemplate("Best {service} please, anywhere at all?")).toMatch(/neighbourhood/);
    expect(validateTemplate("Who is good in {city} for my problem today?")).toMatch(/service/);
  });
});

describe("answer parsing", () => {
  it("numbered list with bold names and reasons", () => {
    const text = "Here are some options:\n\n1. **Smile Dental** – great reviews [1]\n2. **Pecan Row Dentistry**: family friendly\n3. [Bluebonnet Dental Co.](https://x.example) - open late\n\nLet me know!";
    expect(parseNamedBusinesses(text).map((n) => n.name)).toEqual(["Smile Dental", "Pecan Row Dentistry", "Bluebonnet Dental Co"]);
  });
  it("bullets and headings", () => {
    expect(parseNamedBusinesses("- **Alpha Plumbing** — fast\n- **Beta Pipes** — cheap").map((n) => n.name)).toEqual(["Alpha Plumbing", "Beta Pipes"]);
    expect(parseNamedBusinesses("### Alpha Plumbing\nGood.\n### Beta Pipes\nAlso good.").map((n) => n.name)).toEqual(["Alpha Plumbing", "Beta Pipes"]);
  });
  it("keeps order, removes duplicates, ignores prose", () => {
    expect(parseNamedBusinesses("I could not find specific businesses for that area.")).toEqual([]);
    const names = parseNamedBusinesses("1. **A One**\n2. **B Two**\n3. **A One**");
    expect(names).toEqual([{ name: "A One", position: 1 }, { name: "B Two", position: 2 }]);
  });
});

describe("business matching", () => {
  const biz = { name: "Northgate Family Dental", website: "https://www.northgatedental.example/", phone: "(512) 555-0174", cid: "123", placeId: "ChIJabc" };
  it("Jaro-Winkler and name rules", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 3);
    expect(namesMatch("Northgate Family Dental", "Northgate Family Dental, LLC")).toBe(true);
    expect(namesMatch("Northgate Family Dental", "Northgate Family Dental Care")).toBe(true);
    expect(namesMatch("Northgate Family Dental", "Southgate Family Dentistry")).toBe(false);
    expect(namesMatch("Smile Dental", "Northgate Family Dental")).toBe(false);
    // Shared prefixes must not merge different businesses
    expect(namesMatch("Smile Dental North", "Smile Dental South")).toBe(false);
    expect(namesMatch("Mock Rival One", "Mock Rival Two")).toBe(false);
    expect(namesMatch("Northgate Family Dental", "Northgate Familly Dental")).toBe(true); // typo
  });
  it("does not merge practices that share the start of a name (real answers, 18 Nov 2026)", () => {
    expect(namesMatch("South Austin Dentist", "South Austin Dental Associates")).toBe(false);
    expect(namesMatch("South Austin Dentist", "South Austin Dental Implant Studio")).toBe(false);
    expect(namesMatch("South Austin Dentist", "South Austin Dental")).toBe(false);
    expect(namesMatch("South Austin Dental", "South Austin Dental Implant Studio")).toBe(false);
    expect(namesMatch("South Austin Dental Implant Studio", "South Austin Dental")).toBe(false);
    expect(namesMatch("Daylight Dental", "Daylight Dental South Austin")).toBe(false);
  });
  it("still matches the same practice written differently", () => {
    expect(namesMatch("Enamel Dentistry", "Enamel Dentistry – South Lamar")).toBe(true);
    expect(namesMatch("Enamel Dentistry – South Lamar", "Enamel Dentistry")).toBe(true);
    expect(namesMatch("Smile Haus", "Smile Haus (South Austin)")).toBe(true);
    expect(namesMatch("Dentique", "Dentique: Leila Moghadam, DMD")).toBe(true);
    expect(namesMatch("Northgate Family Dental", "Northgate Family Dental Care, PLLC")).toBe(true);
    expect(namesMatch("Smiles4Kids", "Smiles 4 Kids")).toBe(true);
    expect(namesMatch("110 DigiTech", "110 DigiTech Pty Ltd")).toBe(true);
    expect(namesMatch("110 DigiTech", "110 DigiTec")).toBe(true);
    expect(namesMatch("Lifetime Smiles Cosmetic Dentistry - South Austin", "Lifetime Smiles Cosmetic Dentistry")).toBe(true);
  });
  it("position in a list and mention in text", () => {
    expect(positionInNames(["Smile Dental", "Northgate Family Dental LLC"], biz)).toBe(2);
    expect(positionInNames(["Smile Dental"], biz)).toBeNull();
    expect(mentionedInText("Try northgatedental.example for bookings", biz)).toBe(true);
    expect(mentionedInText("Call 512-555-0174 today", biz)).toBe(true);
    expect(mentionedInText("Smile Dental is nice", biz)).toBe(false);
    expect(mentionedInText("Try Northgate Family Dentistry instead", { name: "Northgate Family Dent" })).toBe(false);
    expect(mentionedInText("1. **Northgate Family Dental** on Main St", { name: "Northgate Family Dental" })).toBe(true);
  });
  it("finds the business in Maps results by cid, then place_id, then name", () => {
    const items = [
      { rank: 1, name: "Other", cid: "999", placeId: null, domain: null },
      { rank: 4, name: "Renamed Listing", cid: "123", placeId: null, domain: null },
      { rank: 7, name: "Northgate Family Dental", cid: "555", placeId: null, domain: null },
    ];
    expect(findInMaps(items, biz)?.rank).toBe(4);
    expect(findInMaps(items, { ...biz, cid: null, placeId: null })?.rank).toBe(7);
    expect(findInMaps(items.slice(0, 1), biz)).toBeNull();
  });
});

describe("vendor response parsing (shapes from the vendors' docs)", () => {
  it("OpenAI Responses + web_search", () => {
    const p = parseOpenAiResponse({
      output: [
        { type: "web_search_call" },
        { type: "message", content: [{ type: "output_text", text: "1. **Smile Dental** – good", annotations: [{ type: "url_citation", url: "https://a.example/x", title: "A" }, { type: "url_citation", url: "https://a.example/x", title: "A" }] }] },
      ],
      usage: { input_tokens: 9000, output_tokens: 350 },
      tool_usage: { web_search: { num_requests: 2 } },
    });
    expect(p.text).toContain("Smile Dental");
    expect(p.sources).toEqual([{ url: "https://a.example/x", title: "A" }]);
    expect(p.searches).toBe(2);
    expect(openAiCostUsd(p)).toBeCloseTo(2 * 0.01 + (9000 * 0.1 + 350 * 0.5) / 1e6, 8);
  });
  it("OpenAI: counts search calls when tool_usage is missing", () => {
    expect(parseOpenAiResponse({ output: [{ type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text: "x" }] }] }).searches).toBe(1);
  });
  it("Perplexity Agent API: sources from search_results, cost as reported", () => {
    const p = parsePerplexityResponse({
      output: [
        { type: "search_results", results: [{ url: "https://b.example/1", title: "B1" }, { url: "https://b.example/2", title: "B2" }] },
        { type: "message", content: [{ type: "output_text", text: "Answer" }] },
      ],
      usage: { input_tokens: 1200, output_tokens: 300, cost: { total_cost: 0.00452 }, tool_calls_details: { search_web: { invocation: 1 } } },
    });
    expect(p.text).toBe("Answer");
    expect(p.sources.map((s) => s.url)).toEqual(["https://b.example/1", "https://b.example/2"]);
    expect(p.costUsd).toBe(0.00452);
    expect(p.costReported).toBe(true);
  });
  it("Gemini Maps grounding: places with cid and bare place id", () => {
    const p = parseGeminiResponse({
      candidates: [{
        content: { parts: [{ text: "Try " }, { text: "Heaven on 7th." }] },
        groundingMetadata: { groundingChunks: [{ maps: { uri: "https://maps.google.com/?cid=13100894621228039586", title: "Heaven on 7th Marketplace", placeId: "places/ChIJ0-zA1vBZwokRon0fGj-6z7U" } }] },
      }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 10 },
    });
    expect(p.text).toBe("Try Heaven on 7th.");
    expect(p.places).toEqual([{ name: "Heaven on 7th Marketplace", uri: "https://maps.google.com/?cid=13100894621228039586", placeId: "ChIJ0-zA1vBZwokRon0fGj-6z7U", cid: "13100894621228039586" }]);
    expect(p.outputTokens).toBe(60);
  });
  it("DataForSEO Maps items: organic only, in rank order", () => {
    const items = parseMapsItems({ items: [
      { type: "maps_paid_item", rank_group: 1, title: "Ad" },
      { type: "maps_search", rank_group: 2, title: "B", cid: "12368344280360434538", place_id: "ChIJ", rating: { value: 4.5, votes_count: 12 }, address_info: { city: "Austin", region: "Texas", country_code: "US" } },
      { type: "maps_search", rank_group: 1, title: "A", cid: null, domain: null },
    ] });
    expect(items.map((i) => [i.rank, i.name])).toEqual([[1, "A"], [2, "B"]]);
    expect(items[1]).toMatchObject({ cid: "12368344280360434538", rating: 4.5, reviews: 12, city: "Austin", country: "US" });
  });
  it("DataForSEO business info: hours live under work_time.work_hours", () => {
    const info = parseBusinessInfo({ title: "X", category: "Dentist", additional_categories: ["Cosmetic dentist"], total_photos: 12, is_claimed: true, work_time: { work_hours: { timetable: { monday: [] } } }, rating: { value: 4.8, votes_count: 38 } });
    expect(info).toMatchObject({ name: "X", category: "Dentist", totalPhotos: 12, isClaimed: true, hasHours: true, reviews: 38 });
  });
});

describe("scan summaries", () => {
  const s = (point_idx: number, engine: AiSampleRow["engine"], pos: number | null, status: AiSampleRow["status"] = "done"): AiSampleRow => ({
    point_idx, engine, status, mentioned: status === "done" ? pos != null : null, mention_position: pos,
    named_businesses: status === "done" ? [{ name: "Rival", position: pos === 1 ? 2 : 1 }, ...(pos ? [{ name: "Me Dental", position: pos, you: true }] : [])] : [],
    sources: status === "done" ? [{ url: "https://dir.example/a", title: "Dir" }] : [], cost_usd: status === "done" ? 0.01 : null,
  });
  it("AI: mention rate per engine, share of AI voice, sources", () => {
    const sum = summarizeAi([s(0, "openai", 1), s(1, "openai", null), s(0, "gemini", 2), s(1, "gemini", null), s(0, "perplexity", null, "failed"), s(1, "perplexity", null, "failed")], 2);
    expect(sum.engines.openai).toMatchObject({ done: 2, mentioned: 1, mention_rate: 0.5, avg_position: 1, available: true });
    expect(sum.engines.perplexity).toMatchObject({ done: 0, available: false, mention_rate: null });
    expect(sum.points_mentioned).toBe(1);
    expect(sum.samples_failed).toBe(2);
    expect(sum.share_of_ai_voice).toBeCloseTo(2 / 6, 3);
    expect(sum.top_competitors[0]).toEqual({ name: "Rival", mentions: 4 });
    expect(sum.top_sources[0]).toEqual({ domain: "dir.example", count: 4, engines: ["openai", "gemini"] });
  });
  it("Maps: average rank counts 'not in top 20' as 21", () => {
    const top = (r: number) => [{ rank: 1, name: r === 1 ? "Me Dental" : "Rival" }, { rank: 2, name: "Other" }, { rank: 3, name: "Third" }];
    const sum = summarizeMaps([
      { idx: 0, status: "done", rank: 1, top: top(1) },
      { idx: 1, status: "done", rank: null, top: top(9) },
      { idx: 2, status: "failed", rank: null, top: null },
    ], "Me Dental");
    expect(sum).toMatchObject({ points: 3, points_done: 2, points_failed: 1, avg_rank: 11, top3_share: 0.5, top3_points: 1, found_points: 1 });
    expect(sum.solv).toBeCloseTo(1 / 6, 3);
    expect(sum.top_competitors[0].name).toBe("Other");
  });
  it("combined insight sentence uses only stored numbers", () => {
    const maps = summarizeMaps(Array.from({ length: 4 }, (_, i) => ({ idx: i, status: "done" as const, rank: i < 3 ? 1 : 9, top: [] })), "Me");
    const ai = summarizeAi([s(0, "openai", null), s(1, "openai", null), s(2, "openai", 1), s(3, "openai", null)], 4);
    expect(combinedInsight(maps, ai)).toBe("Top 3 on Maps at 3/4 points, but named by AI engines in 1/4 answers.");
  });
});

describe("comparing two scans point by point", () => {
  it("needs the same centre and radius, not only the same grid size", async () => {
    const { samePlace } = await import("@/lib/scans/compare");
    const at = (lat: number, lng: number, r = 2) => ({ center_lat: lat, center_lng: lng, radius_miles: r });
    expect(samePlace(at(30.2672, -97.7431), at(30.2672, -97.7431))).toBe(true);
    expect(samePlace(at(30.2672, -97.7431), at(30.2675, -97.7431))).toBe(true); // ~30 m
    expect(samePlace(at(30.2672, -97.7431), at(30.2772, -97.7431))).toBe(false); // ~0.7 mi
    expect(samePlace(at(30.2672, -97.7431, 2), at(30.2672, -97.7431, 5))).toBe(false);
  });
});

describe("questions in the business's language", () => {
  it("every written question is valid and renders with a named area, with coordinates only, and without a city", async () => {
    const { QUESTIONS, buildPrompt, validateTemplate } = await import("@/lib/scans/prompt");
    for (const [lang, q] of Object.entries(QUESTIONS)) {
      expect(validateTemplate(q.template), lang).toBeNull();
      const named = buildPrompt(q.template, { neighbourhood: "Kreuzberg", city: "Berlin", service: q.serviceExample, lat: 52.5, lng: 13.4 });
      expect(named, lang).toContain("Kreuzberg, Berlin");
      expect(named, lang).toContain(q.serviceExample);
      expect(named, lang).not.toMatch(/[{}]/);
      const coords = buildPrompt(q.template, { neighbourhood: null, city: null, service: "x", lat: 52.5389, lng: 13.4246 });
      expect(coords, lang).toContain("52.539, 13.425");
      expect(coords, lang).not.toMatch(/[{}]|,\s*\./);
    }
  });
  it("chooses the language: own language when asked in it and written, else English", async () => {
    const { DEFAULT_PROMPT_TEMPLATE, defaultQuestionFor, questionLanguage } = await import("@/lib/scans/prompt");
    expect(questionLanguage({ ask_in_language: true, language: "de" })).toBe("de");
    expect(questionLanguage({ ask_in_language: true, language: "pt-BR" })).toBe("pt");
    expect(questionLanguage({ ask_in_language: false, language: "de" })).toBe("en");
    expect(questionLanguage({ ask_in_language: true, language: "ja" })).toBe("en"); // no written question yet
    expect(defaultQuestionFor({ ask_in_language: true, language: "en" })).toBe(DEFAULT_PROMPT_TEMPLATE);
  });
});
