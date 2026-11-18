import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { admin, anon, closePool, createTestUser, deleteTestUsers, insertLifetimeOrders, resetData, sql, type TestUser } from "./helpers";
import { priceCentsFor, seatsLeftFor } from "@/lib/ladder";
import { startCheckout, type CheckoutDeps, type CheckoutInput } from "@/lib/checkout";

/** M1 acceptance (b) and (c): ladder maths in SQL, refunds still count, concurrent checkout. */
let seller: TestUser;
const buyers: TestUser[] = [];

const state = async () => {
  const { data, error } = await anon().from("ladder_state").select("*").single();
  if (error) throw error;
  return data as { sold_total: number; paid_total: number; current_price_cents: number; next_price_cents: number; seats_left_at_current_price: number; band_index: number };
};

/** A Stripe stand-in: no network, no account. It only records what we would have sent. */
function fakeStripe() {
  const created: { params: Stripe.Checkout.SessionCreateParams; options?: Stripe.RequestOptions }[] = [];
  const sessions = new Map<string, { id: string; url: string; status: string }>();
  return {
    created,
    client: {
      checkout: {
        sessions: {
          create: async (params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions) => {
            created.push({ params, options });
            const id = `cs_test_${randomUUID()}`;
            const s = { id, url: `https://checkout.stripe.test/${id}`, status: "open" };
            sessions.set(id, s);
            return s as unknown as Stripe.Response<Stripe.Checkout.Session>;
          },
          retrieve: async (id: string) => sessions.get(id) as unknown as Stripe.Response<Stripe.Checkout.Session>,
        },
      },
    } as unknown as CheckoutDeps["stripe"],
  };
}

const deps = (stripe: CheckoutDeps["stripe"]): CheckoutDeps => ({
  admin,
  stripe,
  siteUrl: "http://localhost:3100",
  products: { lifetimeProductId: "prod_test_lifetime", pack25PriceId: "price_test_25", pack100PriceId: "price_test_100" },
});

const input = (u: TestUser, expected: number): CheckoutInput => ({
  userId: u.id, email: u.email, workspaceId: u.workspaceId, workspacePlan: "locked",
  productKey: "lifetime", expectedPriceCents: expected,
});

beforeAll(async () => {
  await resetData();
  seller = await createTestUser("seed");
  for (let i = 0; i < 8; i++) buyers.push(await createTestUser(`buyer${i}`));
});
beforeEach(resetData);
afterAll(async () => {
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("ladder_state view (SQL) agrees with lib/ladder (TS)", () => {
  it("sale #1 $29, #5 $29, #6 $39, #11 $49", async () => {
    const seen: number[] = [];
    for (let sale = 1; sale <= 11; sale++) {
      const s = await state();
      seen.push(s.current_price_cents);
      expect(s.current_price_cents).toBe(priceCentsFor(sale - 1));
      expect(s.seats_left_at_current_price).toBe(seatsLeftFor(sale - 1));
      await insertLifetimeOrders(seller.workspaceId, 1);
    }
    expect(seen[0]).toBe(2900);
    expect(seen[4]).toBe(2900);
    expect(seen[5]).toBe(3900);
    expect(seen[10]).toBe(4900);
  });

  it("refunded orders still count, so a refund never lowers the price", async () => {
    await insertLifetimeOrders(seller.workspaceId, 5);
    expect((await state()).current_price_cents).toBe(3900);
    await sql("update public.orders set status = 'refunded' where ladder_seat in (1, 2, 3)");
    const s = await state();
    expect(s.current_price_cents).toBe(3900);
    expect(s.sold_total).toBe(5);
  });

  it("an active checkout hold takes a seat; an expired or released one gives it back", async () => {
    const { data } = await admin.rpc("ladder_reserve", { p_user_id: buyers[0].id, p_workspace_id: buyers[0].workspaceId, p_expected_price_cents: 2900 });
    expect(data.ok).toBe(true);
    let s = await state();
    expect(s.sold_total).toBe(1);
    expect(s.paid_total).toBe(0);
    await sql("update public.ladder_holds set expires_at = now() - interval '1 second'");
    s = await state();
    expect(s.sold_total).toBe(0);
  });

  it("ladder terms are frozen after the first sale", async () => {
    await sql("update public.ladder_lock set base_price_cents = 4900 where id = 1"); // allowed before any sale
    expect((await state()).current_price_cents).toBe(4900);
    await sql("update public.ladder_lock set base_price_cents = 2900 where id = 1");
    await insertLifetimeOrders(seller.workspaceId, 1);
    await expect(sql("update public.ladder_lock set base_price_cents = 1900 where id = 1")).rejects.toThrow(/frozen/);
  });

  it("refuses new seats after the close date", async () => {
    await sql("update public.ladder_lock set closes_at = now() - interval '1 minute' where id = 1");
    const r = await startCheckout(input(buyers[0], 2900), deps(fakeStripe().client));
    expect(r.status).toBe(410);
  });
});

describe("checkout race (acceptance c)", () => {
  it("rejects a stale price with 409 price_changed and tells the client the current price", async () => {
    await insertLifetimeOrders(seller.workspaceId, 5);
    const r = await startCheckout(input(buyers[0], 2900), deps(fakeStripe().client));
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: "price_changed", current_price_cents: 3900 });
  });

  it("with one $29 seat left, 6 simultaneous buyers: exactly one gets $29, the rest get 409", async () => {
    await insertLifetimeOrders(seller.workspaceId, 4);
    const stripe = fakeStripe();
    const results = await Promise.all(buyers.slice(0, 6).map((u) => startCheckout(input(u, 2900), deps(stripe.client))));
    const ok = results.filter((r) => r.status === 200);
    const changed = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(changed).toHaveLength(5);
    for (const c of changed) expect(c.body).toEqual({ error: "price_changed", current_price_cents: 3900 });
    // The amount sent to Stripe comes from the database, not the client.
    expect(stripe.created).toHaveLength(1);
    expect(stripe.created[0].params.line_items?.[0].price_data?.unit_amount).toBe(2900);
    const s = await state();
    expect(s.sold_total).toBe(5);
    expect(s.current_price_cents).toBe(3900);
  });

  it("8 simultaneous buyers on a fresh ladder: never more than 5 seats at $29", async () => {
    const stripe = fakeStripe();
    const first = await Promise.all(buyers.map((u) => startCheckout(input(u, 2900), deps(stripe.client))));
    expect(first.filter((r) => r.status === 200)).toHaveLength(5);
    expect(first.filter((r) => r.status === 409)).toHaveLength(3);
    // The three who lost the race confirm the new price and get the next tier.
    const losers = buyers.filter((_, i) => first[i].status === 409);
    const second = await Promise.all(losers.map((u) => startCheckout(input(u, 3900), deps(stripe.client))));
    expect(second.every((r) => r.status === 200)).toBe(true);
    const prices = await sql<{ price_cents: number; n: number }>(
      "select price_cents, count(*)::int as n from public.ladder_holds where not released group by 1 order by 1",
    );
    expect(prices).toEqual([{ price_cents: 2900, n: 5 }, { price_cents: 3900, n: 3 }]);
  });

  it("a buyer who clicks twice gets the same session and holds one seat", async () => {
    const stripe = fakeStripe();
    const r1 = await startCheckout(input(buyers[0], 2900), deps(stripe.client));
    const r2 = await startCheckout(input(buyers[0], 2900), deps(stripe.client));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect((r2.body as { session_id: string }).session_id).toBe((r1.body as { session_id: string }).session_id);
    expect(stripe.created).toHaveLength(1);
    expect((await state()).sold_total).toBe(1);
  });

  it("sends Stripe the session shape the brief requires", async () => {
    const stripe = fakeStripe();
    await startCheckout(input(buyers[0], 2900), deps(stripe.client));
    const { params, options } = stripe.created[0];
    expect(params).toMatchObject({
      mode: "payment",
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      invoice_creation: { enabled: true },
      allow_promotion_codes: false,
      customer_creation: "always",
      customer_email: buyers[0].email,
      cancel_url: "http://localhost:3100/#pricing",
    });
    expect(params.success_url).toContain("/app/thanks?session_id={CHECKOUT_SESSION_ID}");
    expect(params.line_items?.[0].price_data).toMatchObject({ currency: "usd", product: "prod_test_lifetime", tax_behavior: "exclusive" });
    expect(params.metadata).toMatchObject({ app: "rankbyai", workspace_id: buyers[0].workspaceId, user_id: buyers[0].id, product_key: "lifetime", ladder_price_cents: "2900" });
    expect(params.payment_intent_data?.metadata).toEqual(params.metadata);
    expect(options?.idempotencyKey).toMatch(/^checkout:.+:lifetime:.+/);
    const minutes = ((params.expires_at ?? 0) * 1000 - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThanOrEqual(30);
  });

  it("packs require lifetime access", async () => {
    const r = await startCheckout({ ...input(buyers[0], 0), productKey: "pack_25", expectedPriceCents: undefined }, deps(fakeStripe().client));
    expect(r.status).toBe(403);
  });
});
