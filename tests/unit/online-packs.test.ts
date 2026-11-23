import { afterEach, describe, expect, it, vi } from "vitest";
import { businessNameOrNull } from "@/lib/citations/inventory";
import { askGemini, resolveGroundingLinks } from "@/lib/providers/gemini";
import { askOpenAi } from "@/lib/providers/openai";
import { askPerplexity } from "@/lib/providers/perplexity";
import { suggestOnlinePrompts } from "@/lib/packs/prompts";

/** Online prompt packs: no place in the prompts, no location settings sent, Gemini on Google Search. */
afterEach(() => vi.unstubAllGlobals());

const bodyOf = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));

describe("online questions reach the engines without a place", () => {
  it("ChatGPT: web search without user_location (and with it for a local question)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "1. **A** – x" }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await askOpenAi("k", "What are the best SEO tools?", null);
    expect(bodyOf(fetchMock).tools).toEqual([{ type: "web_search" }]);
    await askOpenAi("k", "Best dentist near me", { lat: 1, lng: 2, city: "Austin", country: "US" });
    expect(JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body)).tools[0].user_location).toMatchObject({ city: "Austin", country: "US" });
  });

  it("Perplexity: web search without user_location", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await askPerplexity("k", "What are the best SEO tools?", null);
    expect(bodyOf(fetchMock).tools[0]).toEqual({ type: "web_search", search_type: "fast" });
  });

  it("Gemini: Google Search grounding with no coordinates, never Google Maps", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "1. **A** – x" }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const a = await askGemini("k", "What are the best SEO tools?", null);
    const body = bodyOf(fetchMock);
    expect(body.tools).toEqual([{ google_search: {} }]);
    expect(body.toolConfig).toBeUndefined();
    expect(a.variant).toBe("search");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Gemini Search grounding links (redirects seen on real answers, 23 Nov 2026)", () => {
  const R = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQ";
  it("follows each redirect to the cited page, and keeps the cited site when it does not resolve", async () => {
    const fetchMock = vi.fn(async (url: string) => (url.endsWith("ok") ? new Response(null, { status: 302, headers: { location: "https://searchengineland.com/guide/local-seo-tools" } }) : new Response("gone", { status: 404 })));
    vi.stubGlobal("fetch", fetchMock);
    const out = await resolveGroundingLinks([
      { url: `${R}ok`, title: "searchengineland.com" },
      { url: `${R}gone`, title: "gridbeaconhq.com" },
      { url: "https://example.com/best", title: "Example" },
    ]);
    expect(out).toEqual([
      { url: "https://searchengineland.com/guide/local-seo-tools", title: "searchengineland.com" },
      { url: "https://gridbeaconhq.com/", title: "gridbeaconhq.com" },
      { url: "https://example.com/best", title: "Example" },
    ]);
    // Only Google's redirect host is ever requested.
    expect(fetchMock.mock.calls.map((c) => new URL(String(c[0])).hostname)).toEqual(["vertexaisearch.cloud.google.com", "vertexaisearch.cloud.google.com"]);
  });
});

describe("names in online answers (seen on real answers, 23 Nov 2026)", () => {
  it("cuts a description after a spaced dash and drops section headings", () => {
    expect(businessNameOrNull("Local Falcon — best dedicated map-grid tracker")).toBe("Local Falcon");
    expect(businessNameOrNull("Best Dedicated Geo-Grid Trackers")).toBeNull();
    expect(businessNameOrNull("Best All-In-One Local SEO Suites")).toBeNull();
    expect(businessNameOrNull("$31/month with annual billing")).toBeNull();
    expect(businessNameOrNull("Best Western Plus")).toBe("Best Western Plus");
    expect(businessNameOrNull("Best for Workflow Automation & Small Business Owners")).toBeNull();
    expect(businessNameOrNull("Geo-Grid Capability vs. Traditional Tracking")).toBeNull();
  });
});

describe("online prompt suggestions", () => {
  it("have no place in them and use only stored competitors", () => {
    const s = suggestOnlinePrompts({ service: "local rank tracking", category: "SEO software", competitors: ["Local Falcon", "BrightLocal"] });
    const texts = s.map((x) => x.text);
    expect(texts).toContain("What are the best local rank tracking tools?");
    expect(texts).toContain("What are the best SEO software tools?");
    expect(texts).toContain("What is the best alternative to Local Falcon?");
    expect(texts).toContain("Is BrightLocal worth it, or is there a better local rank tracking tool?");
    expect(texts.every((t) => !/near me| in [A-Z]/.test(t))).toBe(true);
    expect(suggestOnlinePrompts({ service: "CRM" }).some((x) => x.kind === "competitor")).toBe(false);
  });
});
