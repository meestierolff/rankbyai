import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ReportView } from "@/components/report/types";
import { hashIdentifier, randomToken } from "@/lib/crypto";
import { dbAdmin } from "@/lib/db/clients";
import { sendEmail } from "@/lib/email";
import { costEnv, legalEnv, publicEnv } from "@/lib/env";
import { executeCheck, isDisposableEmail, saveCheckReport } from "@/lib/free-check";
import { inputKeySource, networkKeys, normalizeField } from "@/lib/free-check-input";
import { getFreeCheckReportView } from "@/lib/reports";

/**
 * The free check without an account (homepage form → /free-check). It runs on the house's paid keys,
 * so every limit is enforced here, on the server, before any paid call:
 *
 *  1. Bot check: Cloudflare Turnstile on start (the route requires it whenever real keys are in use).
 *  2. Burst limits: start attempts per IP and per fingerprint in 10 minutes, counted even when refused.
 *  3. Per visitor: one check per browser (an httpOnly visitor cookie) and per device fingerprint
 *     (network prefix + user agent + language) in 30 days. Failed checks (business not found on Maps)
 *     do not use it up, but every attempt counts toward the per-IP and per-fingerprint daily limits.
 *  4. Per IP: FREE_CHECKS_PER_IP_PER_DAY starts a day (IPv6 counted per /64).
 *  5. Repeats: the same business + city + country is checked at most once a day, by anyone.
 *  6. Budget: a daily and a monthly cap on house spend, claimed in one locked SQL call together with
 *     the check (free_check_claim), counting every running check at its upper-bound cost. When a cap
 *     is reached the visitor is told so, and nothing is called.
 *  7. Attempts: a check is run at most MAX_ATTEMPTS times.
 *
 * Results are private to the browser that ran them: the report is stored unlisted (revoked share
 * link) in the system workspace and shown only to the holder of the check's secret cookie.
 */

export const FREE_CHECK_SYSTEM_WORKSPACE = "00000000-0000-4000-8000-00000000fc02";
export const CHECK_COOKIE = "rb_fc";
export const VISITOR_COOKIE = "rb_fv";

/** Upper bound of one check's house cost: $0.10 AI cap per free scan (houseCapUsd) + two Maps lookups. */
export const RESERVE_USD = 0.11;
export const MAX_ATTEMPTS = 2;
const FINGERPRINT_DAYS = 30;
const DAY_MS = 86_400_000;
const CHECK_COOKIE_DAYS = 30;
const VISITOR_COOKIE_DAYS = 365;
/** Bump when the consent wording next to the email box changes; stored with each address. */
export const EMAIL_CONSENT_VERSION = "2026-11-20";

// ───────────────────────── cookies ─────────────────────────

export function readCookie(header: string | null | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET = /^[A-Za-z0-9_-]{24,64}$/;

export function parseCheckCookie(value: string | null | undefined): { id: string; secret: string } | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  const id = value.slice(0, dot);
  const secret = value.slice(dot + 1);
  return dot > 0 && UUID.test(id) && SECRET.test(secret) ? { id, secret } : null;
}

const cookieLine = (name: string, value: string, days: number, secure: boolean) =>
  `${name}=${value}; Path=/; Max-Age=${days * 86_400}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
export const checkCookieLine = (id: string, secret: string, secure: boolean) => cookieLine(CHECK_COOKIE, `${id}.${secret}`, CHECK_COOKIE_DAYS, secure);
export const visitorCookieLine = (visitorId: string, secure: boolean) => cookieLine(VISITOR_COOKIE, visitorId, VISITOR_COOKIE_DAYS, secure);
export const validVisitorId = (v: string | null | undefined): v is string => !!v && SECRET.test(v);

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
function secretMatches(secret: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ───────────────────────── visitor signals ─────────────────────────

/** Hashed signals a visitor's limits are counted on. Nothing here is stored in the clear. */
export function visitorSignals(headers: Headers, ip: string): { ipHash: string; fingerprintHash: string } {
  const { ipKey, prefix } = networkKeys(ip);
  const ua = (headers.get("user-agent") ?? "").slice(0, 300);
  const lang = (headers.get("accept-language") ?? "").slice(0, 100);
  return { ipHash: hashIdentifier(ipKey), fingerprintHash: hashIdentifier(`fp|${prefix}|${ua}|${lang}`) };
}

type Refusal = { ok: false; status: number; error: string; message: string; existing?: boolean };

/**
 * Start attempts per IP and per fingerprint in a 10-minute window. Called before Turnstile, so a
 * script hammering the endpoint is turned away without a siteverify call. Fails closed.
 */
export async function burstLimit(signals: { ipHash: string; fingerprintHash: string }): Promise<Refusal | null> {
  const admin = dbAdmin();
  const hit = async (key: string, limit: number) => {
    const { data, error } = await admin.rpc("rate_limit_hit", { p_key: key, p_window_seconds: 600, p_limit: limit });
    if (error) throw new Error("rate limit lookup failed");
    return data === true;
  };
  const [ipOk, fpOk] = await Promise.all([hit(`fc-start-ip:${signals.ipHash}`, 8), hit(`fc-start-fp:${signals.fingerprintHash}`, 5)]);
  return ipOk && fpOk ? null : { ok: false, status: 429, error: "rate_limited", message: "Too many attempts. Wait a few minutes and try again." };
}

// ───────────────────────── budget ─────────────────────────

export const CAP_MESSAGE = {
  day_cap: "Today's free checks are used up. Come back tomorrow: this page will run yours then.",
  month_cap: "This month's free checks are used up. They open again on the 1st of next month (UTC).",
} as const;

/** Cheap early refusal (not the guarantee: free_check_claim is). */
export async function budgetRefusal(): Promise<Refusal | null> {
  const env = costEnv.get();
  const { data, error } = await dbAdmin().rpc("free_check_budget");
  if (error) throw new Error("budget lookup failed");
  const b = (data as { day_usd: number; month_usd: number; running: number }[] | null)?.[0];
  if (!b) throw new Error("budget lookup failed");
  const reserved = (Number(b.running) + 1) * RESERVE_USD;
  if (Number(b.month_usd) + reserved > env.COST_MONTHLY_FREE_CAP_USD) return { ok: false, status: 429, error: "month_cap", message: CAP_MESSAGE.month_cap };
  if (Number(b.day_usd) + reserved > env.COST_DAILY_FREE_CAP_USD) return { ok: false, status: 429, error: "day_cap", message: CAP_MESSAGE.day_cap };
  return null;
}

// ───────────────────────── start ─────────────────────────

export type StartResult = { ok: true; id: string; secret: string; visitorId: string } | Refusal;

const ALREADY = "You have already used your free check in this browser. Your result is on the free check page.";
const DEVICE_USED = "This device or network has already had a free check. Lifetime access runs full grids on your own API keys.";

/**
 * Records a check for this visitor after every limit has passed. The caller has already validated
 * the input and verified Turnstile. Returns the check's secret once (it goes into the cookie only).
 */
export async function startPublicCheck(input: {
  ip: string; headers: Headers; visitorId: string | null; checkCookie: string | null; businessName: string; city: string; country: string;
}): Promise<StartResult> {
  const admin = dbAdmin();
  const env = costEnv.get();
  const { ipHash, fingerprintHash } = visitorSignals(input.headers, input.ip);
  const visitorId = validVisitorId(input.visitorId) ? input.visitorId : randomToken(18);
  const visitorHash = hashIdentifier(`visitor|${visitorId}`);
  const businessName = normalizeField(input.businessName);
  const city = normalizeField(input.city);
  const inputKey = hashIdentifier(`input|${inputKeySource({ businessName, city, country: input.country })}`);
  const dayAgo = new Date(Date.now() - DAY_MS).toISOString();
  const fpSince = new Date(Date.now() - FINGERPRINT_DAYS * DAY_MS).toISOString();
  const base = () => admin.from("free_checks").select("id", { count: "exact", head: true });
  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count: n, error } = await build(base());
    if (error) throw new Error("limit lookup failed");
    return n ?? 0;
  };

  // The browser's own check: still open or done → show it instead of starting another.
  const own = parseCheckCookie(input.checkCookie);
  if (own) {
    const { data: mine } = await admin.from("free_checks").select("status, access_hash").eq("id", own.id).maybeSingle();
    if (mine && secretMatches(own.secret, mine.access_hash) && mine.status !== "failed") {
      return { ok: false, status: 409, error: "already_checked", message: ALREADY, existing: true };
    }
  }

  const [byVisitor, byFingerprint, fingerprintToday, ipToday, repeats] = await Promise.all([
    count((q) => q.eq("visitor_hash", visitorHash).neq("status", "failed")),
    count((q) => q.eq("fingerprint_hash", fingerprintHash).neq("status", "failed").gte("created_at", fpSince)),
    count((q) => q.eq("fingerprint_hash", fingerprintHash).gte("created_at", dayAgo)),
    count((q) => q.eq("ip_hash", ipHash).gte("created_at", dayAgo)),
    count((q) => q.eq("input_key", inputKey).neq("status", "failed").gte("created_at", dayAgo)),
  ]);
  if (byVisitor >= env.FREE_CHECKS_PER_VISITOR) return { ok: false, status: 409, error: "visitor_limit", message: ALREADY, existing: true };
  if (byFingerprint >= env.FREE_CHECKS_PER_VISITOR || fingerprintToday >= env.FREE_CHECKS_PER_IP_PER_DAY) {
    return { ok: false, status: 429, error: "device_limit", message: DEVICE_USED };
  }
  if (ipToday >= env.FREE_CHECKS_PER_IP_PER_DAY) return { ok: false, status: 429, error: "ip_limit", message: "Too many free checks from this network today. Try again tomorrow." };
  if (repeats > 0) return { ok: false, status: 409, error: "repeat", message: "This business was checked here in the last 24 hours. Try again tomorrow, or check another business." };

  const cap = await budgetRefusal();
  if (cap) return cap;

  const secret = randomToken(24);
  const { data, error } = await admin.from("free_checks").insert({
    email_hash: null, ip_hash: ipHash, visitor_hash: visitorHash, fingerprint_hash: fingerprintHash, access_hash: sha256(secret),
    business_name: businessName, city, country: input.country, input_key: inputKey, status: "pending",
  }).select("id").single();
  if (error || !data) return { ok: false, status: 500, error: "server_error", message: "We could not start your free check. Try again." };
  return { ok: true, id: data.id, secret, visitorId };
}

// ───────────────────────── run ─────────────────────────

export type RunResult = { ok: true } | (Refusal & { running?: boolean; waiting?: boolean });

const FAILED_MESSAGE: Record<string, string> = {
  not_on_maps: "We could not find that business on Google Maps. Check the name and city, then run the check again.",
  unavailable: "Free checks are not available right now. Try again later.",
  save_failed: "The check did not complete. Run it again.",
  error: "The check did not complete. Run it again.",
  attempts: "This check could not be completed. Start a new one with the name exactly as it appears on Google Maps.",
};

async function loadOwned(cookie: string | null) {
  const c = parseCheckCookie(cookie);
  if (!c) return null;
  const { data: fc } = await dbAdmin().from("free_checks").select("*").eq("id", c.id).maybeSingle();
  if (!fc || !fc.visitor_hash || !secretMatches(c.secret, fc.access_hash)) return null;
  return fc as {
    id: string; status: string; report_id: string | null; business_name: string; city: string; country: string | null; error: string | null;
    attempts: number; completed_reported_at: string | null;
  };
}

/** Runs the cookie holder's check (idempotent: a finished check just answers ok). */
export async function runPublicCheck(cookie: string | null): Promise<RunResult> {
  const fc = await loadOwned(cookie);
  if (!fc) return { ok: false, status: 404, error: "not_found", message: "Start a free check from the form first." };
  if (fc.status === "done" && fc.report_id) return { ok: true };
  if (fc.status === "failed") return { ok: false, status: 409, error: "failed", message: FAILED_MESSAGE[fc.error ?? "error"] ?? FAILED_MESSAGE.error };

  const env = costEnv.get();
  const admin = dbAdmin();
  const { data: claim, error: claimError } = await admin.rpc("free_check_claim", {
    p_id: fc.id, p_reserve: RESERVE_USD, p_day_cap: env.COST_DAILY_FREE_CAP_USD, p_month_cap: env.COST_MONTHLY_FREE_CAP_USD, p_max_attempts: MAX_ATTEMPTS,
  });
  if (claimError) return { ok: false, status: 503, error: "unavailable", message: FAILED_MESSAGE.unavailable };
  switch (claim as string) {
    case "ok": break;
    case "done": return { ok: true };
    case "running": return { ok: false, status: 409, error: "running", message: "Your check is running.", running: true };
    case "day_cap": case "month_cap": return { ok: false, status: 429, error: claim as string, message: CAP_MESSAGE[claim as "day_cap" | "month_cap"], waiting: true };
    case "attempts":
      await admin.from("free_checks").update({ status: "failed", error: "attempts", finished_at: new Date().toISOString() }).eq("id", fc.id);
      return { ok: false, status: 409, error: "failed", message: FAILED_MESSAGE.attempts };
    default: return { ok: false, status: 404, error: "not_found", message: "Start a free check from the form first." };
  }

  const fail = async (code: string): Promise<RunResult> => {
    // A transient failure goes back to pending (the page may try once more, within MAX_ATTEMPTS);
    // a business that is not on Maps is final for this check.
    const final = code === "not_on_maps" || fc.attempts + 1 >= MAX_ATTEMPTS;
    await admin.from("free_checks").update({ status: final ? "failed" : "pending", error: code, finished_at: final ? new Date().toISOString() : null }).eq("id", fc.id);
    return { ok: false, status: final ? 409 : 502, error: final ? "failed" : "retry", message: FAILED_MESSAGE[code] ?? FAILED_MESSAGE.error };
  };
  try {
    const done = await executeCheck({ workspaceId: FREE_CHECK_SYSTEM_WORKSPACE, businessName: fc.business_name, city: fc.city, country: fc.country ?? "US" });
    if (!done.ok) return fail(done.code);
    const report = await saveCheckReport({ workspaceId: FREE_CHECK_SYSTEM_WORKSPACE, check: done, unlisted: true });
    if (!report) return fail("save_failed");
    await admin.from("free_checks").update({ status: "done", report_id: report.id, finished_at: new Date().toISOString(), error: null }).eq("id", fc.id);
    return { ok: true };
  } catch {
    return fail("error");
  }
}

// ───────────────────────── state for /free-check ─────────────────────────

export type PublicCheckState =
  | { kind: "none" }
  | { kind: "pending"; businessName: string; city: string; attempt: number }
  | { kind: "waiting"; businessName: string; message: string }
  | { kind: "failed"; message: string }
  | { kind: "done"; view: ReportView; emailGiven: boolean };

export async function loadPublicCheck(cookie: string | null): Promise<PublicCheckState> {
  const fc = await loadOwned(cookie);
  if (!fc) return { kind: "none" };
  if (fc.status === "done" && fc.report_id) {
    const [view, { count }] = await Promise.all([
      getFreeCheckReportView(fc.report_id),
      dbAdmin().from("free_check_emails").select("id", { count: "exact", head: true }).eq("free_check_id", fc.id),
    ]);
    return view ? { kind: "done", view, emailGiven: (count ?? 0) > 0 } : { kind: "failed", message: FAILED_MESSAGE.error };
  }
  if (fc.status === "failed") return { kind: "failed", message: FAILED_MESSAGE[fc.error ?? "error"] ?? FAILED_MESSAGE.error };
  if (fc.status === "queued_tomorrow") {
    // Back after a cap: run it once the budget has room again (the claim re-checks under its lock).
    const cap = await budgetRefusal().catch(() => ({ error: fc.error ?? "day_cap" }));
    if (cap) return { kind: "waiting", businessName: fc.business_name, message: CAP_MESSAGE[cap.error === "month_cap" ? "month_cap" : "day_cap"] };
    return { kind: "pending", businessName: fc.business_name, city: fc.city, attempt: fc.attempts };
  }
  return { kind: "pending", businessName: fc.business_name, city: fc.city, attempt: fc.attempts };
}

/**
 * The result was shown: true exactly once per check (one conditional UPDATE), so free_check_completed
 * is reported once however often the page is reloaded. Never true for a check without a result.
 */
export async function markCompletedShown(cookie: string | null): Promise<{ first: boolean; mentionedBy: number; engines: number; mapsRank: number | null } | null> {
  const fc = await loadOwned(cookie);
  if (!fc || fc.status !== "done" || !fc.report_id) return null;
  const { data } = await dbAdmin().from("free_checks").update({ completed_reported_at: new Date().toISOString() }).eq("id", fc.id).is("completed_reported_at", null).select("id").maybeSingle();
  const { data: report } = await dbAdmin().from("reports").select("data, scan_ids").eq("id", fc.report_id).maybeSingle();
  const scanId = (report?.scan_ids ?? [])[0];
  let mentionedBy = 0;
  let engines = 0;
  if (scanId) {
    const { data: samples } = await dbAdmin().from("ai_samples").select("engine, status, mentioned").eq("scan_id", scanId);
    for (const s of (samples ?? []) as { status: string; mentioned: boolean | null }[]) {
      if (s.status !== "done") continue;
      engines++;
      if (s.mentioned) mentionedBy++;
    }
  }
  return { first: !!data, mentionedBy, engines, mapsRank: (report?.data?.maps?.rank as number | null) ?? null };
}

// ───────────────────────── optional email after the result ─────────────────────────

export const EmailBody = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  marketing: z.boolean().default(false),
});

export type EmailResult = { ok: true; sent: boolean } | Refusal;

/** One summary email per check, to the address the visitor typed after seeing the result. */
export async function captureResultEmail(input: { cookie: string | null; ip: string; headers: Headers; email: string; marketing: boolean }): Promise<EmailResult> {
  const fc = await loadOwned(input.cookie);
  if (!fc) return { ok: false, status: 404, error: "not_found", message: "Run your free check first." };
  if (fc.status !== "done" || !fc.report_id) return { ok: false, status: 409, error: "not_ready", message: "Your result is not ready yet." };
  if (isDisposableEmail(input.email)) return { ok: false, status: 400, error: "disposable_email", message: "Use an address you will read; disposable inboxes are not accepted." };

  const admin = dbAdmin();
  const { ipHash } = visitorSignals(input.headers, input.ip);
  const { data: allowed, error: rlError } = await admin.rpc("rate_limit_hit", { p_key: `fc-email:${ipHash}`, p_window_seconds: 3600, p_limit: 5 });
  if (rlError || allowed !== true) return { ok: false, status: 429, error: "rate_limited", message: "Too many attempts. Try again later." };

  const view = await getFreeCheckReportView(fc.report_id);
  if (!view) return { ok: false, status: 409, error: "not_ready", message: "Your result is not ready yet." };

  const token = randomToken(24);
  const { data: row, error } = await admin.from("free_check_emails").insert({
    free_check_id: fc.id, email: input.email, marketing_opt_in: input.marketing, consent_version: EMAIL_CONSENT_VERSION, withdraw_token_hash: sha256(token),
  }).select("id").single();
  if (error || !row) {
    return error?.code === "23505"
      ? { ok: false, status: 409, error: "already_sent", message: "This result has already been emailed." }
      : { ok: false, status: 500, error: "server_error", message: "We could not save your address. Try again." };
  }
  const sent = await sendEmail({ to: input.email, subject: `Your free AI visibility check: ${view.business.name}`, text: resultEmailText(view, token, input.marketing), replyTo: legalEnv.email() || undefined });
  if (!sent) {
    // Not sent (no mail provider on this deployment, or it refused): keep no address we did not use.
    await admin.from("free_check_emails").delete().eq("id", row.id);
    return { ok: false, status: 502, error: "not_sent", message: "We could not send the email right now. Try again later." };
  }
  await admin.from("free_check_emails").update({ result_sent_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true, sent };
}

/** Fixed content: the result, the honesty line, and how to remove the address. No free text from the visitor. */
export function resultEmailText(view: ReportView, withdrawToken: string, marketing: boolean): string {
  const site = publicEnv.siteUrl;
  const lines = [`Your free check of ${view.business.name}${view.business.city ? ` in ${view.business.city}` : ""}, at the business's own location:`, ""];
  for (const e of view.ai?.single ?? []) {
    if (!e.available) lines.push(`- ${e.engine}: no answer`);
    else lines.push(`- ${e.engine}: ${e.mentioned ? `named it${e.position ? ` (position ${e.position})` : ""}` : "did not name it"}`);
  }
  const rank = view.maps?.single?.rank;
  if (view.maps?.single) lines.push(`- Google Maps rank there: ${rank != null ? `#${rank}` : "not in the top 20"}`);
  lines.push(
    "",
    "AI answers vary between runs, places and time, so this is one observation, not a fixed ranking.",
    "",
    `See the whole map (a grid of points, audits and reports): ${site}/pricing`,
    "",
    marketing
      ? "You also asked for occasional product news from RankbyAI. You can stop it with the link below."
      : "You asked for this email on rankbyai.live. We will not email you again.",
    `Remove your address now: ${site}/free-check/unsubscribe?t=${withdrawToken}`,
    `Privacy: ${site}/privacy`,
  );
  const entity = legalEnv.entityName();
  if (entity) lines.push("", `RankbyAI is operated by ${entity}.`);
  return lines.join("\n");
}

/** Retention, as stated in the privacy policy (run by the daily cron). */
export const RETENTION = { resultDays: 90, recordDays: 180, resultOnlyEmailDays: 30 } as const;

/**
 * Deletes anonymous results (business, scan, answers and report in the system workspace) after
 * RETENTION.resultDays, the hashed check records after recordDays, and an address given only to
 * receive the result after resultOnlyEmailDays. Addresses with product-news consent stay until withdrawn.
 */
export async function cleanUpFreeChecks(now = Date.now()): Promise<{ results: number; records: number; emails: number }> {
  const admin = dbAdmin();
  const before = (days: number) => new Date(now - days * DAY_MS).toISOString();
  const { data: emails } = await admin.from("free_check_emails").delete().eq("marketing_opt_in", false).lt("created_at", before(RETENTION.resultOnlyEmailDays)).select("id");
  const { data: results } = await admin.from("businesses").delete().eq("workspace_id", FREE_CHECK_SYSTEM_WORKSPACE).lt("created_at", before(RETENTION.resultDays)).select("id");
  // A record with a product-news address is kept until that address is withdrawn (the FK would delete it).
  const { data: keep } = await admin.from("free_check_emails").select("free_check_id");
  const keepIds = (keep ?? []).map((r) => r.free_check_id as string);
  let q = admin.from("free_checks").delete().is("email_hash", null).lt("created_at", before(RETENTION.recordDays));
  if (keepIds.length) q = q.not("id", "in", `(${keepIds.join(",")})`);
  const { data: records } = await q.select("id");
  return { results: results?.length ?? 0, records: records?.length ?? 0, emails: emails?.length ?? 0 };
}

/** Withdraws consent: the address is deleted, whatever it was kept for. */
export async function withdrawEmail(token: string): Promise<boolean> {
  if (!SECRET.test(token)) return false;
  const { data } = await dbAdmin().from("free_check_emails").delete().eq("withdraw_token_hash", sha256(token)).select("id");
  return (data ?? []).length > 0;
}
