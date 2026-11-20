import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, closePool, resetData, sql } from "./helpers";

// The result email goes through the real sender only when a provider is configured; here it is
// captured so the test can read what would be sent.
const sent: { to: string; subject: string; text: string }[] = [];
let sendWorks = true;
vi.mock("@/lib/email", () => ({
  sendEmail: async (m: { to: string; subject: string; text: string }) => {
    if (!sendWorks) return false;
    sent.push(m);
    return true;
  },
}));

const {
  captureResultEmail, cleanUpFreeChecks, FREE_CHECK_SYSTEM_WORKSPACE, loadPublicCheck, markCompletedShown, MAX_ATTEMPTS, RESERVE_USD, runPublicCheck, startPublicCheck, withdrawEmail,
} = await import("@/lib/free-check-public");
const { getReportView } = await import("@/lib/reports");

/** The public free check (no account), with simulated vendors and the real local database. */
beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
});
beforeEach(async () => {
  await resetData();
  sent.length = 0;
  sendWorks = true;
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await closePool();
});

interface Visitor { ip: string; ua: string; visitorId: string | null; cookie: string | null }
const visitor = (n: number, ip = `203.0.113.${n}`): Visitor => ({ ip, ua: `Mozilla/5.0 test-browser-${n}`, visitorId: null, cookie: null });
const headersOf = (v: Visitor) => new Headers({ "user-agent": v.ua, "accept-language": "en-US" });

async function start(v: Visitor, businessName = "Northgate Family Dental", city = "Austin, TX") {
  const r = await startPublicCheck({ ip: v.ip, headers: headersOf(v), visitorId: v.visitorId, checkCookie: v.cookie, businessName, city, country: "US" });
  if (r.ok) {
    v.visitorId = r.visitorId;
    v.cookie = `${r.id}.${r.secret}`;
  }
  return r;
}

describe("public free check: without an account", () => {
  it("runs, and the result is private to the browser that ran it", async () => {
    const v = visitor(1);
    expect((await start(v)).ok).toBe(true);
    expect(await loadPublicCheck(v.cookie)).toMatchObject({ kind: "pending", businessName: "Northgate Family Dental" });
    expect(await runPublicCheck(v.cookie)).toEqual({ ok: true });

    const state = await loadPublicCheck(v.cookie);
    expect(state.kind).toBe("done");
    if (state.kind !== "done") return;
    expect(state.view.kind).toBe("free_check");
    expect(state.view.ai?.single).toHaveLength(3);
    expect(state.view.maps?.single?.rank).toBe(1);

    // Stored in the system workspace, funded by the house, and its share link never opens.
    const [report] = await sql<{ workspace_id: string; revoked: boolean; share_slug: string }>("select workspace_id, revoked, share_slug from public.reports");
    expect(report).toMatchObject({ workspace_id: FREE_CHECK_SYSTEM_WORKSPACE, revoked: true });
    expect(await getReportView(report.share_slug)).toBeNull();
    const [scan] = await sql<{ funding: string; workspace_id: string }>("select funding, workspace_id from public.scans");
    expect(scan).toEqual({ funding: "free", workspace_id: FREE_CHECK_SYSTEM_WORKSPACE });

    // A wrong secret, or no cookie, sees nothing.
    const [id] = v.cookie!.split(".");
    expect(await loadPublicCheck(`${id}.${"x".repeat(32)}`)).toEqual({ kind: "none" });
    expect(await loadPublicCheck(null)).toEqual({ kind: "none" });
    expect(await runPublicCheck(`${id}.${"x".repeat(32)}`)).toMatchObject({ ok: false, status: 404 });

    // Running it again is idempotent: no second scan.
    expect(await runPublicCheck(v.cookie)).toEqual({ ok: true });
    expect((await sql("select 1 from public.scans")).length).toBe(1);
  });

  it("stores hashes, never the IP, user agent or secret", async () => {
    const v = visitor(1);
    await start(v);
    const [row] = await sql("select * from public.free_checks");
    const text = JSON.stringify(row);
    for (const secret of [v.ip, v.ua, v.cookie!.split(".")[1], v.visitorId!]) expect(text).not.toContain(secret);
    expect(row.email_hash).toBeNull();
    for (const k of ["ip_hash", "visitor_hash", "fingerprint_hash", "access_hash", "input_key"]) expect(row[k]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("free_check_completed is reported once, and only after a result exists", async () => {
    const v = visitor(1);
    await start(v);
    expect(await markCompletedShown(v.cookie)).toBeNull(); // not run yet: nothing to report
    await runPublicCheck(v.cookie);
    expect(await markCompletedShown(v.cookie)).toMatchObject({ first: true, engines: 3, mapsRank: 1 });
    expect(await markCompletedShown(v.cookie)).toMatchObject({ first: false });
  });
});

describe("public free check: limits", () => {
  it("one check per browser: a second start shows the first instead", async () => {
    const v = visitor(1);
    await start(v);
    expect(await start(v, "Other Dental Studio")).toMatchObject({ ok: false, error: "already_checked", existing: true });
    // Cookie cleared but same visitor id: still refused.
    v.cookie = null;
    expect(await start(v, "Other Dental Studio")).toMatchObject({ ok: false, error: "visitor_limit", existing: true });
  });

  it("one check per device fingerprint: clearing cookies does not give another", async () => {
    const v = visitor(1);
    await start(v);
    const sameDevice: Visitor = { ...v, visitorId: null, cookie: null };
    expect(await start(sameDevice, "Other Dental Studio")).toMatchObject({ ok: false, status: 429, error: "device_limit" });
    // IPv4 fingerprints use the /24: another address in the same network is the same device.
    expect(await start({ ...sameDevice, ip: "203.0.113.200" }, "Third Dental Studio")).toMatchObject({ ok: false, error: "device_limit" });
    // Another browser on another network is a new visitor.
    expect((await start(visitor(2, "198.51.100.2"), "Other Dental Studio")).ok).toBe(true);
  });

  it("allows FREE_CHECKS_PER_IP_PER_DAY starts per IP, then refuses", async () => {
    for (let i = 0; i < 3; i++) expect((await start(visitor(10 + i, "192.0.2.50"), `Dental Practice ${"ABC"[i]}`)).ok).toBe(true);
    expect(await start(visitor(20, "192.0.2.50"), "Dental Practice D")).toMatchObject({ ok: false, status: 429, error: "ip_limit" });
  });

  it("counts IPv6 per /64", async () => {
    for (let i = 0; i < 3; i++) expect((await start(visitor(30 + i, `2001:db8:1:2::${i + 1}`), `Dental Practice ${"ABC"[i]}`)).ok).toBe(true);
    expect(await start(visitor(40, "2001:db8:1:2:ffff::9"), "Dental Practice D")).toMatchObject({ ok: false, error: "ip_limit" });
  });

  it("the same business is checked at most once a day, by anyone", async () => {
    await start(visitor(1));
    expect(await start(visitor(2, "198.51.100.2"), "northgate family-dental", "AUSTIN TX")).toMatchObject({ ok: false, status: 409, error: "repeat" });
  });

  it("a business not found on Maps does not use up the visitor's check", async () => {
    const v = visitor(1);
    await start(v);
    await sql("update public.free_checks set status = 'failed', error = 'not_on_maps'");
    expect(await loadPublicCheck(v.cookie)).toMatchObject({ kind: "failed" });
    expect((await start(v, "Northgate Family Dental Clinic")).ok).toBe(true);
  });
});

describe("public free check: budget (hard caps)", () => {
  it("refuses to start when today's budget is used up, and says so", async () => {
    await sql("insert into public.spend_log (provider, usd, funding) values ('openai', 2.95, 'free')"); // daily cap $3
    expect(await start(visitor(1))).toMatchObject({ ok: false, status: 429, error: "day_cap" });
    expect(await sql("select 1 from public.free_checks")).toEqual([]);
  });

  it("refuses when this month's budget is used up, even with today free", async () => {
    await sql("insert into public.spend_log (provider, usd, funding, day) values ('openai', 29.95, 'free', date_trunc('month', now() at time zone 'utc')::date)"); // monthly cap $30
    expect(await start(visitor(1))).toMatchObject({ ok: false, status: 429, error: "month_cap" });
  });

  it("a check started before the cap waits instead of running, then runs when there is room", async () => {
    const v = visitor(1);
    await start(v);
    await sql("insert into public.spend_log (provider, usd, funding) values ('openai', 2.95, 'free')");
    expect(await runPublicCheck(v.cookie)).toMatchObject({ ok: false, status: 429, error: "day_cap", waiting: true });
    expect(await sql("select 1 from public.scans")).toEqual([]); // nothing was called
    expect(await loadPublicCheck(v.cookie)).toMatchObject({ kind: "waiting" });
    await sql("delete from public.spend_log"); // the next day
    expect(await loadPublicCheck(v.cookie)).toMatchObject({ kind: "pending" });
    expect(await runPublicCheck(v.cookie)).toEqual({ ok: true });
  });

  it("concurrent claims cannot overspend: running checks count at their upper-bound cost", async () => {
    // Room for exactly two checks today.
    await sql("insert into public.spend_log (provider, usd, funding) values ('openai', $1, 'free')", [3 - 2 * RESERVE_USD - 0.005]);
    const ids = (await sql<{ id: string }>(
      "insert into public.free_checks (business_name, city, status, visitor_hash) select 'Dental ' || g, 'Austin', 'pending', 'v' || g from generate_series(1, 6) g returning id",
    )).map((r) => r.id);
    const claims = await Promise.all(ids.map((id) => admin.rpc("free_check_claim", { p_id: id, p_reserve: RESERVE_USD, p_day_cap: 3, p_month_cap: 30, p_max_attempts: MAX_ATTEMPTS })));
    const outcomes = claims.map((c) => c.data);
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(2);
    expect(outcomes.filter((o) => o === "day_cap")).toHaveLength(4);
  });

  it("a check is run at most MAX_ATTEMPTS times", async () => {
    const v = visitor(1);
    await start(v);
    await sql("update public.free_checks set attempts = $1", [MAX_ATTEMPTS]);
    expect(await runPublicCheck(v.cookie)).toMatchObject({ ok: false, error: "failed" });
    expect((await sql<{ status: string }>("select status from public.free_checks"))[0].status).toBe("failed");
    expect(await sql("select 1 from public.scans")).toEqual([]);
  });
});

describe("public free check: optional email after the result", () => {
  const capture = (v: Visitor, email: string, marketing = false) =>
    captureResultEmail({ cookie: v.cookie, ip: v.ip, headers: headersOf(v), email, marketing });

  it("is refused before there is a result", async () => {
    const v = visitor(1);
    await start(v);
    expect(await capture(v, "owner@agency.example")).toMatchObject({ ok: false, error: "not_ready" });
  });

  it("sends the result once, marketing stays off unless ticked, and withdrawing deletes the address", async () => {
    const v = visitor(1);
    await start(v);
    await runPublicCheck(v.cookie);
    expect(await capture(v, "owner@agency.example")).toEqual({ ok: true, sent: true });
    const [row] = await sql<{ email: string; marketing_opt_in: boolean; result_sent_at: string | null }>("select email, marketing_opt_in, result_sent_at from public.free_check_emails");
    expect(row).toMatchObject({ email: "owner@agency.example", marketing_opt_in: false });
    expect(row.result_sent_at).not.toBeNull();

    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("AI answers vary between runs, places and time");
    expect(sent[0].text).toContain("We will not email you again.");
    const token = sent[0].text.match(/unsubscribe\?t=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();

    // One email per check: it cannot be used to send more mail.
    expect(await capture(v, "someone-else@agency.example")).toMatchObject({ ok: false, error: "already_sent" });
    expect(sent).toHaveLength(1);

    expect(await withdrawEmail(token!)).toBe(true);
    expect(await sql("select 1 from public.free_check_emails")).toEqual([]);
    expect(await withdrawEmail(token!)).toBe(false);
  });

  it("records product news only when the separate box was ticked", async () => {
    const v = visitor(1);
    await start(v);
    await runPublicCheck(v.cookie);
    await capture(v, "owner@agency.example", true);
    expect((await sql<{ marketing_opt_in: boolean }>("select marketing_opt_in from public.free_check_emails"))[0].marketing_opt_in).toBe(true);
    expect(sent[0].text).toContain("occasional product news");
  });

  it("keeps no address when the email could not be sent", async () => {
    sendWorks = false;
    const v = visitor(1);
    await start(v);
    await runPublicCheck(v.cookie);
    expect(await capture(v, "owner@agency.example")).toMatchObject({ ok: false, error: "not_sent" });
    expect(await sql("select 1 from public.free_check_emails")).toEqual([]);
  });

  it("retention: results after 90 days, result-only addresses after 30, product-news addresses until withdrawn", async () => {
    const a = visitor(1);
    const b = visitor(2, "198.51.100.2");
    await start(a);
    await runPublicCheck(a.cookie);
    await capture(a, "result-only@agency.example");
    await start(b, "Other Dental Studio");
    await runPublicCheck(b.cookie);
    await capture(b, "news@agency.example", true);
    const DAY = 86_400_000;
    expect(await cleanUpFreeChecks(Date.now() + 31 * DAY)).toMatchObject({ emails: 1, results: 0, records: 0 });
    expect((await sql<{ email: string }>("select email from public.free_check_emails")).map((r) => r.email)).toEqual(["news@agency.example"]);
    expect(await cleanUpFreeChecks(Date.now() + 91 * DAY)).toMatchObject({ results: 2 });
    expect(await sql("select 1 from public.scans")).toEqual([]);
    expect(await sql("select 1 from public.reports")).toEqual([]);
    expect(await cleanUpFreeChecks(Date.now() + 181 * DAY)).toMatchObject({ records: 1 }); // the product-news record stays
    expect((await sql("select 1 from public.free_check_emails")).length).toBe(1);
  });

  it("only the browser holding the check can use it", async () => {
    const v = visitor(1);
    await start(v);
    await runPublicCheck(v.cookie);
    const stranger: Visitor = { ...visitor(9, "198.51.100.9"), cookie: `${v.cookie!.split(".")[0]}.${"y".repeat(32)}` };
    expect(await capture(stranger, "owner@agency.example")).toMatchObject({ ok: false, status: 404 });
  });
});
