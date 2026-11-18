import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A failed read must never look like "nothing here yet": on production the gateway sometimes drops
 * the signed-in identity, and pages that ignored the error showed empty states over real data.
 */
const userDb = { who: "user" };
const adminDb = { who: "server" };
vi.mock("@/lib/db/session", () => ({ currentUserDb: async () => userDb }));
vi.mock("@/lib/db/clients", () => ({ dbAdmin: () => adminDb }));

const { memberRead } = await import("@/lib/db/member-read");

beforeEach(() => vi.restoreAllMocks());

describe("memberRead", () => {
  it("returns the signed-in read when it works, without touching the server role", async () => {
    const run = vi.fn(async () => ({ data: [{ id: 1 }], error: null }));
    expect(await memberRead("rows", run)).toEqual({ data: [{ id: 1 }], count: null });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(userDb, false);
  });

  it("reads as the server when the signed-in read is refused, and logs the first error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.fn(async (_db: unknown, asServer: boolean) => (asServer ? { data: [{ id: 1 }], error: null, count: 4 } : { data: null, error: { code: "RB001" } }));
    expect(await memberRead("rows", run)).toEqual({ data: [{ id: 1 }], count: 4 });
    expect(run).toHaveBeenLastCalledWith(adminDb, true);
    expect(String(warn.mock.calls[0][0])).toContain("RB001");
  });

  it("throws when both reads fail, so the page shows an error and not an empty state", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.fn(async () => ({ data: null, error: { code: "57014" } }));
    await expect(memberRead("Recent scans", run)).rejects.toThrow("Recent scans could not be loaded (57014)");
  });

  it("an empty result without an error is a real empty result", async () => {
    const run = vi.fn(async () => ({ data: [], error: null }));
    expect(await memberRead("rows", run)).toEqual({ data: [], count: null });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
