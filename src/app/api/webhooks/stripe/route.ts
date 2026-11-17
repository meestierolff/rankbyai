import Stripe from "stripe";
import { revalidateTag } from "next/cache";
import { dbAdmin } from "@/lib/db/clients";
import { claimEvent, handleStripeEvent, markEventProcessed, stripeModeAllowed } from "@/lib/stripe-webhook";
import { sendEmail } from "@/lib/email";
import { captureServer } from "@/lib/analytics-server";
import { legalEnv, publicEnv } from "@/lib/env";
import { REFUND_DAYS } from "@/lib/pricing-constants";

/** Stripe webhook: raw body, signature check, de-duplicated by event id, replay-safe handlers. */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "webhook_not_configured", message: "Set STRIPE_WEBHOOK_SECRET." }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing_signature" }, { status: 400 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    // Signature verification needs no API access; the key here is never used for a request.
    const verifier = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_signature_verification_only");
    event = await verifier.webhooks.constructEventAsync(raw, signature, secret);
  } catch {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Test payments are never fulfilled on production, and live payments never anywhere else.
  // Acknowledged with 200 so Stripe does not retry; nothing is recorded.
  if (!stripeModeAllowed(event.livemode, process.env.VERCEL_ENV)) {
    return Response.json({ received: true, ignored: event.livemode ? "live_event_outside_production" : "test_event_on_production" });
  }

  const admin = dbAdmin();
  if ((await claimEvent(admin, event)) === "skip") {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    const outcome = await handleStripeEvent(event, {
      admin,
      onPurchase: async (p) => {
        await captureServer("purchase_completed", p.workspaceId, { product_key: p.productKey, amount_cents: p.amountCents, seat: p.seat });
        if (!p.email) return;
        const contact = legalEnv.email() || "the address in the footer";
        const lines =
          p.productKey === "lifetime"
            ? [
                `You're in. Your RankbyAI lifetime seat is #${p.seat}.`,
                "",
                `Open the app: ${publicEnv.siteUrl}/app`,
                "First steps: add your API keys (Settings → API keys), add a business, run a check.",
                "",
                `Refunds: ${REFUND_DAYS} days, no questions. Use the button on the Billing page or reply to this email.`,
                "Fees you pay your API providers go to them, not to us, so we can't refund those.",
              ]
            : [
                "Your included scans are ready. Credits never expire.",
                "",
                `Open the app: ${publicEnv.siteUrl}/app`,
                `Refunds: the unused part of a pack is refundable within ${REFUND_DAYS} days.`,
              ];
        await sendEmail({
          to: p.email,
          subject: p.productKey === "lifetime" ? `RankbyAI lifetime access: seat #${p.seat}` : "Your RankbyAI scan pack",
          text: [...lines, "", `Questions: ${contact}`].join("\n"),
        });
      },
      onRefund: async (p) => {
        await captureServer("refund_processed", p.workspaceId, { product_key: p.productKey, amount_cents: p.amountCents });
      },
    });
    await markEventProcessed(admin, event.id);
    if (outcome.ladderChanged) revalidateTag("offer", { expire: 0 });
    return Response.json({ received: true, handled: outcome.handled, note: outcome.note });
  } catch (err) {
    console.error("[stripe-webhook] handler failed:", event.type, err instanceof Error ? err.message : "unknown");
    // 500 → Stripe retries; the event row stays unprocessed so the retry runs again.
    return Response.json({ error: "handler_failed" }, { status: 500 });
  }
}
