import { describe, expect, it } from "vitest";
import { classifyPage, normalizeUrl } from "@/lib/citations/classify";
import { AI_SAMPLE_EST_USD, LLM_PARSE_BUDGET_USD } from "@/lib/pricing-constants";
import { askGemini } from "@/lib/providers/gemini";
import { askOpenAi, openAiJson } from "@/lib/providers/openai";
import { askPerplexity } from "@/lib/providers/perplexity";
import type { AiAnswer, GeoContext } from "@/lib/providers/types";
import { PARSE_INSTRUCTIONS, PARSE_SCHEMA, parseNamedBusinesses } from "@/lib/scans/parse";

/**
 * REAL answers to free-form buyer prompts (prompt packs), two prompts on each engine with a key in
 * .env.local (OPENAI_API_KEY, GEMINI_API_KEY, PERPLEXITY_API_KEY). Checks what the mock cannot:
 * whether the list parser still finds names without the standard "recommend up to 5" wording,
 * whether the model fallback would fire (and what it costs), and whether cited sources are web pages.
 * Skipped unless LIVE_AI=1. Expected spend: about $0.03, plus about $0.003 per parse fallback.
 *
 *   LIVE_AI=1 npx vitest run tests/live/prompt-pack-live.test.ts
 */
const live = process.env.LIVE_AI === "1";
const geo: GeoContext = { lat: 30.2672, lng: -97.7431, city: "Austin", region: "Texas", country: "US" };
const PROMPTS = ["Who is the best dentist in Austin?", "Top 10 dentist options in Austin"];
const engines = [
  { name: "openai" as const, key: process.env.OPENAI_API_KEY, ask: askOpenAi, est: AI_SAMPLE_EST_USD.openai },
  { name: "perplexity" as const, key: process.env.PERPLEXITY_API_KEY, ask: askPerplexity, est: AI_SAMPLE_EST_USD.perplexity },
  { name: "gemini" as const, key: process.env.GEMINI_API_KEY, ask: askGemini, est: AI_SAMPLE_EST_USD.geminiPaid },
];

/** Online packs: one prompt without a place, no location settings. Expected spend: about $0.02. */
describe.skipIf(!live || process.env.LIVE_AI_ONLINE !== "1")("online prompt on real engines", () => {
  for (const e of engines) {
    it.skipIf(!e.key)(`${e.name}: answers and cites web pages without a place`, async () => {
      const a = await e.ask(e.key!, "What are the best local rank tracking tools?", null);
      const named = parseNamedBusinesses(a.text);
      console.log(`[live-online] ${e.name} | variant ${a.variant ?? "-"} | ${named.length} names: ${named.slice(0, 6).map((n) => n.name).join("; ")}`);
      console.log(`[live-online] ${e.name} | sources ${a.sources.length}: ${a.sources.slice(0, 5).map((s) => `${s.url.slice(0, 90)} [${s.title.slice(0, 40)}]`).join(" ; ")}`);
      console.log(`[live-online] ${e.name} | cost $${a.costUsd.toFixed(4)}`);
      expect(a.text.length).toBeGreaterThan(0);
    }, 180_000);
  }
});

describe.skipIf(!live || process.env.LIVE_AI_ONLINE === "1")("prompt pack prompts on real engines", () => {
  for (const e of engines) {
    it.skipIf(!e.key)(`${e.name}: names, sources and cost for buyer prompts`, async () => {
      for (const prompt of PROMPTS) {
        const a: AiAnswer = await e.ask(e.key!, prompt, geo);
        let named = parseNamedBusinesses(a.text);
        let via = "list parser";
        if (named.length === 0 && a.places.length) {
          named = a.places.slice(0, 10).map((p, i) => ({ name: p.name, position: i + 1 }));
          via = "grounded places";
        }
        let parseCost = 0;
        if (named.length === 0 && a.text.length > 80 && process.env.OPENAI_API_KEY) {
          const parsed = await openAiJson<{ businesses: { name: string }[] }>(process.env.OPENAI_API_KEY, { instructions: PARSE_INSTRUCTIONS, input: a.text.slice(0, 6000), schemaName: "named_businesses", schema: PARSE_SCHEMA, maxOutputTokens: 300, timeoutMs: 30_000 });
          named = parsed.data.businesses.slice(0, 10).map((b, i) => ({ name: b.name, position: i + 1 }));
          parseCost = Math.min(parsed.costUsd, LLM_PARSE_BUDGET_USD);
          via = "model fallback";
        }
        const types = a.sources.map((s) => classifyPage(s).type);
        const webPages = a.sources.filter((s) => normalizeUrl(s.url) && classifyPage(s).type !== "maps_listing").length;
        console.log(`[live] ${e.name} | "${prompt}" | ${named.length} names via ${via}: ${named.slice(0, 5).map((n) => n.name).join("; ")}`);
        console.log(`[live] ${e.name} | sources ${a.sources.length} (${webPages} web pages): ${[...new Set(types)].join(", ")} | ${a.sources.slice(0, 4).map((s) => normalizeUrl(s.url)?.domain ?? s.url).join(", ")}`);
        console.log(`[live] ${e.name} | cost $${(a.costUsd + parseCost).toFixed(4)} (answer $${a.costUsd.toFixed(4)} + parse $${parseCost.toFixed(4)}) vs estimate $${e.est.toFixed(4)} | ${a.text.length} chars`);
        expect(a.text.length).toBeGreaterThan(0);
        expect(a.sources.every((s) => /^https?:\/\//.test(s.url))).toBe(true);
      }
    }, 180_000);
  }
});
