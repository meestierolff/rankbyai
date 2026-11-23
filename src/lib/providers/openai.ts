import { normalizeCountry } from "@/lib/countries";
import { OPENAI } from "@/lib/pricing-constants";
import { providerFetch } from "./http";
import { MODELS } from "./models";
import { last4, type AiAnswer, type AiSource, type GeoContext, type ValidationResult } from "./types";

/** OpenAI Responses API with the web_search tool ("ChatGPT-style answer"). Official API only. */
interface ResponsesOutput {
  output?: {
    type: string;
    content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[];
  }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  tool_usage?: { web_search?: { num_requests?: number } };
}

const auth = (key: string) => ({ Authorization: `Bearer ${key}` });

export function parseOpenAiResponse(json: ResponsesOutput): { text: string; sources: AiSource[]; inputTokens: number; outputTokens: number; searches: number } {
  let text = "";
  const sources: AiSource[] = [];
  const seen = new Set<string>();
  let searchCalls = 0;
  for (const item of json.output ?? []) {
    if (item.type === "web_search_call") searchCalls++;
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type !== "output_text") continue;
      text += (text ? "\n" : "") + (c.text ?? "");
      for (const a of c.annotations ?? []) {
        if (a.type === "url_citation" && a.url && !seen.has(a.url)) {
          seen.add(a.url);
          sources.push({ url: a.url, title: a.title ?? a.url });
        }
      }
    }
  }
  return {
    text,
    sources,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
    // Billable searches when reported; otherwise count the search calls we can see.
    searches: json.tool_usage?.web_search?.num_requests ?? searchCalls,
  };
}

export const openAiCostUsd = (u: { inputTokens: number; outputTokens: number; searches: number }) =>
  u.searches * OPENAI.webSearchPerCall + (u.inputTokens * OPENAI.inputPer1M + u.outputTokens * OPENAI.outputPer1M) / 1_000_000;

export const OPENAI_SEARCHES_PER_ANSWER = 1;

/** `geo` null: an online question (no place), asked without location settings. */
export async function askOpenAi(key: string, prompt: string, geo: GeoContext | null, timeoutMs = 60_000): Promise<AiAnswer> {
  const model = MODELS.openai();
  const user_location: Record<string, string> = { type: "approximate" };
  // "two-letter ISO country code". Sent for every supported country; left out when unknown (OpenAI then assumes the US).
  const country = normalizeCountry(geo?.country);
  if (country) user_location.country = country;
  if (geo?.region) user_location.region = geo.region;
  if (geo?.city) user_location.city = geo.city;
  const json = await providerFetch<ResponsesOutput>("https://api.openai.com/v1/responses", {
    provider: "openai",
    headers: auth(key),
    // One search per answer. Left free, the model ran three searches for one answer (measured
    // 18 Nov 2026), and the search fee is most of what an answer costs. max_tool_calls is OpenAI's
    // documented cap on built-in tool calls in one response.
    body: { model, input: prompt, tools: [{ type: "web_search", ...(geo ? { user_location } : {}) }], tool_choice: "required", max_tool_calls: OPENAI_SEARCHES_PER_ANSWER },
    timeoutMs,
    retries: 1,
  });
  const p = parseOpenAiResponse(json);
  return {
    engine: "openai", model, text: p.text, places: [], sources: p.sources,
    costUsd: openAiCostUsd(p), costReported: false,
    usage: { inputTokens: p.inputTokens, outputTokens: p.outputTokens, searches: p.searches },
    raw: json,
  };
}

/** Plain JSON-schema completion with no tools: answer parsing fallback and Fix Kit generation. */
export async function openAiJson<T>(key: string, opts: { instructions: string; input: string; schemaName: string; schema: object; maxOutputTokens: number; timeoutMs?: number }): Promise<{ data: T; costUsd: number }> {
  const model = MODELS.fixes();
  const json = await providerFetch<ResponsesOutput>("https://api.openai.com/v1/responses", {
    provider: "openai",
    headers: auth(key),
    body: {
      model,
      instructions: opts.instructions,
      input: opts.input,
      max_output_tokens: opts.maxOutputTokens,
      text: { format: { type: "json_schema", name: opts.schemaName, schema: opts.schema, strict: true } },
    },
    timeoutMs: opts.timeoutMs ?? 60_000,
    retries: 1,
  });
  const p = parseOpenAiResponse(json);
  return { data: JSON.parse(p.text) as T, costUsd: openAiCostUsd({ ...p, searches: 0 }) };
}

/** Free validation: listing models needs a valid key and costs nothing. */
export async function validateOpenAi(key: string): Promise<ValidationResult> {
  try {
    await providerFetch<unknown>("https://api.openai.com/v1/models", { provider: "openai", headers: auth(key), timeoutMs: 15_000 });
    return { ok: true, message: "Key works.", hint: last4(key) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "OpenAI rejected this key." };
  }
}
