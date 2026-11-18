import { ProviderError, type Provider, type ProviderErrorKind } from "./types";

export interface HttpOptions {
  provider: Provider;
  method?: "GET" | "POST";
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Extra attempts after a timeout, 429 or 5xx. */
  retries?: number;
}

const kindFor = (status: number): ProviderErrorKind =>
  status === 401 || status === 403 ? "auth"
  : status === 429 ? "rate_limit"
  : status === 402 ? "quota"
  : status >= 500 ? "unavailable"
  : status >= 400 ? "bad_request"
  : "unknown";

/** Vendor error bodies can echo request details; keep a short, scrubbed message only. */
function scrub(text: string): string {
  return text
    .replace(/(sk-|pplx-|AIza|Bearer\s+)[A-Za-z0-9_\-]{6,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

export const RATE_LIMIT_RETRIES = 4;
/** How long to wait after a 429: the vendor's Retry-After (seconds) when given, else 1.5 s doubling; never above 12 s. */
export function rateLimitWaitMs(retryAfter: string | null, attempt: number): number {
  const asked = retryAfter ? Number(retryAfter) : NaN;
  const base = Number.isFinite(asked) && asked > 0 ? asked * 1000 : 1500 * 2 ** attempt;
  return Math.min(12_000, Math.round(base));
}

/** JSON over HTTPS with timeout and bounded retry. Never logs; errors carry no credentials. */
export async function providerFetch<T>(url: string, opts: HttpOptions): Promise<T> {
  const attempts = 1 + (opts.retries ?? 0);
  let lastError: ProviderError | undefined;
  // A vendor's rate limit is not a failure, it is "slow down": wait as long as the vendor asks
  // (Retry-After) and try again, a few more times than for other errors. A new Perplexity key
  // refused 7 of 9 parallel calls on 18 Nov 2026 and one quick retry was not enough.
  let rateLimitWaits = 0;
  for (let i = 0; i < attempts; i++) {
    let waitMs = 800 * (i + 1);
    try {
      const res = await fetch(url, {
        method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
        headers: { ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }), ...opts.headers },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as T;
      const text = await res.text().catch(() => "");
      let message = text;
      try {
        const j = JSON.parse(text) as { error?: { message?: string } | string; status_message?: string };
        message = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.status_message ?? text;
      } catch {}
      lastError = new ProviderError(opts.provider, kindFor(res.status), scrub(message) || `HTTP ${res.status}`, res.status);
      if (!(res.status === 429 || res.status >= 500)) throw lastError;
      if (res.status === 429 && rateLimitWaits < RATE_LIMIT_RETRIES) {
        waitMs = rateLimitWaitMs(res.headers.get("retry-after"), rateLimitWaits);
        rateLimitWaits++;
        i--; // a rate-limit wait does not use up one of the ordinary attempts
      }
    } catch (err) {
      if (err instanceof ProviderError) {
        lastError = err;
        if (!(err.kind === "rate_limit" || err.kind === "unavailable")) throw err;
      } else {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        lastError = new ProviderError(opts.provider, timedOut ? "timeout" : "unavailable", timedOut ? "The request timed out." : "Network error.");
      }
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, waitMs));
  }
  throw lastError ?? new ProviderError(opts.provider, "unknown", "Request failed.");
}
