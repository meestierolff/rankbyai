import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, resetData, sql } from "./helpers";

/** POST /api/free-check: bot protection and burst limits, as a script would hit it. */
const { POST } = await import("@/app/api/free-check/route");

const body = (extra: Record<string, unknown> = {}) => JSON.stringify({ business_name: "Northgate Family Dental", city: "Austin, TX", country: "US", ...extra });
const post = (payload: string, ip = "203.0.113.7") =>
  POST(new Request("http://localhost:3100/api/free-check", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip, "user-agent": "curl/8" }, body: payload }));

beforeAll(resetData);
beforeEach(resetData);
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  delete process.env.TURNSTILE_SECRET_KEY;
  await resetData();
  await closePool();
});

describe("POST /api/free-check", () => {
  it("with real keys (no mock mode) and no Turnstile, refuses and records nothing", async () => {
    delete process.env.RANKBYAI_MOCK_PROVIDERS;
    delete process.env.TURNSTILE_SECRET_KEY;
    const res = await post(body());
    expect(res.status).toBe(503);
    expect(await sql("select 1 from public.free_checks")).toEqual([]);
  });

  it("rejects junk input before any limit or vendor is touched", async () => {
    process.env.RANKBYAI_MOCK_PROVIDERS = "1";
    const res = await post(body({ business_name: "test", city: "test" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_input");
    expect(await sql("select 1 from public.rate_limits")).toEqual([]);
  });

  it("once Turnstile is configured, a missing token is rejected server-side", async () => {
    process.env.RANKBYAI_MOCK_PROVIDERS = "1";
    process.env.TURNSTILE_SECRET_KEY = "test-secret-not-real"; // configured: a token is now required
    const res = await post(body());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("turnstile_failed");
    expect(await sql("select 1 from public.free_checks")).toEqual([]);
  });

  it("burst requests from one IP hit the rate limit (counted even when refused)", async () => {
    process.env.RANKBYAI_MOCK_PROVIDERS = "1";
    process.env.TURNSTILE_SECRET_KEY = "test-secret-not-real";
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push((await post(body(), "198.51.100.77")).status);
    expect(statuses.slice(0, 5).every((s) => s === 400)).toBe(true); // Turnstile refused
    expect(statuses.at(-1)).toBe(429);
  });
});
