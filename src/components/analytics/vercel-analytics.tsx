"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics (cookieless page views). A report's slug is its access key, so report paths
 * are sent as /r/[slug]; query strings are never sent.
 */
export function redactAnalyticsUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/^\/r\/[^/]+/, "/r/[slug]");
    return `${u.origin}${path}`;
  } catch {
    return raw.split(/[?#]/)[0].replace(/\/r\/[^/?#]+/, "/r/[slug]");
  }
}

const beforeSend = (event: BeforeSendEvent): BeforeSendEvent => ({ ...event, url: redactAnalyticsUrl(event.url) });

export function VercelAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
