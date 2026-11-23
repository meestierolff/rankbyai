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

/**
 * `geo` null: an online question (no place, e.g. "best SEO tools"). It is grounded on Google Search
 * without a location: Google Maps grounding answers with places, which is the wrong tool for it.
 */
export async function askGemini(key: string, prompt: string, geo: GeoContext | null, timeoutMs = 60_000): Promise<AiAnswer> {
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
        ...(withLatLng && geo ? { toolConfig: { retrievalConfig: { latLng: { latitude: geo.lat, longitude: geo.lng }, languageCode: "en_US" } } } : {}),
      },
      timeoutMs,
      retries: 1,
    });

  let variant = geo ? "maps" : "search";
  let json: GenerateContent;
  try {
    json = geo ? await call([{ googleMaps: {} }], true) : await call([{ google_search: {} }], false);
  } catch (e) {
    if (!geo) throw e;
    // Auth, quota and rate-limit errors would fail the same way with Search: only fall back on tool/model errors.
    if (!(e instanceof ProviderError) || !["bad_request", "unknown"].includes(e.kind)) throw e;
    variant = "search";
    json = await call([{ google_search: {} }], false);
  }
  const p = parseGeminiResponse(json);
  // Google Search grounding cites redirect links, not the pages (seen on real answers, 23 Nov 2026).
  const sources = variant === "search" ? await resolveGroundingLinks(p.sources) : p.sources;
  return {
    engine: "gemini", variant, model, text: p.text, places: p.places, sources,
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

const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

/**
 * Gemini's Google Search grounding cites links like vertexaisearch.cloud.google.com/grounding-api-redirect/…
 * with the cited site as the title. Each answers with a redirect to the real page, so the page is
 * read from its Location header (one request per link to Google's own host, nothing else is
 * fetched). A link that does not resolve keeps the cited site (from the title) rather than an
 * address that expires.
 */
export async function resolveGroundingLinks(sources: AiSource[], timeoutMs = 4_000): Promise<AiSource[]> {
  return Promise.all(sources.map(async (s): Promise<AiSource> => {
    let host: string;
    try {
      host = new URL(s.url).hostname;
    } catch {
      return s;
    }
    if (host !== GROUNDING_REDIRECT_HOST) return s;
    try {
      const res = await fetch(s.url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      const location = res.headers.get("location");
      void res.body?.cancel().catch(() => {});
      if (location && /^https?:\/\//i.test(location) && new URL(location).hostname !== GROUNDING_REDIRECT_HOST) return { url: location, title: s.title };
    } catch {
      // not resolved: fall back to the cited site below
    }
    const site = s.title.trim().toLowerCase();
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site) ? { url: `https://${site}/`, title: site } : s;
  }));
}
