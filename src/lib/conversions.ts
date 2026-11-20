"use client";

import { allowed, readConsent } from "@/lib/consent";
import { publicEnv } from "@/lib/env-public";

/**
 * Conversions for later ad tests: a GA4 event plus a Google Ads conversion for each of
 *   free_check_completed (a free-check result was shown), sign_up and purchase.
 *
 * Nothing is sent unless the Google tag was loaded, which happens only when its IDs are set and, where
 * consent is asked, after the visitor allowed it (components/analytics/google-tags.ts). "Once" is
 * decided by the server with a conditional UPDATE (free_checks.completed_reported_at,
 * profiles.signup_reported_at, orders.conversion_reported_at); callers report only when it says first.
 * PostHog keeps its own event names and is called by the same callers through lib/analytics.
 */
export type ConversionKind = "free_check_completed" | "sign_up" | "purchase";

type Gtag = (...args: unknown[]) => void;

function gtag(): Gtag | null {
  if (typeof window === "undefined") return null;
  const g = (window as unknown as { gtag?: Gtag }).gtag;
  return typeof g === "function" ? g : null;
}

export interface ConversionParams {
  /** Purchase value in major units, before tax (orders.amount_cents is Stripe's amount_subtotal). */
  value?: number;
  /** ISO 4217, upper case. */
  currency?: string;
  /** Tax in major units, reported separately from the value (GA4 `tax`). */
  tax?: number;
  /** Stable id of the purchase (our order id), so Google de-duplicates as well. */
  transactionId?: string;
  items?: { item_id: string; item_name: string; price: number; quantity: number }[];
}

export function reportConversion(kind: ConversionKind, params: ConversionParams = {}) {
  const g = gtag();
  if (!g) return;
  const { value, currency, transactionId } = params;
  // Each product only with its own consent, checked again at the moment of sending.
  const ok = allowed(readConsent());
  const ga = publicEnv.gaMeasurementId;
  if (ga && ok.analytics) {
    if (kind === "purchase") g("event", "purchase", { send_to: ga, transaction_id: transactionId, value, tax: params.tax, currency, items: params.items });
    else if (kind === "sign_up") g("event", "sign_up", { send_to: ga, method: "google" });
    else g("event", "free_check_completed", { send_to: ga });
  }
  const ads = publicEnv.googleAdsId;
  const label = publicEnv.googleAdsLabels[kind];
  if (ads && label && ok.ads) {
    g("event", "conversion", {
      send_to: `${ads}/${label}`,
      ...(value != null ? { value, currency } : {}),
      ...(transactionId ? { transaction_id: transactionId } : {}),
    });
  }
}
