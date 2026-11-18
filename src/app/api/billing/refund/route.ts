import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { MissingEnvError } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { dbAdmin } from "@/lib/db/clients";
import { REFUND_DAYS } from "@/lib/pricing-constants";
import { refundApprovalPending } from "@/lib/refund-approval";

const Body = z.object({ order_id: z.uuid() });

/** Self-serve refund inside the 14-day window. The webhook (charge.refunded) updates the order and plan. */
export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.role !== "owner") return Response.json({ error: "forbidden", message: "Only the workspace owner can request a refund." }, { status: 403 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const admin = dbAdmin();
  const { data: order } = await admin
    .from("orders")
    .select("id, workspace_id, status, stripe_payment_intent_id, created_at")
    .eq("id", parsed.data.order_id)
    .maybeSingle();
  if (!order || order.workspace_id !== ctx.workspace.id) return Response.json({ error: "not_found" }, { status: 404 });
  if (order.status !== "paid") return Response.json({ error: "not_refundable", message: "This order was already refunded." }, { status: 409 });

  const ageDays = (Date.now() - new Date(order.created_at).getTime()) / 86_400_000;
  if (ageDays > REFUND_DAYS) {
    return Response.json({ error: "window_closed", message: `The ${REFUND_DAYS}-day refund window has passed. Email us and we'll help.` }, { status: 409 });
  }
  if (!order.stripe_payment_intent_id) return Response.json({ error: "not_refundable" }, { status: 409 });

  try {
    await getStripe().refunds.create(
      { payment_intent: order.stripe_payment_intent_id },
      { idempotencyKey: `refund:${order.id}` },
    );
    return Response.json({ ok: true, message: "Refund requested. It reaches your original payment method in 5–10 days." });
  } catch (err) {
    if (err instanceof MissingEnvError) return Response.json({ error: "payments_not_configured" }, { status: 503 });
    // The account owner approves refunds by hand in Stripe. The request is recorded there and the
    // refund runs once approved; the webhook then updates the order. Say so instead of "failed".
    const approval = refundApprovalPending(err);
    if (approval) {
      console.warn("[refund] waiting for approval in Stripe:", approval, "order", order.id);
      return Response.json(
        { ok: true, pending_review: true, message: "Refund requested. We approve refunds by hand; once approved it reaches your original payment method in 5–10 days. Email us if this order still shows as paid after two working days." },
        { status: 202 },
      );
    }
    console.error("[refund] stripe error");
    return Response.json({ error: "stripe_error", message: "The refund could not be started. Email us and we'll do it by hand." }, { status: 502 });
  }
}
