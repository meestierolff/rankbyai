/**
 * A Stripe account can require a person to approve refunds made by an API key (Stripe dashboard,
 * Settings → Approvals). Stripe then answers the refund call with an error, but the refund is
 * not lost: an approval request is waiting, and approving it runs the refund.
 *
 * Returns the approval request id when the error is that answer, otherwise null. Stripe gives this
 * error no code (checked 18 Nov 2026), so the request id in the message is what identifies it.
 */
export function refundApprovalPending(err: unknown): string | null {
  const message = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
  if (!/requires human approval/i.test(message)) return null;
  return /\bapreq_[A-Za-z0-9_]+/.exec(message)?.[0] ?? null;
}
