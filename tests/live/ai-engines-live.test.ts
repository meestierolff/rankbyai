import { describe, expect, it } from "vitest";
import { askGemini, validateGemini } from "@/lib/providers/gemini";
import { askOpenAi, validateOpenAi } from "@/lib/providers/openai";
import { askPerplexity, validatePerplexity } from "@/lib/providers/perplexity";
import type { AiAnswer, GeoContext, ValidationResult } from "@/lib/providers/types";
import { buildPrompt, DEFAULT_PROMPT_TEMPLATE } from "@/lib/scans/prompt";

/**
 * REAL calls to the AI engines, one answer each, with keys from the environment (.env.local):
 * OPENAI_API_KEY, GEMINI_API_KEY, PERPLEXITY_API_KEY. An engine without a key is skipped.
 * Skipped entirely unless LIVE_AI=1. Expected spend for the whole file: a few cents.
 *
 *   LIVE_AI=1 npx vitest run tests/live/ai-engines-live.test.ts
 */
const live = process.env.LIVE_AI === "1";
const geo: GeoContext = { lat: 30.2672, lng: -97.7431, city: "Austin", region: "Texas", country: "US" };
const prompt = buildPrompt(DEFAULT_PROMPT_TEMPLATE, { neighbourhood: "Downtown", city: "Austin, TX", service: "dentist", lat: geo.lat, lng: geo.lng });

const engines: { name: string; key?: string; validate: (k: string) => Promise<ValidationResult>; ask: (k: string, p: string, g: GeoContext) => Promise<AiAnswer> }[] = [
  { name: "openai", key: process.env.OPENAI_API_KEY, validate: validateOpenAi, ask: askOpenAi },
  { name: "gemini", key: process.env.GEMINI_API_KEY, validate: validateGemini, ask: askGemini },
  { name: "perplexity", key: process.env.PERPLEXITY_API_KEY, validate: validatePerplexity, ask: askPerplexity },
];

/**
 * Nine real ChatGPT answers at nine points, the size of a 3×3 grid: what one grid really costs.
 * Runs only with LIVE_AI_GRID=1 as well. Expected spend: about $0.10.
 */
describe.skipIf(!live || process.env.LIVE_AI_GRID !== "1" || !process.env.OPENAI_API_KEY)("ChatGPT, a real 3×3 grid", () => {
  it("costs what the estimate says, with one search per answer", async () => {
    const points = [-0.02, 0, 0.02].flatMap((dLat) => [-0.02, 0, 0.02].map((dLng) => ({ lat: geo.lat + dLat, lng: geo.lng + dLng })));
    const answers = await Promise.all(
      points.map((pt) => askOpenAi(process.env.OPENAI_API_KEY!, buildPrompt(DEFAULT_PROMPT_TEMPLATE, { city: "Austin, TX", service: "dentist", lat: pt.lat, lng: pt.lng }), { ...geo, ...pt })),
    );
    const sum = (f: (a: AiAnswer) => number) => answers.reduce((n, a) => n + f(a), 0);
    const searches = answers.map((a) => a.usage.searches);
    const inputs = answers.map((a) => a.usage.inputTokens);
    const costs = answers.map((a) => a.costUsd);
    console.log(`[live] 9 answers: searches per answer ${searches.join(",")}; input tokens avg ${Math.round(sum((a) => a.usage.inputTokens) / 9)}, max ${Math.max(...inputs)}; output tokens avg ${Math.round(sum((a) => a.usage.outputTokens) / 9)}`);
    console.log(`[live] 9 answers: cost total $${sum((a) => a.costUsd).toFixed(4)}, avg $${(sum((a) => a.costUsd) / 9).toFixed(4)}, max $${Math.max(...costs).toFixed(4)}; shortest answer ${Math.min(...answers.map((a) => a.text.length))} chars; sources avg ${(sum((a) => a.sources.length) / 9).toFixed(1)}`);
    expect(Math.max(...searches)).toBeLessThanOrEqual(1);
    expect(Math.min(...answers.map((a) => a.text.length))).toBeGreaterThan(40);
  }, 240_000);
});

describe.skipIf(!live)("AI engines, one real answer each", () => {
  for (const e of engines) {
    it.skipIf(!e.key)(`${e.name}: the key is valid and one answer comes back parsed, with its cost`, async () => {
      const v = await e.validate(e.key!);
      expect(v.ok, v.message).toBe(true);
      const a = await e.ask(e.key!, prompt, geo);
      console.log(`[live] ${e.name} (${a.model}): ${a.text.length} chars, ${a.places.length} places, ${a.sources.length} sources, cost $${a.costUsd.toFixed(4)} (${a.costReported ? "reported by the vendor" : "computed from usage"}), searches ${a.usage.searches}`);
      console.log(`[live] ${e.name} answer starts: ${a.text.slice(0, 160).replace(/\s+/g, " ")}`);
      expect(a.text.length).toBeGreaterThan(40);
      expect(a.costUsd).toBeGreaterThan(0);
      expect(a.costUsd).toBeLessThan(0.25);
    }, 120_000);
  }
});
