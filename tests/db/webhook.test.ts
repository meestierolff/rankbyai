import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { admin, anon, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { claimEvent, handleStripeEvent, markEventProcessed } from "@/lib/stripe-webhook";

/**
 * M1 acceptance (d), as far as it can be proven without a Stripe account: a signed
 * checkout.session.completed event sets plan lifetime + seat 1; replaying it changes nothing.
 * (The real 4242 test-card purchase still needs the operator's Stripe test keys.)
 */
const SECRET = "whsec_test_" + randomUUID().replace(/-/g, "");
const verifier = new Stripe("sk_test_signature_verification_only");

let u: TestUser;
let u2: TestUser;

function signedEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  const payload = JSON.stringify({ id: `evt_${randomUUID()}`, object: "event", type, data: { object } });
  const header = verifier.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return verifier.webhooks.constructEvent(payload, header, SECRET);
}

async function process(event: Stripe.Event, hooks: { purchases?: unknown[]; refunds?: unknown[] } = {}) {
  if ((await claimEvent(admin, event)) === "skip") return { skipped: true as const };
  const outcome = await handleStripeEvent(event, {
    admin,
    onPurchase: (p) => void hooks.purchases?.push(p),
    onRefund: (p) => void hooks.refunds?.push(p),
  });
  await markEventProcessed(admin, event.id);
  return { skipped: false as const, outcome };
}

async function reserve(user: TestUser, price: number) {
  const { data } = await admin.rpc("ladder_reserve", { p_user_id: user.id, p_workspace_id: user.workspaceId, p_expected_price_cents: price });
  if (!data.ok) throw new Error("reserve failed: " + JSON.stringify(data));
  const sessionId = `cs_test_${randomUUID()}`;
  await admin.rpc("ladder_attach_session", { p_hold_id: data.hold_id, p_session_id: sessionId });
  return { holdId: data.hold_id as string, sessionId };
}

const lifetimeSession = (user: TestUser, sessionId: string, holdId: string, pi: string, over: Record<string, unknown> = {}) => ({
  id: sessionId, object: "checkout.session", payment_status: "paid", payment_intent: pi, customer: "cus_test_1",
  amount_subtotal: 2900, amount_total: 3509, currency: "usd",
  total_details: { amount_tax: 609, amount_discount: 0, amount_shipping: 0 },
  customer_details: { email: user.email },
  metadata: { app: "rankbyai", workspace_id: user.workspaceId, user_id: user.id, product_key: "lifetime", ladder_price_cents: "2900", hold_id: holdId },
  ...over,
});

const ws = async (id: string) => (await sql<{ plan: string; lifetime_seat: number | null; stripe_customer_id: string | null }>(
  "select plan, lifetime_seat, stripe_customer_id from public.workspaces where id = $1", [id]))[0];

beforeAll(async () => {
  await resetData();
  u = await createTestUser("payer");
  u2 = await createTestUser("payer2");
});
beforeEach(resetData);
afterAll(async () => {
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("signature", () => {
  it("rejects a payload signed with the wrong secret", () => {
    const payload = JSON.stringify({ id: "evt_x", object: "event", type: "checkout.session.completed", data: { object: {} } });
    const header = verifier.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
    expect(() => verifier.webhooks.constructEvent(payload, header, SECRET)).toThrow();
  });

  it("rejects a tampered payload", () => {
    const payload = JSON.stringify({ id: "evt_x", object: "event", type: "t", data: { object: { amount: 1 } } });
    const header = verifier.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect(() => verifier.webhooks.constructEvent(payload.replace('"amount":1', '"amount":0'), header, SECRET)).toThrow();
  });
});

describe("checkout.session.completed → lifetime", () => {
  it("sets plan lifetime, seat 1, records tax, converts the hold; a replay changes nothing", async () => {
    const { holdId, sessionId } = await reserve(u, 2900);
    const pi = `pi_test_${randomUUID()}`;
    const event = signedEvent("checkout.session.completed", lifetimeSession(u, sessionId, holdId, pi));
    const purchases: unknown[] = [];

    const first = await process(event, { purchases });
    expect(first.skipped).toBe(false);
    expect(await ws(u.workspaceId)).toEqual({ plan: "lifetime", lifetime_seat: 1, stripe_customer_id: "cus_test_1" });
    const orders = await sql("select product_key, amount_cents, tax_cents, status, ladder_seat, ladder_price_cents from public.orders");
    expect(orders).toEqual([{ product_key: "lifetime", amount_cents: 2900, tax_cents: 609, status: "paid", ladder_seat: 1, ladder_price_cents: 2900 }]);
    expect(purchases).toHaveLength(1);

    const snapshot = async () => ({
      orders: await sql("select * from public.orders order by created_at"),
      ents: await sql("select * from public.entitlements order by created_at"),
      holds: await sql("select * from public.ladder_holds order by created_at"),
      ws: await ws(u.workspaceId),
      ladder: (await anon().from("ladder_state").select("*").single()).data,
    });
    const before = await snapshot();

    // 1) exact same event again → skipped by event id
    expect((await process(event, { purchases })).skipped).toBe(true);
    // 2) Stripe re-delivers as a NEW event id for the same session → handler is idempotent
    const again = await process(signedEvent("checkout.session.completed", lifetimeSession(u, sessionId, holdId, pi)), { purchases });
    expect(again.skipped).toBe(false);
    expect(again.outcome?.note).toContain("replay");

    expect(await snapshot()).toEqual(before);
    expect(purchases).toHaveLength(1); // no second welcome email
    expect(before.ladder).toMatchObject({ sold_total: 1, paid_total: 1 }); // hold converted, not double-counted
  });

  it("assigns seats in payment order across buyers", async () => {
    const a = await reserve(u, 2900);
    const b = await reserve(u2, 2900);
    await process(signedEvent("checkout.session.completed", lifetimeSession(u2, b.sessionId, b.holdId, `pi_${randomUUID()}`)));
    await process(signedEvent("checkout.session.completed", lifetimeSession(u, a.sessionId, a.holdId, `pi_${randomUUID()}`)));
    expect((await ws(u2.workspaceId)).lifetime_seat).toBe(1);
    expect((await ws(u.workspaceId)).lifetime_seat).toBe(2);
  });

  it("does not grant access for an unpaid session", async () => {
    const { holdId, sessionId } = await reserve(u, 2900);
    const r = await process(signedEvent("checkout.session.completed", lifetimeSession(u, sessionId, holdId, "pi_unpaid", { payment_status: "unpaid" })));
    expect(r.outcome?.handled).toBe(false);
    expect((await ws(u.workspaceId)).plan).toBe("locked");
  });

  it("ignores sessions without our metadata", async () => {
    const r = await process(signedEvent("checkout.session.completed", { id: "cs_foreign", payment_status: "paid", metadata: {} }));
    expect(r.outcome?.handled).toBe(false);
    expect(await sql("select 1 from public.orders")).toEqual([]);
  });

  it("ignores a paid session from another product in the same Stripe account, even with the same metadata names", async () => {
    const { holdId, sessionId } = await reserve(u, 2900);
    const foreign = lifetimeSession(u, sessionId, holdId, "pi_foreign");
    const unmarked: Record<string, string> = { ...foreign.metadata };
    delete unmarked.app;
    for (const metadata of [{ ...foreign.metadata, app: "another-product" }, unmarked]) {
      const r = await process(signedEvent("checkout.session.completed", { ...foreign, metadata }));
      expect(r.outcome).toMatchObject({ handled: false, note: "not a RankbyAI checkout" });
    }
    expect(await sql("select 1 from public.orders")).toEqual([]);
    expect((await ws(u.workspaceId)).plan).toBe("locked");
  });
});

describe("expired sessions and refunds", () => {
  it("checkout.session.expired releases the hold and frees the seat", async () => {
    const { sessionId } = await reserve(u, 2900);
    expect((await anon().from("ladder_state").select("sold_total").single()).data?.sold_total).toBe(1);
    await process(signedEvent("checkout.session.expired", { id: sessionId, object: "checkout.session" }));
    expect((await anon().from("ladder_state").select("sold_total").single()).data?.sold_total).toBe(0);
  });

  it("full refund locks the workspace, keeps the data, and the seat still counts", async () => {
    const { holdId, sessionId } = await reserve(u, 2900);
    const pi = `pi_test_${randomUUID()}`;
    await process(signedEvent("checkout.session.completed", lifetimeSession(u, sessionId, holdId, pi)));
    const refunds: unknown[] = [];
    const refundEvent = signedEvent("charge.refunded", { id: "ch_test_1", object: "charge", payment_intent: pi, refunded: true, amount: 3509, amount_refunded: 3509 });
    await process(refundEvent, { refunds });
    expect((await ws(u.workspaceId)).plan).toBe("locked");
    expect((await sql<{ status: string }>("select status from public.orders"))[0].status).toBe("refunded");
    const ladder = (await anon().from("ladder_state").select("*").single()).data;
    expect(ladder).toMatchObject({ sold_total: 1, paid_total: 1, current_price_cents: 2900 });
    // replay as a new event
    await process(signedEvent("charge.refunded", { id: "ch_test_1", object: "charge", payment_intent: pi, refunded: true }), { refunds });
    expect(refunds).toHaveLength(1);
  });

  it("partial refund is logged only: access stays", async () => {
    const { holdId, sessionId } = await reserve(u, 2900);
    const pi = `pi_test_${randomUUID()}`;
    await process(signedEvent("checkout.session.completed", lifetimeSession(u, sessionId, holdId, pi)));
    await process(signedEvent("charge.refunded", { id: "ch_test_2", object: "charge", payment_intent: pi, refunded: false, amount_refunded: 500 }));
    expect((await ws(u.workspaceId)).plan).toBe("lifetime");
    expect((await sql<{ status: string }>("select status from public.orders"))[0].status).toBe("partially_refunded");
  });
});

describe("packs and credits", () => {
  const packSession = (user: TestUser, sessionId: string, pi: string, key: "pack_25" | "pack_100") => ({
    id: sessionId, object: "checkout.session", payment_status: "paid", payment_intent: pi, customer: "cus_test_1",
    amount_subtotal: key === "pack_25" ? 1900 : 5900, currency: "usd", total_details: { amount_tax: 0 },
    customer_details: { email: user.email },
    metadata: { app: "rankbyai", workspace_id: user.workspaceId, user_id: user.id, product_key: key },
  });
  const balance = async (wsId: string) => (await admin.rpc("credit_balance", { p_workspace_id: wsId })).data as number;

  it("grants credits once, even when the event is delivered twice", async () => {
    const sessionId = `cs_test_${randomUUID()}`;
    const pi = `pi_test_${randomUUID()}`;
    await process(signedEvent("checkout.session.completed", packSession(u, sessionId, pi, "pack_25")));
    await process(signedEvent("checkout.session.completed", packSession(u, sessionId, pi, "pack_25")));
    expect(await balance(u.workspaceId)).toBe(25);
  });

  it("use_credits is atomic: 30 parallel debits of 1 against a balance of 25 → exactly 25 succeed", async () => {
    await process(signedEvent("checkout.session.completed", packSession(u, `cs_test_${randomUUID()}`, `pi_test_${randomUUID()}`, "pack_25")));
    const results = await Promise.all(
      Array.from({ length: 30 }, () => admin.rpc("use_credits", { p_workspace_id: u.workspaceId, p_n: 1, p_reason: "test" })),
    );
    expect(results.filter((r) => r.data === true)).toHaveLength(25);
    expect(results.filter((r) => r.data === false)).toHaveLength(5);
    expect(await balance(u.workspaceId)).toBe(0);
  });

  it("refunding a pack claws back only the unused remainder, never below zero", async () => {
    const pi = `pi_test_${randomUUID()}`;
    await process(signedEvent("checkout.session.completed", packSession(u, `cs_test_${randomUUID()}`, pi, "pack_25")));
    await admin.rpc("use_credits", { p_workspace_id: u.workspaceId, p_n: 10, p_reason: "test" });
    await process(signedEvent("charge.refunded", { id: "ch_pack", object: "charge", payment_intent: pi, refunded: true }));
    expect(await balance(u.workspaceId)).toBe(0);
  });
});
