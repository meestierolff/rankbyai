import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A failed read must never look like "nothing here yet": on production the gateway sometimes drops
 * the signed-in identity, and pages that ignored the error showed empty states over real data.
 */
const userDb = { who: "user" };
const adminDb = { who: "server" };
const WS = "ws-of-the-session";
vi.mock("@/lib/db/session", () => ({ currentMember: async () => session.current }));
vi.mock("@/lib/db/clients", () => ({ dbAdmin: () => adminDb, dbUser: () => userDb }));
const session: { current: { userId: string; workspaceId: string } | null } = { current: { userId: "u1", workspaceId: WS } };

const { memberRead, NotAMemberError } = await import("@/lib/db/member-read");

beforeEach(() => {
  vi.restoreAllMocks();
  session.current = { userId: "u1", workspaceId: WS };
});

describe("memberRead", () => {
  it("returns the signed-in read when it works, without touching the server role", async () => {
    const run = vi.fn(async () => ({ data: [{ id: 1 }], error: null }));
    expect(await memberRead("rows", WS, run)).toEqual({ data: [{ id: 1 }], count: null });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(userDb, false);
  });

  it("reads as the server when the signed-in read is refused, and logs the first error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.fn(async (_db: unknown, asServer: boolean) => (asServer ? { data: [{ id: 1 }], error: null, count: 4 } : { data: null, error: { code: "RB001" } }));
    expect(await memberRead("rows", WS, run)).toEqual({ data: [{ id: 1 }], count: 4 });
    expect(run).toHaveBeenLastCalledWith(adminDb, true);
    expect(String(warn.mock.calls[0][0])).toContain("RB001");
  });

  it("throws when both reads fail, so the page shows an error and not an empty state", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.fn(async () => ({ data: null, error: { code: "57014" } }));
    await expect(memberRead("Recent scans", WS, run)).rejects.toThrow("Recent scans could not be loaded (57014)");
  });

  it("an empty result without an error is a real empty result", async () => {
    const run = vi.fn(async () => ({ data: [], error: null }));
    expect(await memberRead("rows", WS, run)).toEqual({ data: [], count: null });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never reads, on either path, for a workspace that is not the session's own", async () => {
    const run = vi.fn(async () => ({ data: [{ id: 1 }], error: null }));
    await expect(memberRead("rows", "someone-elses-workspace", run)).rejects.toBeInstanceOf(NotAMemberError);
    session.current = null;
    await expect(memberRead("rows", WS, run)).rejects.toBeInstanceOf(NotAMemberError);
    expect(run).not.toHaveBeenCalled();
  });
});
