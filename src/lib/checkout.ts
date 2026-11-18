import type Stripe from "stripe";
import type { Db } from "@/lib/db/clients";
import { PACKS, type PackKey } from "@/lib/pricing-constants";

/**
 * Checkout orchestration, kept free of framework imports so it can be tested with a
 * real database and a fake Stripe client.
 *
 * The client never sends an amount we trust: it sends the price it was SHOWN
 * (`expectedPriceCents`) and the database decides, under a row lock, whether that
 * is still the price. If not → 409 price_changed and the buyer confirms the new one.
 */
export type ProductKey = "lifetime" | PackKey;

export interface CheckoutInput {
  userId: string;
  email: string;
  workspaceId: string;
  workspacePlan: "locked" | "lifetime";
  stripeCustomerId?: string | null;
  productKey: ProductKey;
  expectedPriceCents?: number;
}

export interface CheckoutDeps {
  admin: Db;
  stripe: { checkout: { sessions: Pick<Stripe.Checkout.SessionResource, "create" | "retrieve"> } };
  siteUrl: string;
  products: { lifetimeProductId: string; pack25PriceId?: string; pack100PriceId?: string };
  now?: () => Date;
}

export type CheckoutResult =
  | { status: 200; body: { url: string; price_cents: number; session_id: string } }
  | { status: 409; body: { error: "price_changed"; current_price_cents: number } }
  | { status: 400 | 403 | 409 | 410 | 502 | 503; body: { error: string; message: string } };

/**
 * Marks a checkout as ours. A Stripe account can serve several products, and then their payment
 * events reach this site's webhook too. The webhook fulfils only sessions that carry this marker.
 */
export const CHECKOUT_APP = "rankbyai";

const SESSION_MINUTES = 31; // Stripe's minimum is 30; the ladder hold lasts 40.

interface ReserveResult {
  ok: boolean;
  error?: "price_changed" | "closed" | "already_lifetime";
  current_price_cents?: number;
  hold_id?: string;
  price_cents?: number;
  session_id?: string | null;
  reused?: boolean;
}

function baseParams(input: CheckoutInput, deps: CheckoutDeps, metadata: Record<string, string>): Stripe.Checkout.SessionCreateParams {
  const now = deps.now?.() ?? new Date();
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    invoice_creation: { enabled: true },
    allowed_payment_method_types: ["card", "link"], // cards + Link only; wallets (Apple Pay, Google Pay) ride on "card"
    allow_promotion_codes: false,
    metadata,
    payment_intent_data: { metadata },
    success_url: `${deps.siteUrl}/app/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${deps.siteUrl}/#pricing`,
    expires_at: Math.floor(now.getTime() / 1000) + SESSION_MINUTES * 60,
  };
  if (input.stripeCustomerId) {
    params.customer = input.stripeCustomerId;
    params.customer_update = { address: "auto", name: "auto" };
  } else {
    params.customer_email = input.email;
    params.customer_creation = "always";
  }
  return params;
}

async function startLifetime(input: CheckoutInput, deps: CheckoutDeps): Promise<CheckoutResult> {
  if (input.workspacePlan === "lifetime") {
    return { status: 409, body: { error: "already_lifetime", message: "This workspace already has lifetime access." } };
  }
  if (!Number.isInteger(input.expectedPriceCents) || (input.expectedPriceCents ?? 0) <= 0) {
    return { status: 400, body: { error: "expected_price_required", message: "Send the price you were shown as expected_price_cents." } };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await deps.admin.rpc("ladder_reserve", {
      p_user_id: input.userId,
      p_workspace_id: input.workspaceId,
      p_expected_price_cents: input.expectedPriceCents,
    });
    if (error) return { status: 503, body: { error: "ladder_unavailable", message: "Could not reserve a seat. Try again." } };
    const res = data as ReserveResult;

    if (!res.ok) {
      if (res.error === "price_changed") {
        return { status: 409, body: { error: "price_changed", current_price_cents: res.current_price_cents ?? 0 } };
      }
      if (res.error === "closed") {
        return { status: 410, body: { error: "closed", message: "The lifetime deal has closed." } };
      }
      return { status: 409, body: { error: res.error ?? "unavailable", message: "This workspace already has lifetime access." } };
    }

    const holdId = res.hold_id!;
    const priceCents = res.price_cents!;

    // Buyer already has an open session for this hold: send them back to it.
    if (res.reused && res.session_id) {
      try {
        const existing = await deps.stripe.checkout.sessions.retrieve(res.session_id);
        if (existing.status === "open" && existing.url) {
          return { status: 200, body: { url: existing.url, price_cents: priceCents, session_id: existing.id } };
        }
      } catch {
        // fall through: release and reserve again
      }
      await deps.admin.rpc("ladder_release_hold", { p_hold_id: holdId });
      continue;
    }

    const metadata = {
      app: CHECKOUT_APP,
      workspace_id: input.workspaceId,
      user_id: input.userId,
      product_key: "lifetime",
      ladder_price_cents: String(priceCents),
      hold_id: holdId,
    };
    try {
      const session = await deps.stripe.checkout.sessions.create(
        {
          ...baseParams(input, deps, metadata),
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                product: deps.products.lifetimeProductId,
                unit_amount: priceCents, // decided by the database, never by the client
                tax_behavior: "exclusive",
              },
            },
          ],
        },
        { idempotencyKey: `checkout:${input.userId}:lifetime:${holdId}` },
      );
      if (!session.url) throw new Error("no session url");
      await deps.admin.rpc("ladder_attach_session", { p_hold_id: holdId, p_session_id: session.id });
      return { status: 200, body: { url: session.url, price_cents: priceCents, session_id: session.id } };
    } catch {
      await deps.admin.rpc("ladder_release_hold", { p_hold_id: holdId });
      return { status: 502, body: { error: "stripe_error", message: "The payment page could not be created. You were not charged." } };
    }
  }
  return { status: 503, body: { error: "ladder_unavailable", message: "Could not reserve a seat. Try again." } };
}

async function startPack(input: CheckoutInput, deps: CheckoutDeps, key: PackKey): Promise<CheckoutResult> {
  if (input.workspacePlan !== "lifetime") {
    return { status: 403, body: { error: "lifetime_required", message: "Scan packs require lifetime access." } };
  }
  const priceId = key === "pack_25" ? deps.products.pack25PriceId : deps.products.pack100PriceId;
  if (!priceId) {
    return { status: 503, body: { error: "pack_not_configured", message: `Set ${key === "pack_25" ? "STRIPE_PRICE_PACK_25" : "STRIPE_PRICE_PACK_100"}.` } };
  }
  const now = deps.now?.() ?? new Date();
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const metadata = {
    app: CHECKOUT_APP,
    workspace_id: input.workspaceId,
    user_id: input.userId,
    product_key: key,
    credits: String(PACKS[key].credits),
  };
  try {
    const session = await deps.stripe.checkout.sessions.create(
      { ...baseParams(input, deps, metadata), line_items: [{ quantity: 1, price: priceId }] },
      { idempotencyKey: `checkout:${input.userId}:${key}:${minuteBucket}` },
    );
    if (!session.url) throw new Error("no session url");
    return { status: 200, body: { url: session.url, price_cents: PACKS[key].priceCents, session_id: session.id } };
  } catch {
    return { status: 502, body: { error: "stripe_error", message: "The payment page could not be created. You were not charged." } };
  }
}

export async function startCheckout(input: CheckoutInput, deps: CheckoutDeps): Promise<CheckoutResult> {
  if (input.productKey === "lifetime") return startLifetime(input, deps);
  return startPack(input, deps, input.productKey);
}
