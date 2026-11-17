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

/** JSON over HTTPS with timeout and bounded retry. Never logs; errors carry no credentials. */
export async function providerFetch<T>(url: string, opts: HttpOptions): Promise<T> {
  const attempts = 1 + (opts.retries ?? 0);
  let lastError: ProviderError | undefined;
  for (let i = 0; i < attempts; i++) {
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
    } catch (err) {
      if (err instanceof ProviderError) {
        lastError = err;
        if (!(err.kind === "rate_limit" || err.kind === "unavailable")) throw err;
      } else {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        lastError = new ProviderError(opts.provider, timedOut ? "timeout" : "unavailable", timedOut ? "The request timed out." : "Network error.");
      }
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw lastError ?? new ProviderError(opts.provider, "unknown", "Request failed.");
}
