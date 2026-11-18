import { describe, expect, it } from "vitest";
import { refundApprovalPending } from "@/lib/refund-approval";

/** The exact answer Stripe gave a restricted test key on 18 Nov 2026 (account with a refund approval rule). */
const STRIPE_SAID =
  "This action requires human approval before it can be completed. An approval request has been created and is awaiting review. If approved, it will automatically execute. To check status: GET /v2/core/approval_requests/apreq_test_61VmR79O0Pb4dDswP16TYDlXRHLJfiVU56RVkmDj6Rgu. To provide context for the reviewer: POST /v2/core/approval_requests/apreq_test_61VmR79O0Pb4dDswP16TYDlXRHLJfiVU56RVkmDj6Rgu with a reason parameter.";

describe("a refund that waits for the owner's approval is not a failed refund", () => {
  it("recognises Stripe's answer and returns the approval request id", () => {
    expect(refundApprovalPending(new Error(STRIPE_SAID))).toBe("apreq_test_61VmR79O0Pb4dDswP16TYDlXRHLJfiVU56RVkmDj6Rgu");
    expect(refundApprovalPending({ message: STRIPE_SAID.replace("apreq_test_", "apreq_") })).toMatch(/^apreq_61/);
  });
  it("treats every other error as a real failure", () => {
    expect(refundApprovalPending(new Error("No such payment_intent: 'pi_123'"))).toBeNull();
    expect(refundApprovalPending(new Error("The provided key does not have the required permissions"))).toBeNull();
    expect(refundApprovalPending(new Error("This action requires human approval"))).toBeNull(); // no request id: nothing is waiting
    expect(refundApprovalPending(null)).toBeNull();
    expect(refundApprovalPending("requires human approval apreq_1")).toBeNull();
  });
});
