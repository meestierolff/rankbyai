import type Stripe from "stripe";
import type { Db } from "@/lib/db/clients";
import { PACKS, type PackKey } from "@/lib/pricing-constants";

/**
 * Stripe event handling. Every branch is replay-safe: the database functions it calls
 * are idempotent per checkout session / payment intent, so a duplicate or re-delivered
 * event changes nothing. Access is granted ONLY here, never from the success URL.
 */
export interface WebhookDeps {
  admin: Db;
  onPurchase?: (p: { workspaceId: string; email: string | null; productKey: string; amountCents: number; seat: number | null }) => Promise<void> | void;
  onRefund?: (p: { workspaceId: string; productKey: string; amountCents: number }) => Promise<void> | void;
}

export interface WebhookOutcome {
  handled: boolean;
  note: string;
  ladderChanged?: boolean;
}

const idOf = (v: string | { id: string } | null | undefined): string | null => (typeof v === "string" ? v : (v?.id ?? null));

async function fulfil(session: Stripe.Checkout.Session, deps: WebhookDeps): Promise<WebhookOutcome> {
  if (session.payment_status !== "paid") return { handled: false, note: "session not paid yet" };
  const md = session.metadata ?? {};
  const workspaceId = md.workspace_id;
  const userId = md.user_id;
  const productKey = md.product_key;
  if (!workspaceId || !userId || !productKey) return { handled: false, note: "missing metadata (not a RankbyAI checkout)" };

  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const amount = session.amount_subtotal ?? 0;
  const tax = session.total_details?.amount_tax ?? 0;
  const common = {
    p_session_id: session.id,
    p_payment_intent_id: idOf(session.payment_intent),
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_email: email,
    p_amount_cents: amount,
    p_tax_cents: tax,
    p_currency: session.currency ?? "usd",
    p_customer_id: idOf(session.customer),
  };

  if (productKey === "lifetime") {
    const { data, error } = await deps.admin.rpc("assign_ladder_seat", { ...common, p_hold_id: md.hold_id ?? null });
    if (error) throw new Error(`assign_ladder_seat failed: ${error.message}`);
    const res = data as { order_id: string; seat: number; replayed: boolean };
    if (!res.replayed) await deps.onPurchase?.({ workspaceId, email, productKey, amountCents: amount, seat: res.seat });
    return { handled: true, note: res.replayed ? "replay: order already exists" : `lifetime seat ${res.seat}`, ladderChanged: !res.replayed };
  }

  if (productKey in PACKS) {
    const pack = PACKS[productKey as PackKey];
    const { data, error } = await deps.admin.rpc("fulfill_pack_order", {
      ...common,
      p_product_key: productKey,
      p_credits: pack.credits,
    });
    if (error) throw new Error(`fulfill_pack_order failed: ${error.message}`);
    const res = data as { order_id: string; replayed: boolean };
    if (!res.replayed) await deps.onPurchase?.({ workspaceId, email, productKey, amountCents: amount, seat: null });
    return { handled: true, note: res.replayed ? "replay: order already exists" : `${pack.credits} credits granted` };
  }
  return { handled: false, note: `unknown product_key ${productKey}` };
}

export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return fulfil(event.data.object as Stripe.Checkout.Session, deps);

    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const { data, error } = await deps.admin.rpc("ladder_release_hold", { p_session_id: session.id });
      if (error) throw new Error(`ladder_release_hold failed: ${error.message}`);
      return { handled: true, note: `released ${data ?? 0} hold(s)`, ladderChanged: (data ?? 0) > 0 };
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const pi = idOf(charge.payment_intent);
      if (!pi) return { handled: false, note: "charge without payment_intent" };
      const { data, error } = await deps.admin.rpc("apply_refund", {
        p_payment_intent_id: pi,
        p_charge_id: charge.id,
        p_full: charge.refunded === true,
      });
      if (error) throw new Error(`apply_refund failed: ${error.message}`);
      const res = data as { ok: boolean; error?: string; replayed?: boolean; partial?: boolean; workspace_id?: string; product_key?: string; amount_cents?: number };
      if (!res.ok) return { handled: false, note: res.error ?? "refund not applied" };
      if (!res.replayed && !res.partial && res.workspace_id) {
        await deps.onRefund?.({ workspaceId: res.workspace_id, productKey: res.product_key ?? "", amountCents: res.amount_cents ?? 0 });
      }
      // A refunded lifetime seat still counts on the ladder, so the price does not move.
      return { handled: true, note: res.replayed ? "replay: already refunded" : res.partial ? "partial refund logged" : "refund applied" };
    }

    default:
      return { handled: false, note: `ignored ${event.type}` };
  }
}

/**
 * Event de-duplication on stripe_events.id. Returns "skip" for an event that was already
 * fully processed; a half-processed event (crash mid-way) is processed again, which is safe.
 */
export async function claimEvent(admin: Db, event: { id: string; type: string }): Promise<"process" | "skip"> {
  const { error } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (!error) return "process";
  const { data } = await admin.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
  return data?.processed_at ? "skip" : "process";
}

export async function markEventProcessed(admin: Db, eventId: string): Promise<void> {
  await admin.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", eventId);
}
