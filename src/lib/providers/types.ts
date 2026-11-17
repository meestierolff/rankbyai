import type { Engine } from "@/lib/pricing-constants";

export type Provider = "dataforseo" | Engine;

/** Decrypted credentials. They live in memory for the duration of a call and are never logged. */
export interface ProviderCredentials {
  dataforseo?: { login: string; password: string };
  openai?: string;
  perplexity?: string;
  gemini?: string;
}

export interface GeoContext {
  lat: number;
  lng: number;
  city?: string | null;
  region?: string | null;
  /** ISO 3166-1 alpha-2 */
  country?: string | null;
}

export interface AiSource {
  url: string;
  title: string;
}

export interface AiPlace {
  name: string;
  uri?: string;
  placeId?: string;
  cid?: string;
}

export interface AiAnswer {
  engine: Engine;
  /** e.g. "maps" or "search" for Gemini grounding. */
  variant?: string;
  model: string;
  text: string;
  /** Places the engine grounded on, in the order returned (Gemini Maps grounding). */
  places: AiPlace[];
  sources: AiSource[];
  costUsd: number;
  /** true when the vendor reported the cost; false when we computed it from usage and price constants. */
  costReported: boolean;
  usage: { inputTokens: number; outputTokens: number; searches: number };
  raw: unknown;
}

export type ProviderErrorKind = "auth" | "rate_limit" | "quota" | "timeout" | "bad_request" | "unavailable" | "unknown";

/** Errors never include the key, the Authorization header or the request body. */
export class ProviderError extends Error {
  readonly provider: Provider;
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  constructor(provider: Provider, kind: ProviderErrorKind, message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.kind = kind;
    this.status = status;
  }
}

export interface ValidationResult {
  ok: boolean;
  /** Safe to show the user. */
  message: string;
  balanceUsd?: number | null;
  /** A hint to store next to the key (login email, or the last 4 characters). */
  hint?: string;
}

export const last4 = (secret: string) => "…" + secret.slice(-4);
