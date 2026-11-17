import { afterEach, describe, expect, it, vi } from "vitest";
import { dbAdmin, dbUser } from "@/lib/db/clients";

/**
 * The Neon gateway can run the first request on a new connection without the user's identity.
 * The database answers RB001; the server must send the request again instead of showing nothing.
 */
const missing = () => new Response(JSON.stringify({ code: "RB001", message: "rankbyai: request identity missing" }), { status: 400, headers: { "Content-Type": "application/json" } });
const rows = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
const USER = "00000000-0000-4000-8000-000000000001";

afterEach(() => vi.unstubAllGlobals());

describe("identity retry", () => {
  it("retries a signed-in request until the identity arrives", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(missing()).mockResolvedValueOnce(missing()).mockResolvedValueOnce(rows([{ id: "w1" }]));
    vi.stubGlobal("fetch", fetchMock);
    const { data, error } = await dbUser(USER).from("workspaces").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: "w1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("resends a write with the same body", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(missing()).mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { error } = await dbUser(USER).from("businesses").insert({ name: "Northgate Family Dental" });
    expect(error).toBeNull();
    expect(fetchMock.mock.calls.map((c) => (c[1] as RequestInit).body)).toEqual([JSON.stringify({ name: "Northgate Family Dental" }), JSON.stringify({ name: "Northgate Family Dental" })]);
  });

  it("gives up after a few attempts and reports the error", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => missing());
    vi.stubGlobal("fetch", fetchMock);
    const { data, error } = await dbUser(USER).from("workspaces").select("id");
    expect(data).toBeNull();
    expect(error?.code).toBe("RB001");
    expect(fetchMock).toHaveBeenCalledTimes(5); // the first try and four retries
  });

  it("does not retry other errors, and never retries the server role", async () => {
    const denied = () => new Response(JSON.stringify({ code: "42501", message: "permission denied" }), { status: 403, headers: { "Content-Type": "application/json" } });
    const userFetch = vi.fn().mockImplementation(async () => denied());
    vi.stubGlobal("fetch", userFetch);
    expect((await dbUser(USER).from("orders").select("id")).error?.code).toBe("42501");
    expect(userFetch).toHaveBeenCalledTimes(1);

    const adminFetch = vi.fn().mockImplementation(async () => missing());
    vi.stubGlobal("fetch", adminFetch);
    await dbAdmin().from("workspaces").select("id");
    expect(adminFetch).toHaveBeenCalledTimes(1);
  });
});
