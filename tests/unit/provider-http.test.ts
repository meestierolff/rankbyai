import { afterEach, describe, expect, it, vi } from "vitest";
import { providerFetch, RATE_LIMIT_RETRIES, rateLimitWaitMs } from "@/lib/providers/http";
import { askOpenAi, validateOpenAi } from "@/lib/providers/openai";
import { ProviderError } from "@/lib/providers/types";

/** M2 acceptance (d): keys never appear in errors or logs, even when a vendor echoes them back. */
const KEY = "sk-proj-LEAKYLEAKYLEAKY1234567890";

afterEach(() => vi.unstubAllGlobals());

describe("provider HTTP layer", () => {
  it("scrubs a key that the vendor echoes in its error body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}. Authorization: Bearer ${KEY}` } }), { status: 401 })));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let caught: unknown;
    try {
      await askOpenAi(KEY, "prompt", { lat: 1, lng: 2, city: "Austin", country: "US" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProviderError);
    const pe = caught as ProviderError;
    expect(pe.kind).toBe("auth");
    expect(pe.message).not.toContain("LEAKY");
    expect(JSON.stringify(pe)).not.toContain("LEAKY");
    expect(String(pe.stack)).not.toContain("LEAKY");
    for (const spy of [log, error, warn]) expect(JSON.stringify(spy.mock.calls)).not.toContain("LEAKY");

    const v = await validateOpenAi(KEY);
    expect(v.ok).toBe(false);
    expect(JSON.stringify(v)).not.toContain("LEAKY");
  });

  it("sends the key only in the Authorization header, never in the URL or body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "1. **A** – x" }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await askOpenAi(KEY, "prompt", { lat: 1, lng: 2 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("LEAKY");
    expect(String(init.body)).not.toContain("LEAKY");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it("asks ChatGPT for one web search per answer, which is what the cost estimate assumes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "1. **A** – x" }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await askOpenAi(KEY, "prompt", { lat: 1, lng: 2 });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { max_tool_calls?: number; tool_choice?: string };
    expect(body.max_tool_calls).toBe(1);
    expect(body.tool_choice).toBe("required");
  });

  it("waits out a vendor rate limit several times before reporting it", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = providerFetch("https://example.invalid", { provider: "perplexity", headers: {}, retries: 1 }).catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ kind: "rate_limit" });
    expect(fetchMock).toHaveBeenCalledTimes(RATE_LIMIT_RETRIES + 2); // four rate-limit waits, then the ordinary two attempts
    vi.useRealTimers();
  });

  it("succeeds when the rate limit clears, as happens when nine calls start at once", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "2" } })).mockResolvedValueOnce(new Response("{}", { status: 429 })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = providerFetch<{ ok: number }>("https://example.invalid", { provider: "perplexity", headers: {} });
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("waits as long as the vendor asks, within a ceiling", () => {
    expect(rateLimitWaitMs("2", 0)).toBe(2000);
    expect(rateLimitWaitMs("60", 0)).toBe(12_000);
    expect(rateLimitWaitMs(null, 0)).toBe(1500);
    expect(rateLimitWaitMs(null, 2)).toBe(6000);
    expect(rateLimitWaitMs("soon", 1)).toBe(3000);
  });

  it("does not retry an auth error", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(providerFetch("https://example.invalid", { provider: "openai", headers: {}, retries: 3 })).rejects.toMatchObject({ kind: "auth" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
