import "server-only";
import { houseBudgetCheck, logHouseSpend } from "@/lib/cost-guard";
import { hashIdentifier, randomToken } from "@/lib/crypto";
import { costEnv } from "@/lib/env";
import { resolveCredentials } from "@/lib/keys";
import { isMockMode } from "@/lib/mock";
import { ENGINES } from "@/lib/pricing-constants";
import { mapsLive, type MapsItem } from "@/lib/providers/dataforseo";
import { mockBusinessSearch, mockMapsItems } from "@/lib/providers/mock-data";
import { createScan, locationCodeFor, processScan } from "@/lib/scans/engine";
import { findInMaps } from "@/lib/scans/match";
import { dbAdmin } from "@/lib/db/clients";

/**
 * Free check (brief 10.4): one 1×1 AI check on 3 engines at the business location plus the Maps rank
 * at that point, on house keys. Limits: 1 per verified email, 3 per IP per day, a daily budget.
 */
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
  "trashmail.com", "getnada.com", "throwawaymail.com", "maildrop.cc", "dispostable.com", "fakeinbox.com", "mintemail.com", "mytemp.email",
  "tempail.com", "emailondeck.com", "moakt.com", "mohmal.com", "tempmailo.com", "burnermail.io", "mailnesia.com", "spamgourmet.com",
]);

export const isDisposableEmail = (email: string) => DISPOSABLE.has(email.split("@")[1]?.toLowerCase() ?? "");

export type FreeCheckStart =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string; message: string };

/**
 * Step 1: record the request and enforce the per-network limit. The email is not known yet: it is
 * bound in step 2 from the visitor's verified Google account, which is where the 1-per-email limit applies.
 */
export async function startFreeCheck(input: { ip: string; businessName: string; city: string }): Promise<FreeCheckStart> {
  const admin = dbAdmin();
  const env = costEnv.get();
  const ipHash = hashIdentifier(input.ip);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin.from("free_checks").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
  if ((count ?? 0) >= env.FREE_CHECKS_PER_IP_PER_DAY) {
    return { ok: false, status: 429, error: "ip_limit", message: "Too many free checks from this network today. Try again tomorrow." };
  }
  const { data, error } = await admin
    .from("free_checks")
    .insert({ email_hash: `pending:${randomToken(18)}`, ip_hash: ipHash, business_name: input.businessName, city: input.city, status: "pending" })
    .select("id")
    .single();
  if (error || !data) return { ok: false, status: 500, error: "server_error", message: "We could not start your free check. Try again." };
  return { ok: true, id: data.id };
}

export type FreeCheckRun =
  | { ok: true; slug: string }
  | { ok: false; status: number; error: string; message: string; queued?: boolean };

/** Runs the check for a signed-in, email-verified user. Idempotent: a finished check returns its report. */
export async function runFreeCheck(input: { freeCheckId: string; userEmail: string; workspaceId: string; country?: string }): Promise<FreeCheckRun> {
  const admin = dbAdmin();
  const env = costEnv.get();
  const emailHash = hashIdentifier(input.userEmail);
  let { data: fc } = await admin.from("free_checks").select("*").eq("id", input.freeCheckId).maybeSingle();
  if (!fc) return { ok: false, status: 404, error: "not_found", message: "This free check link is not valid." };

  if (String(fc.email_hash).startsWith("pending:")) {
    if (isDisposableEmail(input.userEmail)) return { ok: false, status: 400, error: "disposable_email", message: "Please sign in with your work Google account." };
    // Bind the request to this verified email. The unique index makes "one per email" atomic.
    const { data: bound, error: bindError } = await admin.from("free_checks").update({ email_hash: emailHash }).eq("id", fc.id).like("email_hash", "pending:%").select("*").maybeSingle();
    // Two requests for the same link at once (double click, React effect running twice): the other
    // one bound it a moment ago. Read the row again instead of treating it as a second free check.
    const { data: reread } = !bound ? await admin.from("free_checks").select("*").eq("id", fc.id).maybeSingle() : { data: null };
    if (reread && reread.email_hash === emailHash) fc = reread;
    else if (bindError || !bound) {
      const { data: earlier } = await admin.from("free_checks").select("report_id").eq("email_hash", emailHash).maybeSingle();
      if (earlier?.report_id) {
        const { data: rep } = await admin.from("reports").select("share_slug").eq("id", earlier.report_id).eq("revoked", false).maybeSingle();
        if (rep) return { ok: true, slug: rep.share_slug }; // show the check they already have
      }
      return { ok: false, status: 409, error: "already_used", message: `You have used your free check (${env.FREE_CHECKS_PER_EMAIL} per account). Lifetime access unlocks full grids.` };
    } else fc = bound;
  } else if (fc.email_hash !== emailHash) {
    return { ok: false, status: 404, error: "not_found", message: "This free check belongs to a different account." };
  }

  if (fc.report_id) {
    const { data: rep } = await admin.from("reports").select("share_slug").eq("id", fc.report_id).maybeSingle();
    if (rep) return { ok: true, slug: rep.share_slug };
  }
  if (fc.status === "running") return { ok: false, status: 409, error: "running", message: "Your free check is already running. Give it a minute." };

  const budget = await houseBudgetCheck("free", 0.05);
  if (!budget.ok) {
    await admin.from("free_checks").update({ status: "queued_tomorrow" }).eq("id", fc.id);
    return { ok: false, status: 429, error: "daily_cap", message: budget.message ?? "Today's free checks are used up. Come back tomorrow and open this link again.", queued: true };
  }

  // Claim it (one runner at a time).
  const { data: claimed } = await admin.from("free_checks").update({ status: "running" }).eq("id", fc.id).in("status", ["pending", "queued_tomorrow", "failed"]).select("id").maybeSingle();
  if (!claimed) return { ok: false, status: 409, error: "running", message: "Your free check is already running. Give it a minute." };

  const failWith = async (message: string): Promise<FreeCheckRun> => {
    await admin.from("free_checks").update({ status: "failed" }).eq("id", fc.id);
    return { ok: false, status: 502, error: "check_failed", message };
  };

  try {
    const creds = await resolveCredentials(null, "free");
    const mock = isMockMode();
    if (!mock && !creds.dataforseo) return failWith("Free checks are not available right now.");
    const spend: Record<string, number> = {};

    // 1. Find the listing.
    const keyword = `${fc.business_name} ${fc.city}`.trim();
    let listings: MapsItem[];
    if (mock) listings = mockBusinessSearch(fc.business_name);
    else {
      const r = await mapsLive(creds.dataforseo!, { keyword, locationCode: locationCodeFor(input.country), depth: 20 });
      listings = r.items;
      spend.dataforseo = (spend.dataforseo ?? 0) + r.costUsd;
    }
    const listing = listings.find((l) => l.lat != null && l.lng != null);
    if (!listing) return failWith("We could not find that business on Google Maps. Check the name and city, then try again.");

    const { data: business, error: bErr } = await admin.from("businesses").insert({
      workspace_id: input.workspaceId, name: listing.name, cid: listing.cid, place_id: listing.placeId, address: listing.address, city: listing.city ?? fc.city,
      region: listing.region, country: listing.country ?? input.country ?? "US", lat: listing.lat, lng: listing.lng,
      website: listing.url ?? (listing.domain ? `https://${listing.domain}` : null), phone: listing.phone, primary_category: listing.category,
      rating: listing.rating, reviews_count: listing.reviews, source: "search",
    }).select("id").single();
    if (bErr || !business) return failWith("We could not save the business. Try again.");

    // 2. Maps rank at the business location for its category.
    const service = (listing.category ?? "").toLowerCase() || fc.business_name;
    let mapsItems: MapsItem[] = [];
    try {
      if (mock) mapsItems = mockMapsItems(listing.lat!, listing.lng!, { businessName: listing.name, distance: 0 });
      else {
        const r = await mapsLive(creds.dataforseo!, { keyword: service, lat: listing.lat!, lng: listing.lng! });
        mapsItems = r.items;
        spend.dataforseo = (spend.dataforseo ?? 0) + r.costUsd;
      }
    } catch {
      // The AI part still has value on its own.
    }
    const hit = findInMaps(mapsItems, { name: listing.name, cid: listing.cid, placeId: listing.placeId, website: listing.url });
    await logHouseSpend("free", null, spend);

    // 3. 1×1 AI check on every engine we have a house key for.
    const engines = ENGINES.filter((e) => mock || !!creds[e]);
    let scanId: string | null = null;
    if (engines.length) {
      const scan = await createScan({
        workspaceId: input.workspaceId, plan: "locked", businessId: business.id, spec: { kind: "ai", grid: 1, engines: [...engines] },
        keyword: service, radiusMiles: 1, funding: "free", confirm: true,
      });
      if (scan.ok) {
        scanId = scan.scanId;
        await processScan(scan.scanId, 100_000);
      }
    }

    const slug = randomToken(12);
    const { data: report, error: rErr } = await admin.from("reports").insert({
      workspace_id: input.workspaceId, business_id: business.id, kind: "free_check", scan_ids: scanId ? [scanId] : [], share_slug: slug, watermark: true, status: "ready",
      data: { service, maps: { keyword: service, rank: hit?.rank ?? null, checked: mapsItems.length > 0, top: mapsItems.slice(0, 5).map((m) => ({ rank: m.rank, name: m.name })) } },
    }).select("id").single();
    if (rErr || !report) return failWith("The report could not be saved. Try again.");
    await admin.from("free_checks").update({ status: "done", report_id: report.id }).eq("id", fc.id);
    return { ok: true, slug };
  } catch {
    return failWith("The check did not complete. Reload this page to try again.");
  }
}
