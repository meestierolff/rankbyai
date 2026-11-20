import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { claimPurchaseConversion, claimSignupConversion } from "@/lib/conversions-server";

/** Signup and purchase conversions are reported once, and carry the campaign attribution. */
let u: TestUser;
let other: TestUser;
const attr = { utm_source: "google", utm_medium: "cpc", gclid: "abc123", landing_path: "/local-rank-tracker", first_seen: "2026-11-20T12:00:00.000Z" };

beforeAll(async () => {
  await resetData();
  u = await createTestUser("conv");
  other = await createTestUser("conv-other");
});
beforeEach(async () => {
  await resetData();
  await sql("update public.profiles set attribution = null, signup_reported_at = null, created_at = now() where id = any($1)", [[u.id, other.id]]);
});
afterAll(async () => {
  await resetData();
  await deleteTestUsers();
  await closePool();
});

async function order(workspaceId: string) {
  const [o] = await sql<{ id: string }>(
    `insert into public.orders (workspace_id, product_key, amount_cents, status, stripe_checkout_session_id) values ($1, 'lifetime', 2900, 'paid', 'cs_test_' || gen_random_uuid()) returning id`,
    [workspaceId],
  );
  return o.id;
}

describe("signup conversion", () => {
  it("is reported once per new account and stores the attribution with it", async () => {
    expect(await claimSignupConversion(u.id, attr)).toEqual({ first: true });
    expect(await claimSignupConversion(u.id, attr)).toEqual({ first: false });
    const [p] = await sql<{ attribution: unknown; signup_reported_at: string | null }>("select attribution, signup_reported_at from public.profiles where id = $1", [u.id]);
    expect(p.attribution).toEqual(attr);
    expect(p.signup_reported_at).not.toBeNull();
  });

  it("concurrent requests: exactly one is first", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => claimSignupConversion(u.id, null)));
    expect(results.filter((r) => r.first)).toHaveLength(1);
  });

  it("accounts that existed before are never reported as new signups", async () => {
    await sql("update public.profiles set created_at = now() - interval '3 days' where id = $1", [u.id]);
    expect(await claimSignupConversion(u.id, attr)).toEqual({ first: false });
    expect((await sql<{ attribution: unknown }>("select attribution from public.profiles where id = $1", [u.id]))[0].attribution).toBeNull();
  });
});

describe("purchase conversion", () => {
  it("is reported once per order, with the buyer's signup attribution", async () => {
    await claimSignupConversion(u.id, attr);
    const id = await order(u.workspaceId);
    expect(await claimPurchaseConversion({ orderId: id, workspaceId: u.workspaceId, userId: u.id, cookie: null })).toEqual({ first: true });
    expect(await claimPurchaseConversion({ orderId: id, workspaceId: u.workspaceId, userId: u.id, cookie: null })).toEqual({ first: false });
    expect((await sql<{ attribution: unknown }>("select attribution from public.orders where id = $1", [id]))[0].attribution).toEqual(attr);
  });

  it("uses the cookie when the account has no attribution, and nothing when neither exists", async () => {
    const a = await order(u.workspaceId);
    await claimPurchaseConversion({ orderId: a, workspaceId: u.workspaceId, userId: u.id, cookie: { utm_source: "newsletter" } });
    expect((await sql<{ attribution: unknown }>("select attribution from public.orders where id = $1", [a]))[0].attribution).toEqual({ utm_source: "newsletter" });
    const b = await order(u.workspaceId);
    await claimPurchaseConversion({ orderId: b, workspaceId: u.workspaceId, userId: u.id, cookie: null });
    expect((await sql<{ attribution: unknown }>("select attribution from public.orders where id = $1", [b]))[0].attribution).toBeNull();
  });

  it("an order of another workspace is never claimed", async () => {
    const id = await order(other.workspaceId);
    expect(await claimPurchaseConversion({ orderId: id, workspaceId: u.workspaceId, userId: u.id, cookie: null })).toEqual({ first: false });
    expect((await sql<{ conversion_reported_at: string | null }>("select conversion_reported_at from public.orders where id = $1", [id]))[0].conversion_reported_at).toBeNull();
  });
});
