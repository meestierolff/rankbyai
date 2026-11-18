import { writeFileSync } from "node:fs";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startCheckout } from "@/lib/checkout";
import { refundApprovalPending } from "@/lib/refund-approval";
import { admin, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "../db/helpers";

/**
 * A purchase and a refund made with the APP'S OWN Stripe key and the app's own calls, in test mode.
 * This is the check for a restricted key (rk_test_…): it must be allowed to open the checkout page
 * and to refund, and the webhook must deliver both. Skipped unless LIVE_STRIPE_PURCHASE=1.
 *
 * It needs a person (or a browser script) for one step: paying the checkout page with Stripe's test
 * card 4242 4242 4242 4242. The test writes the page address to LIVE_STRIPE_URL_FILE and waits.
 *
 * Before running, in two other terminals (add --project-name "<name>" if the CLI needs it):
 *
 *   STRIPE_WEBHOOK_SECRET=$(stripe listen --print-secret) npx next start --port 3101
 *   stripe listen --forward-to localhost:3101/api/webhooks/stripe
 *
 * Then:
 *   LIVE_STRIPE_PURCHASE=1 LIVE_STRIPE_URL_FILE=/tmp/checkout-url.txt \
 *     node --env-file=.env.stripe.test.local node_modules/vitest/vitest.mjs run tests/live/stripe-purchase-live.test.ts
 *
 * Not covered here: the sign-in cookie in front of /api/checkout and /api/billing/refund.
 */
const live = process.env.LIVE_STRIPE_PURCHASE === "1";
const key = process.env.STRIPE_SECRET_KEY ?? "";
const SITE = process.env.LIVE_STRIPE_SITE_URL ?? "http://localhost:3101";

async function waitFor<T>(what: string, read: () => Promise<T | null | undefined>, ms: number): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (v) return v;
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

let u: TestUser;
let stripe: Stripe;
let orderId = "";
let paymentIntent = "";
let priceCents = 0;

describe.skipIf(!live)("Stripe, a purchase and refund with the app's own key", () => {
  beforeAll(async () => {
    if (!/^(sk|rk)_test_/.test(key)) throw new Error("STRIPE_SECRET_KEY must be a TEST key for this test.");
    if (!process.env.STRIPE_PRODUCT_LIFETIME) throw new Error("STRIPE_PRODUCT_LIFETIME is not set.");
    stripe = new Stripe(key, { appInfo: { name: "RankbyAI", url: "https://rankbyai.live" } }); // as getStripe() builds it
    await resetData();
    u = await createTestUser("stripe-purchase");
  });
  afterAll(async () => {
    await resetData();
    await deleteTestUsers();
    await closePool();
  });

  it("the app opens a checkout page, and paying it grants lifetime access", async () => {
    const [offer] = await sql<{ current_price_cents: number }>("select current_price_cents from public.ladder_state");
    const result = await startCheckout(
      { userId: u.id, email: u.email.replace("@test.rankbyai.local", "@example.com"), workspaceId: u.workspaceId, workspacePlan: "locked", stripeCustomerId: null, productKey: "lifetime", expectedPriceCents: offer.current_price_cents },
      { admin, stripe, siteUrl: SITE, products: { lifetimeProductId: process.env.STRIPE_PRODUCT_LIFETIME! } },
    );
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    if (result.status !== 200) return;
    priceCents = result.body.price_cents;
    if (process.env.LIVE_STRIPE_URL_FILE) writeFileSync(process.env.LIVE_STRIPE_URL_FILE, result.body.url + "\n");
    console.log(`[live] checkout page for ${priceCents}c is open; waiting for it to be paid with the test card`);

    const order = await waitFor(
      "the paid order (pay the page in LIVE_STRIPE_URL_FILE with card 4242 4242 4242 4242)",
      async () => (await sql<{ id: string; status: string; amount_cents: number; stripe_payment_intent_id: string }>("select id, status, amount_cents, stripe_payment_intent_id from public.orders where workspace_id = $1", [u.workspaceId]))[0],
      12 * 60_000,
    );
    const [ws] = await sql<{ plan: string; lifetime_seat: number | null; stripe_customer_id: string | null }>("select plan, lifetime_seat, stripe_customer_id from public.workspaces where id = $1", [u.workspaceId]);
    console.log(`[live] order ${order.status} ${order.amount_cents}c, plan ${ws.plan}, seat ${ws.lifetime_seat}, customer ${ws.stripe_customer_id ? "saved" : "missing"}`);
    orderId = order.id;
    paymentIntent = order.stripe_payment_intent_id;
    expect(order.status).toBe("paid");
    expect(order.amount_cents).toBe(priceCents);
    expect(ws.plan).toBe("lifetime");
    expect(ws.lifetime_seat).toBe(1);
  }, 13 * 60_000);

  it("the app's refund call takes the access away again, or waits for the owner's approval", async () => {
    expect(paymentIntent).toMatch(/^pi_/);
    // The same call as src/app/api/billing/refund/route.ts.
    try {
      const refund = await stripe.refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: `refund:${orderId}` });
      expect(refund.status).toMatch(/succeeded|pending/);
    } catch (err) {
      // The account asks a person to approve refunds (Settings → Approvals in Stripe). The app reports
      // that to the buyer as "requested"; the refund itself runs when the owner approves it.
      const approval = refundApprovalPending(err);
      if (!approval) throw err;
      console.log(`[live] the refund waits for approval in the Stripe dashboard (${approval}); not refunded by this test`);
      return;
    }
    const refunded = await waitFor("the refund to arrive", async () => (await sql<{ status: string }>("select status from public.orders where id = $1 and status <> 'paid'", [orderId]))[0], 90_000);
    const [ws] = await sql<{ plan: string }>("select plan from public.workspaces where id = $1", [u.workspaceId]);
    console.log(`[live] after the refund: order ${refunded.status}, plan ${ws.plan}`);
    expect(refunded.status).toBe("refunded");
    expect(ws.plan).toBe("locked");
  }, 120_000);
});
