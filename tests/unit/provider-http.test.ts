import { afterEach, describe, expect, it, vi } from "vitest";
import { businessInfoLive, mapsLive, postMapsTasks } from "@/lib/providers/dataforseo";
import { providerFetch, RATE_LIMIT_RETRIES, rateLimitWaitMs } from "@/lib/providers/http";
import { askOpenAi, validateOpenAi } from "@/lib/providers/openai";
import { askPerplexity } from "@/lib/providers/perplexity";
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

describe("country and language in vendor requests", () => {
  const DFS = { login: "l", password: "p" };
  const dfsOk = (result: unknown[] = [{ items: [] }]) =>
    vi.fn(async () => new Response(JSON.stringify({ status_code: 20000, cost: 0.002, tasks: [{ id: "t1", status_code: 20000, status_message: "Ok.", cost: 0.002, data: { tag: "a" }, result }] }), { status: 200 }));
  const sentBody = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));

  it("searches Google Maps in the country's language, across the country when there is no coordinate", async () => {
    const fetchMock = dfsOk();
    vi.stubGlobal("fetch", fetchMock);
    await mapsLive(DFS, { keyword: "zahnarzt berlin", country: "DE", depth: 20 });
    expect(sentBody(fetchMock)[0]).toMatchObject({ location_code: 2276, language_code: "de" });
  });

  it("uses the coordinate for the place and the country only for the language", async () => {
    const fetchMock = dfsOk();
    vi.stubGlobal("fetch", fetchMock);
    await mapsLive(DFS, { keyword: "歯医者", lat: 35.6812, lng: 139.7671, country: "jp" });
    const body = sentBody(fetchMock)[0];
    expect(body).toMatchObject({ location_coordinate: "35.6812000,139.7671000,15z", language_code: "ja" });
    expect(body.location_code).toBeUndefined();
  });

  it("keeps English and the United States when the country is unknown or missing", async () => {
    const fetchMock = dfsOk();
    vi.stubGlobal("fetch", fetchMock);
    await mapsLive(DFS, { keyword: "dentist" });
    await mapsLive(DFS, { keyword: "dentist", country: "Narnia" });
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) expect(JSON.parse(String(call[1].body))[0]).toMatchObject({ location_code: 2840, language_code: "en" });
  });

  it("sets the language per queued Maps task", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status_code: 20000, tasks: [{ id: "a1", status_code: 20100, data: { tag: "a" } }, { id: "b1", status_code: 20100, data: { tag: "b" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await postMapsTasks(DFS, [{ keyword: "boulangerie", lat: 48.85, lng: 2.35, country: "FR", tag: "a" }, { keyword: "dentist", lat: 30.27, lng: -97.74, tag: "b" }], "standard");
    expect(sentBody(fetchMock).map((t: { language_code: string }) => t.language_code)).toEqual(["fr", "en"]);
  });

  it("looks up a business profile in its own country and language", async () => {
    const fetchMock = dfsOk([{ items: [] }]);
    vi.stubGlobal("fetch", fetchMock);
    await businessInfoLive(DFS, { cid: "123", country: "ES" });
    expect(sentBody(fetchMock)[0]).toMatchObject({ keyword: "cid:123", location_code: 2724, language_code: "es" });
  });

  it("passes the country to ChatGPT's web search as an ISO code, and leaves out one it does not recognise", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await askOpenAi(KEY, "prompt", { lat: 52.52, lng: 13.4, city: "Berlin", country: "de" });
    await askOpenAi(KEY, "prompt", { lat: 52.52, lng: 13.4, city: "Berlin", country: "Narnia" });
    const [first, second] = (fetchMock.mock.calls as unknown as [string, RequestInit][]).map((c) => JSON.parse(String(c[1].body)).tools[0].user_location);
    expect(first).toEqual({ type: "approximate", country: "DE", city: "Berlin" });
    expect(second).toEqual({ type: "approximate", city: "Berlin" });
  });

  it("passes the country and point to Perplexity's web search, and nothing without a known country", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await askPerplexity(KEY, "prompt", { lat: 35.68, lng: 139.77, city: "Tokyo", country: "JP" });
    await askPerplexity(KEY, "prompt", { lat: 35.68, lng: 139.77, city: "Tokyo", country: "ZZ" });
    const [first, second] = (fetchMock.mock.calls as unknown as [string, RequestInit][]).map((c) => JSON.parse(String(c[1].body)).tools[0]);
    expect(first.user_location).toEqual({ country: "JP", city: "Tokyo", latitude: 35.68, longitude: 139.77 });
    expect(second.user_location).toBeUndefined();
  });
});
