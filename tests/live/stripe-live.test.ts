import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "../db/helpers";

/**
 * A REAL Stripe test-mode payment and refund, delivered to the running app by Stripe itself.
 * Nothing here is simulated: Stripe signs the events, the app's webhook route verifies them and
 * the local database is fulfilled. Skipped unless LIVE_STRIPE=1. No real money moves (test mode).
 *
 * Before running, in two other terminals (add --project-name "<name>" if the CLI needs it):
 *
 *   STRIPE_WEBHOOK_SECRET=$(stripe listen --print-secret) npm run dev      (or: npm run build && npx next start --port 3100)
 *   stripe listen --forward-to localhost:3100/api/webhooks/stripe
 *
 * Then:  LIVE_STRIPE=1 STRIPE_PRODUCT_LIFETIME=prod_... npx vitest run tests/live/stripe-live.test.ts
 */
const live = process.env.LIVE_STRIPE === "1";
const cli = (args: string[]) =>
  execFileSync("stripe", [...args, ...(process.env.STRIPE_CLI_PROJECT ? ["--project-name", process.env.STRIPE_CLI_PROJECT] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

async function waitFor<T>(what: string, read: () => Promise<T | null | undefined>, ms = 45_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (v) return v;
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}. Is the app running with the listener's signing secret, and is "stripe listen" forwarding?`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

let u: TestUser;
let holdId = "";
let priceCents = 0;

describe.skipIf(!live)("Stripe, real test-mode payment through the webhook", () => {
  beforeAll(async () => {
    await resetData();
    u = await createTestUser("stripe-live");
  });
  afterAll(async () => {
    await resetData();
    await deleteTestUsers();
    await closePool();
  });

  it("a paid checkout grants lifetime access with seat 1", async () => {
    const offer = await sql<{ current_price_cents: number }>("select current_price_cents from public.ladder_state");
    const { data, error } = await admin.rpc("ladder_reserve", { p_user_id: u.id, p_workspace_id: u.workspaceId, p_expected_price_cents: offer[0].current_price_cents });
    if (error) throw error;
    const hold = data as { ok: boolean; hold_id: string; price_cents: number };
    expect(hold.ok).toBe(true);
    holdId = hold.hold_id;
    priceCents = hold.price_cents;

    // Stripe's own fixture buys 2 of a price; halve the unit amount so the total is the ladder price.
    cli([
      "trigger", "checkout.session.completed",
      ...(process.env.STRIPE_PRODUCT_LIFETIME ? ["--skip", "product", "--override", `price:product=${process.env.STRIPE_PRODUCT_LIFETIME}`] : []),
      "--override", `price:unit_amount=${priceCents / 2}`,
      "--override", `payment_page_confirm:expected_amount=${priceCents}`,
      "--add", `checkout_session:metadata.workspace_id=${u.workspaceId}`,
      "--add", `checkout_session:metadata.user_id=${u.id}`,
      "--add", "checkout_session:metadata.product_key=lifetime",
      "--add", `checkout_session:metadata.hold_id=${holdId}`,
      "--add", `checkout_session:metadata.ladder_price_cents=${priceCents}`,
    ]);

    const order = await waitFor("the order", async () => (await sql<{ status: string; amount_cents: number; stripe_payment_intent_id: string; product_key: string }>("select status, amount_cents, stripe_payment_intent_id, product_key from public.orders where workspace_id = $1", [u.workspaceId]))[0]);
    const [ws] = await sql<{ plan: string; lifetime_seat: number | null }>("select plan, lifetime_seat from public.workspaces where id = $1", [u.workspaceId]);
    const [holdRow] = await sql<{ released: boolean; converted_order_id: string | null }>("select released, converted_order_id from public.ladder_holds where id = $1", [holdId]);
    console.log(`[live] order: ${order.product_key} ${order.status} ${order.amount_cents}c, payment ${order.stripe_payment_intent_id.slice(0, 10)}…, plan ${ws.plan}, seat ${ws.lifetime_seat}`);
    expect(order.status).toBe("paid");
    expect(order.amount_cents).toBe(priceCents);
    expect(order.stripe_payment_intent_id).toMatch(/^pi_/);
    expect(ws.plan).toBe("lifetime");
    expect(ws.lifetime_seat).toBe(1);
    expect(holdRow.converted_order_id).toBeTruthy();
  }, 120_000);

  it("Stripe delivering the same event again changes nothing", async () => {
    const [event] = await sql<{ id: string }>("select id from public.stripe_events where type = 'checkout.session.completed' and processed_at is not null");
    expect(event?.id).toMatch(/^evt_/);
    cli(["events", "resend", event.id]);
    await new Promise((r) => setTimeout(r, 6000)); // give the second delivery time to arrive
    const [{ n }] = await sql<{ n: number }>("select count(*)::int as n from public.orders where workspace_id = $1", [u.workspaceId]);
    const [ws] = await sql<{ plan: string; lifetime_seat: number | null }>("select plan, lifetime_seat from public.workspaces where id = $1", [u.workspaceId]);
    const [state] = await sql<{ sold_total: number }>("select sold_total from public.ladder_state");
    console.log(`[live] after a second delivery: ${n} order, seat ${ws.lifetime_seat}, ${state.sold_total} sold`);
    expect(n).toBe(1);
    expect(ws.lifetime_seat).toBe(1);
    expect(Number(state.sold_total)).toBe(1);
  }, 60_000);

  it("a full refund takes the access away again", async () => {
    const [order] = await sql<{ stripe_payment_intent_id: string }>("select stripe_payment_intent_id from public.orders where workspace_id = $1", [u.workspaceId]);
    cli(["refunds", "create", "--payment-intent", order.stripe_payment_intent_id]);
    const refunded = await waitFor("the refund", async () => (await sql<{ status: string }>("select status from public.orders where workspace_id = $1 and status <> 'paid'", [u.workspaceId]))[0]);
    const [ws] = await sql<{ plan: string }>("select plan from public.workspaces where id = $1", [u.workspaceId]);
    console.log(`[live] after refund: order ${refunded.status}, plan ${ws.plan}`);
    expect(refunded.status).toBe("refunded");
    expect(ws.plan).toBe("locked");
  }, 120_000);
});
