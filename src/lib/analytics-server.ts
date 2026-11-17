import "server-only";
import { publicEnv } from "@/lib/env";

/** Server-side PostHog capture. No PII in properties: distinct_id is the workspace id. */
export async function captureServer(event: string, distinctId: string, properties: Record<string, string | number | boolean | null> = {}) {
  if (!publicEnv.posthogKey) return;
  try {
    await fetch(`${publicEnv.posthogHost.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: publicEnv.posthogKey, event, distinct_id: distinctId, properties: { ...properties, $process_person_profile: false } }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // analytics must never break a request
  }
}
