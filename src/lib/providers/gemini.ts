import { GEMINI } from "@/lib/pricing-constants";
import { providerFetch } from "./http";
import { MODELS } from "./models";
import { ProviderError, last4, type AiAnswer, type AiPlace, type AiSource, type GeoContext, type ValidationResult } from "./types";

/** Gemini API with Grounding with Google Maps, falling back to Google Search grounding. Official API only. */
interface GenerateContent {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: {
      groundingChunks?: { maps?: { uri?: string; title?: string; placeId?: string }; web?: { uri?: string; title?: string } }[];
      webSearchQueries?: string[];
    };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const auth = (key: string) => ({ "x-goog-api-key": key });

export function parseGeminiResponse(json: GenerateContent) {
  const cand = json.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  const places: AiPlace[] = [];
  const sources: AiSource[] = [];
  const seen = new Set<string>();
  for (const chunk of cand?.groundingMetadata?.groundingChunks ?? []) {
    if (chunk.maps?.title) {
      const cid = chunk.maps.uri?.match(/[?&]cid=(\d+)/)?.[1];
      places.push({ name: chunk.maps.title, uri: chunk.maps.uri, placeId: chunk.maps.placeId?.replace(/^places\//, ""), cid });
      if (chunk.maps.uri && !seen.has(chunk.maps.uri)) {
        seen.add(chunk.maps.uri);
        sources.push({ url: chunk.maps.uri, title: `${chunk.maps.title} (Google Maps)` });
      }
    } else if (chunk.web?.uri && !seen.has(chunk.web.uri)) {
      seen.add(chunk.web.uri);
      sources.push({ url: chunk.web.uri, title: chunk.web.title ?? chunk.web.uri });
    }
  }
  const inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0);
  return { text, places, sources, inputTokens, outputTokens };
}

/**
 * Token cost only. Grounding is free for the first 5,000 requests a month on a paid key and $14 per 1,000
 * after that; the API response does not say which side of the allowance a call fell on, so the grounding
 * fee is tracked per key per month by the cost guard, not here.
 */
export const geminiTokenCostUsd = (u: { inputTokens: number; outputTokens: number }) =>
  (u.inputTokens * GEMINI.inputPer1M + u.outputTokens * GEMINI.outputPer1M) / 1_000_000;

export async function askGemini(key: string, prompt: string, geo: GeoContext, timeoutMs = 60_000): Promise<AiAnswer> {
  const model = MODELS.gemini();
  const url = `${BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const call = (tools: object[], withLatLng: boolean) =>
    providerFetch<GenerateContent>(url, {
      provider: "gemini",
      headers: auth(key),
      body: {
        contents,
        tools,
        ...(withLatLng ? { toolConfig: { retrievalConfig: { latLng: { latitude: geo.lat, longitude: geo.lng }, languageCode: "en_US" } } } : {}),
      },
      timeoutMs,
      retries: 1,
    });

  let variant = "maps";
  let json: GenerateContent;
  try {
    json = await call([{ googleMaps: {} }], true);
  } catch (e) {
    // Auth, quota and rate-limit errors would fail the same way with Search: only fall back on tool/model errors.
    if (!(e instanceof ProviderError) || !["bad_request", "unknown"].includes(e.kind)) throw e;
    variant = "search";
    json = await call([{ google_search: {} }], false);
  }
  const p = parseGeminiResponse(json);
  return {
    engine: "gemini", variant, model, text: p.text, places: p.places, sources: p.sources,
    costUsd: geminiTokenCostUsd(p), costReported: false,
    usage: { inputTokens: p.inputTokens, outputTokens: p.outputTokens, searches: 1 },
    raw: json,
  };
}

/** Free validation. A bad key returns HTTP 400 with reason API_KEY_INVALID. A valid key may still be free-tier. */
export async function validateGemini(key: string): Promise<ValidationResult> {
  try {
    await providerFetch<unknown>(`${BASE}/models?pageSize=1`, { provider: "gemini", headers: auth(key), timeoutMs: 15_000 });
    return { ok: true, message: "Key works. Maps grounding needs billing enabled on this key's project; a free-tier key will fail at scan time.", hint: last4(key) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Google rejected this key." };
  }
}
