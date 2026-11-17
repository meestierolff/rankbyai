import { describe, expect, it } from "vitest";
import { stripeKeyAllowed, stripeModeAllowed } from "@/lib/stripe-webhook";

/**
 * The sold counter on the site is public and the ladder freezes after the first sale, so a test-mode
 * payment must never be counted as a sale on the live site.
 */
describe("test payments never count as real sales", () => {
  it("production fulfils live events only", () => {
    expect(stripeModeAllowed(true, "production")).toBe(true);
    expect(stripeModeAllowed(false, "production")).toBe(false);
  });
  it("preview and local fulfil test events only", () => {
    for (const env of ["preview", "development", undefined]) {
      expect(stripeModeAllowed(false, env)).toBe(true);
      expect(stripeModeAllowed(true, env)).toBe(false);
    }
  });
  it("production opens checkout with a live key only; elsewhere with a test key only", () => {
    expect(stripeKeyAllowed("sk_live_abc", "production")).toBe(true);
    expect(stripeKeyAllowed("rk_live_abc", "production")).toBe(true);
    expect(stripeKeyAllowed("sk_test_abc", "production")).toBe(false);
    expect(stripeKeyAllowed("rk_test_abc", "production")).toBe(false);
    expect(stripeKeyAllowed("sk_test_abc", "preview")).toBe(true);
    expect(stripeKeyAllowed("sk_test_abc", undefined)).toBe(true);
    expect(stripeKeyAllowed("sk_live_abc", "preview")).toBe(false);
    expect(stripeKeyAllowed("sk_live_abc", undefined)).toBe(false);
  });
});
