import "server-only";
import type { Attribution } from "@/lib/attribution";
import { dbAdmin } from "@/lib/db/clients";

/**
 * Exactly-once conversion claims. Each is one conditional UPDATE (`… where *_reported_at is null`),
 * so however often a browser asks (reloads, two tabs, a retry), only one request ever gets `first`.
 * Attribution is stored with the same write: on the profile at signup, on the order at purchase.
 */

/** Accounts older than this are not new signups (they existed before conversions were measured). */
export const SIGNUP_WINDOW_MS = 24 * 3_600_000;

export async function claimSignupConversion(userId: string, cookie: Attribution | null, now = Date.now()): Promise<{ first: boolean }> {
  const admin = dbAdmin();
  const { data: p } = await admin.from("profiles").select("created_at, attribution, signup_reported_at").eq("id", userId).maybeSingle();
  if (!p || p.signup_reported_at || Date.parse(p.created_at) < now - SIGNUP_WINDOW_MS) return { first: false };
  const { data } = await admin
    .from("profiles")
    .update({ signup_reported_at: new Date(now).toISOString(), ...(!p.attribution && cookie ? { attribution: cookie } : {}) })
    .eq("id", userId)
    .is("signup_reported_at", null)
    .select("id")
    .maybeSingle();
  return { first: !!data };
}

/** The order must belong to the caller's workspace; the attribution comes from the order, the buyer's signup, or the cookie. */
export async function claimPurchaseConversion(input: { orderId: string; workspaceId: string; userId: string; cookie: Attribution | null }): Promise<{ first: boolean }> {
  const admin = dbAdmin();
  const { data: o } = await admin.from("orders").select("id, attribution, conversion_reported_at").eq("id", input.orderId).eq("workspace_id", input.workspaceId).maybeSingle();
  if (!o || o.conversion_reported_at) return { first: false };
  let attribution = (o.attribution as Attribution | null) ?? null;
  if (!attribution) {
    const { data: prof } = await admin.from("profiles").select("attribution").eq("id", input.userId).maybeSingle();
    attribution = (prof?.attribution as Attribution | null) ?? input.cookie;
  }
  const { data } = await admin
    .from("orders")
    .update({ conversion_reported_at: new Date().toISOString(), ...(attribution ? { attribution } : {}) })
    .eq("id", o.id)
    .is("conversion_reported_at", null)
    .select("id")
    .maybeSingle();
  return { first: !!data };
}
