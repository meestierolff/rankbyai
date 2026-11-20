import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closePool, resetData, sql } from "./helpers";

/**
 * Spend on a failed check is still counted against the free-check budget. Vendors and credentials are
 * mocked (no network): the Maps search finds nothing and costs $0.002, as a junk name would.
 */
vi.mock("@/lib/keys", () => ({ resolveCredentials: async () => ({ dataforseo: { login: "test", password: "test" } }) }));
vi.mock("@/lib/providers/dataforseo", async (orig) => ({ ...(await orig<object>()), mapsLive: async () => ({ items: [], costUsd: 0.002 }) }));

const { executeCheck } = await import("@/lib/free-check");
const { FREE_CHECK_SYSTEM_WORKSPACE } = await import("@/lib/free-check-public");

beforeAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS; // the real code path, with the vendor mocked above
  await resetData();
});
beforeEach(resetData);
afterAll(async () => {
  await resetData();
  await closePool();
});

describe("free-check spend", () => {
  it("a business not found on Maps still logs the paid lookup as free-check spend", async () => {
    const r = await executeCheck({ workspaceId: FREE_CHECK_SYSTEM_WORKSPACE, businessName: "No Such Business", city: "Austin", country: "US" });
    expect(r).toMatchObject({ ok: false, code: "not_on_maps" });
    const rows = await sql<{ provider: string; usd: string; funding: string }>("select provider, usd, funding from public.spend_log");
    expect(rows).toEqual([{ provider: "dataforseo", usd: "0.00200", funding: "free" }]);
    expect(await sql("select 1 from public.businesses")).toEqual([]);
  });
});
