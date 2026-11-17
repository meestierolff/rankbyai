import { modelEnv } from "@/lib/env";

/**
 * Model defaults, checked against the vendors' docs on 17 Nov 2026 (docs/vendor-api-notes.md).
 * Each can be overridden with an environment variable.
 */
export const MODELS = {
  /** Cheapest current OpenAI model with the web_search tool. (gpt-5-mini is retired on 11 Dec 2026.) */
  openai: () => modelEnv.openai() ?? "gpt-6-luna",
  perplexity: () => modelEnv.perplexity() ?? "perplexity/sonar",
  /** Cheapest current Gemini model with Grounding with Google Maps. */
  gemini: () => modelEnv.gemini() ?? "gemini-3.5-flash-lite",
  /** Parsing and Fix Kit generation: no tools. */
  fixes: () => modelEnv.fixes() ?? "gpt-6-luna",
};
