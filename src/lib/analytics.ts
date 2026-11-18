"use client";

/**
 * Client analytics facade (PostHog, EU cloud). posthog-js is loaded lazily after the page
 * is interactive, so it never costs Lighthouse points. Events fired before it loads are queued.
 * Event names are the exact ones from the brief (section 15). Never put PII in properties.
 */
export type AnalyticsEvent =
  | "landing_view" | "demo_interacted" | "calculator_changed" | "pricing_view"
  | "free_check_started" | "free_check_completed" | "signup_completed" | "key_saved"
  | "checkout_started" | "price_changed_shown" | "purchase_completed" | "refund_processed"
  | "scan_estimated" | "scan_completed" | "compare_viewed" | "audit_completed" | "fixkit_copied"
  | "share_link_viewed" | "pdf_downloaded" | "prospect_batch_started" | "csv_exported"
  | "api_key_created" | "mcp_tool_called" | "fix_prompt_copied";

type Props = Record<string, string | number | boolean | null | undefined>;
type PH = { capture: (e: string, p?: Props) => void };

const queue: [AnalyticsEvent, Props | undefined][] = [];
let client: PH | null = null;

export function setAnalyticsClient(ph: PH) {
  client = ph;
  for (const [e, p] of queue.splice(0)) ph.capture(e, p);
}

export function track(event: AnalyticsEvent, props?: Props) {
  if (client) client.capture(event, props);
  else if (queue.length < 50) queue.push([event, props]);
}

const fired = new Set<string>();
/** Fire an event at most once per page load (e.g. pricing_view). */
export function trackOnce(event: AnalyticsEvent, props?: Props) {
  if (fired.has(event)) return;
  fired.add(event);
  track(event, props);
}
