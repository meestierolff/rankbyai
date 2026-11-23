import { normalizeCountry } from "@/lib/countries";
import { PERPLEXITY } from "@/lib/pricing-constants";
import { providerFetch } from "./http";
import { MODELS } from "./models";
import { ProviderError, last4, type AiAnswer, type AiSource, type GeoContext, type ValidationResult } from "./types";

/** Perplexity Agent API with the web_search tool (fast). Official API only. */
interface AgentOutput {
  output?: {
    type: string;
    results?: { url?: string; title?: string }[];
    content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[];
  }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cost?: { total_cost?: number };
    tool_calls_details?: { search_web?: { invocation?: number } };
  };
}

const auth = (key: string) => ({ Authorization: `Bearer ${key}` });

export function parsePerplexityResponse(json: AgentOutput) {
  let text = "";
  const sources: AiSource[] = [];
  const seen = new Set<string>();
  const add = (url?: string, title?: string) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      sources.push({ url, title: title ?? url });
    }
  };
  for (const item of json.output ?? []) {
    if (item.type === "search_results") for (const r of item.results ?? []) add(r.url, r.title);
    if (item.type === "message") {
      for (const c of item.content ?? []) {
        if (c.type !== "output_text") continue;
        text += (text ? "\n" : "") + (c.text ?? "");
        for (const a of c.annotations ?? []) if (a.type === "url_citation") add(a.url, a.title);
      }
    }
  }
  const inputTokens = json.usage?.input_tokens ?? 0;
  const outputTokens = json.usage?.output_tokens ?? 0;
  const searches = json.usage?.tool_calls_details?.search_web?.invocation ?? 0;
  const reported = json.usage?.cost?.total_cost;
  const computed = searches * PERPLEXITY.webSearchFastPerCall + (inputTokens * PERPLEXITY.inputPer1M + outputTokens * PERPLEXITY.outputPer1M) / 1_000_000;
  return { text, sources, inputTokens, outputTokens, searches, costUsd: typeof reported === "number" ? reported : computed, costReported: typeof reported === "number" };
}

/** `geo` null: an online question (no place), asked without location settings. */
export async function askPerplexity(key: string, prompt: string, geo: GeoContext | null, timeoutMs = 60_000): Promise<AiAnswer> {
  const model = MODELS.perplexity();
  const user_location: Record<string, string | number> = {};
  const country = geo ? normalizeCountry(geo.country) : null;
  if (geo && country) {
    user_location.country = country;
    if (geo.region) user_location.region = geo.region;
    if (geo.city) user_location.city = geo.city;
    // latitude/longitude are only accepted together with a country
    user_location.latitude = geo.lat;
    user_location.longitude = geo.lng;
  }
  const tool: Record<string, unknown> = { type: "web_search", search_type: "fast" };
  if (Object.keys(user_location).length) tool.user_location = user_location;
  const json = await providerFetch<AgentOutput>("https://api.perplexity.ai/v1/agent", {
    provider: "perplexity",
    headers: auth(key),
    body: { model, input: prompt, max_steps: 1, tools: [tool] },
    timeoutMs,
    retries: 1,
  });
  const p = parsePerplexityResponse(json);
  return {
    engine: "perplexity", model, text: p.text, places: [], sources: p.sources,
    costUsd: p.costUsd, costReported: p.costReported,
    usage: { inputTokens: p.inputTokens, outputTokens: p.outputTokens, searches: p.searches },
    raw: json,
  };
}

/**
 * Validation. The docs list GET /v1/models as free; if that route does not accept the key we fall back
 * to one minimal call with no tools (a fraction of a cent on the user's key; the UI says so).
 */
export async function validatePerplexity(key: string): Promise<ValidationResult> {
  try {
    await providerFetch<unknown>("https://api.perplexity.ai/v1/models", { provider: "perplexity", headers: auth(key), timeoutMs: 15_000 });
    return { ok: true, message: "Key works.", hint: last4(key) };
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "auth") {
      // Could be a bad key, or this route not accepting keys: confirm with the smallest real call.
      try {
        await providerFetch<unknown>("https://api.perplexity.ai/v1/agent", {
          provider: "perplexity", headers: auth(key), body: { model: MODELS.perplexity(), input: "hi", max_output_tokens: 1 }, timeoutMs: 20_000,
        });
        return { ok: true, message: "Key works (verified with one tiny test call).", hint: last4(key) };
      } catch (e2) {
        return { ok: false, message: e2 instanceof Error ? e2.message : "Perplexity rejected this key." };
      }
    }
    return { ok: false, message: e instanceof Error ? e.message : "Could not reach Perplexity." };
  }
}
