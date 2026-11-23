import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext, Workspace } from "@/lib/auth";
import { admin, anon, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";

const session = vi.hoisted(() => ({ current: null as SessionContext | null }));
vi.mock("@/lib/auth", () => ({ getSessionContext: async () => session.current }));

let a: TestUser, b: TestUser;
const hash = () => createHash("sha256").update(randomBytes(24)).digest("hex");
const mint = async () => {
  const code = hash();
  const [batch] = await sql<{ id: string }>("insert into public.appsumo_code_batches(name) values ($1) returning id", [code]);
  await sql("insert into public.appsumo_codes(code_hash,batch_id) values ($1,$2)", [code, batch.id]);
  return code;
};
const redeem = (code: string, user: TestUser, workspace = user.workspaceId) => admin.rpc("redeem_appsumo_code", { p_code_hash: code, p_user_id: user.id, p_workspace_id: workspace });

beforeAll(async () => { a = await createTestUser("appsumo-a"); b = await createTestUser("appsumo-b"); });
beforeEach(async () => { session.current = null; await sql("truncate public.appsumo_codes, public.appsumo_code_batches"); await resetData(); });
afterAll(async () => { await sql("truncate public.appsumo_codes, public.appsumo_code_batches"); await resetData(); await deleteTestUsers(); await closePool(); });

describe("AppSumo lifetime redemption", () => {
  it("grants access and one entitlement without changing Stripe orders or the price ladder", async () => {
    const code = await mint();
    const result = await redeem(code, a);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ ok: true, replayed: false });
    expect((await sql("select plan, lifetime_seat from public.workspaces where id=$1", [a.workspaceId]))[0]).toEqual({ plan: "lifetime", lifetime_seat: null });
    expect((await sql("select * from public.entitlements where workspace_id=$1", [a.workspaceId]))).toHaveLength(1);
    expect(await sql("select * from public.orders")).toHaveLength(0);
    expect((await redeem(code, a)).data).toEqual({ ok: true, replayed: true });
    expect((await sql("select * from public.entitlements where workspace_id=$1", [a.workspaceId]))).toHaveLength(1);
  });
  it("one code claimed concurrently by two workspaces succeeds exactly once", async () => {
    const code = await mint();
    const results = await Promise.all([redeem(code, a), redeem(code, b)]);
    expect(results.filter(r => r.data?.ok)).toHaveLength(1);
    expect(results.filter(r => r.data?.error === "invalid_code")).toHaveLength(1);
  });
  it("two codes submitted to one workspace consume only one", async () => {
    const codes = await Promise.all([mint(), mint()]);
    const results = await Promise.all(codes.map(code => redeem(code, a)));
    expect(results.filter(r => r.data?.ok)).toHaveLength(1);
    expect((await sql("select * from public.appsumo_codes where redeemed_at is not null"))).toHaveLength(1);
  });
  it("refuses unknown, revoked and foreign-workspace claims without upgrading", async () => {
    expect((await redeem(hash(), a)).data?.error).toBe("invalid_code");
    const code = await mint();
    expect((await redeem(code, b, a.workspaceId)).data?.error).toBe("forbidden");
    await sql("update public.appsumo_codes set revoked_at=now() where code_hash=$1", [code]);
    expect((await redeem(code, a)).data?.error).toBe("invalid_code");
    expect((await sql("select plan from public.workspaces where id=$1", [a.workspaceId]))[0].plan).toBe("locked");
  });
  it("never consumes a code for a workspace that already has lifetime access", async () => {
    const code = await mint();
    await sql("update public.workspaces set plan='lifetime' where id=$1", [a.workspaceId]);
    expect((await redeem(code, a)).data?.error).toBe("already_lifetime");
    expect((await redeem(code, b)).data?.ok).toBe(true);
  });
  it("does not expose codes or the redemption RPC to anonymous or authenticated database clients", async () => {
    const code = await mint();
    for (const client of [anon(), a.client]) {
      expect((await client.from("appsumo_codes").select("*")).error).not.toBeNull();
      expect((await client.rpc("redeem_appsumo_code", { p_code_hash: code, p_workspace_id: a.workspaceId, p_user_id: a.id })).error).not.toBeNull();
    }
  });
});

describe("redemption HTTP endpoint", () => {
  const call = async (body: unknown, origin = process.env.NEXT_PUBLIC_SITE_URL!, type = "application/json") => {
    const { POST } = await import("@/app/api/appsumo/redeem/route");
    return POST(new Request(`${process.env.NEXT_PUBLIC_SITE_URL}/api/appsumo/redeem`, { method: "POST", headers: { Origin: origin, "Content-Type": type }, body: JSON.stringify(body) }));
  };
  const signIn = async () => {
    const [workspace] = await sql<Workspace>("select * from public.workspaces where id=$1", [a.workspaceId]);
    session.current = { user: { id: a.id, email: a.email, emailVerified: true, name: null }, workspace, role: "owner", isAdmin: false };
  };
  it("refuses anonymous users, cross-site requests, non-JSON, members and unverified users", async () => {
    expect((await call({ code: "x" })).status).toBe(401);
    expect((await call({ code: "x" }, "https://evil.test")).status).toBe(403);
    expect((await call({ code: "x" }, undefined, "text/plain")).status).toBe(415);
    await signIn();
    session.current!.role = "member";
    expect((await call({ code: "x" })).status).toBe(403);
    session.current!.role = "owner";
    session.current!.user.emailVerified = false;
    expect((await call({ code: "x" })).status).toBe(403);
  });
  it("redeems a pasted lowercase code, retries safely, and never echoes the secret", async () => {
    const code = `RBAI-${randomBytes(24).toString("hex").toUpperCase()}`;
    const { hashAppSumoCode } = await import("@/lib/appsumo-codes");
    const [batch] = await sql<{ id: string }>("insert into public.appsumo_code_batches(name) values ($1) returning id", [code]);
    await sql("insert into public.appsumo_codes(code_hash,batch_id) values ($1,$2)", [hashAppSumoCode(code), batch.id]);
    await signIn();
    for (let i = 0; i < 2; i++) {
      const response = await call({ code: ` ${code.toLowerCase()} ` });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).not.toContain(code);
    }
  });
  it("rate limits malformed guesses", async () => {
    await signIn();
    for (let i = 0; i < 10; i++) expect((await call({ code: "wrong" })).status).toBe(400);
    expect((await call({ code: "wrong" })).status).toBe(429);
  });
});
