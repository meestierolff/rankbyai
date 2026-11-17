#!/usr/bin/env node
/**
 * Security and behaviour check against a HOSTED database (Neon + its Data API).
 *
 *   node scripts/cloud-check.mjs [--env .env.neon.local]
 *
 * The test suite (pnpm test) truncates tables, so it only ever runs against the local stack. This
 * script is the hosted counterpart: it proves, through the real gateway, that row-level security
 * holds and that the claim-style updates the app relies on behave the same as locally.
 * It is safe on a live database: it only touches rows it creates (two throwaway users on
 * @cloud-check.rankbyai.invalid) and removes them at the end, also when a check fails.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PostgrestClient } from "@supabase/postgrest-js";
import { generateKeyPair, importJWK, SignJWT } from "jose";
import pg from "pg";

const envFile = process.argv.includes("--env") ? process.argv[process.argv.indexOf("--env") + 1] : ".env.neon.local";
const env = Object.fromEntries(
  readFileSync(envFile, "utf8").split("\n").filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
for (const k of ["DATABASE_URL", "DATA_API_URL", "DATA_API_JWT_PRIVATE_JWK"]) if (!env[k]) throw new Error(`${envFile} is missing ${k}`);

const API = env.DATA_API_URL.replace(/\/$/, "");
const jwk = JSON.parse(env.DATA_API_JWT_PRIVATE_JWK);
const key = await importJWK(jwk, jwk.alg ?? "ES256");
const EMAIL_DOMAIN = "cloud-check.rankbyai.invalid";

async function token(role, sub, over = {}) {
  const now = Math.floor(Date.now() / 1000);
  const t = new SignJWT({ role, ...(over.claims ?? {}) })
    .setProtectedHeader({ alg: jwk.alg ?? "ES256", kid: jwk.kid })
    .setIssuedAt(over.iat ?? now)
    .setExpirationTime(over.exp ?? now + 120)
    .setIssuer("rankbyai")
    .setAudience(over.aud ?? "rankbyai-data-api");
  if (sub) t.setSubject(sub);
  return t.sign(over.key ?? key);
}

async function api(path, { tok, method = "GET", body, headers = {}, raw = false } = {}) {
  // Like the app (src/lib/db/clients.ts): a request refused with RB001 (identity missing on a new
  // gateway connection) is sent again. `raw` switches that off, to observe the refusal itself.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), Prefer: "return=representation", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (raw || attempt >= 4 || data?.code !== "RB001") return { status: res.status, data };
    await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
  }
}

const PRIVATE_TABLES = ["profiles", "workspaces", "workspace_members", "businesses", "orders", "entitlements", "api_credentials", "scans", "scan_points", "ai_samples", "reports", "free_checks", "api_keys", "credit_ledger", "stripe_events", "spend_log"];
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : `\n    ${detail}`}`);
}
const brief = (r) => `HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 220)}`;
const denied = (r) => r.status === 401 || r.status === 403 || r.status === 404 || (Array.isArray(r.data) && r.data.length === 0);
const refused = (r) => r.status === 401 || r.status === 403;

const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();
const q = async (text, params = []) => (await db.query(text, params)).rows;

/** The app's own database client with the app's retry rule (src/lib/db/clients.ts), pointed at this gateway. */
function appClient(role, sub) {
  return new PostgrestClient(API, {
    fetch: async (input, init) => {
      for (let attempt = 0; ; attempt++) {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${await token(role, sub)}`);
        const res = await fetch(input, { ...init, headers });
        if (role !== "authenticated" || attempt >= 4 || res.ok) return res;
        const body = await res.clone().json().catch(() => null);
        if (body?.code !== "RB001") return res;
        await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
      }
    },
  });
}

async function cleanup() {
  await q(`delete from public.geo_cache where key like 'cloud-check:%'`);
  await q(`delete from public.free_checks where ip_hash = 'cloud-check'`);
  await q(`delete from public.workspaces where owner_id in (select id from public.profiles where email like $1)`, [`%@${EMAIL_DOMAIN}`]);
  await q(`delete from public.profiles where email like $1`, [`%@${EMAIL_DOMAIN}`]);
}

try {
  await cleanup();
  const [a, b] = [randomUUID(), randomUUID()];
  const wsA = (await q("select public.ensure_user($1, $2) as ws", [a, `a-${a.slice(0, 8)}@${EMAIL_DOMAIN}`]))[0].ws;
  const wsB = (await q("select public.ensure_user($1, $2) as ws", [b, `b-${b.slice(0, 8)}@${EMAIL_DOMAIN}`]))[0].ws;

  const service = await token("service_role");
  const anon = await token("anonymous");
  const userA = await token("authenticated", a);
  const userB = await token("authenticated", b);

  // ── the gateway accepts our tokens and switches role ──
  let r = await api("/ladder_state?select=*", { tok: service });
  check("server token is accepted (service role)", r.status === 200 && Array.isArray(r.data) && r.data.length === 1, brief(r));
  r = await api("/workspaces?select=id", { tok: service });
  check("server sees every workspace", r.status === 200 && [wsA, wsB].every((id) => r.data.some((w) => w.id === id)), brief(r));

  // ── tokens that must be rejected ──
  const { privateKey: strangerKey } = await generateKeyPair("ES256");
  r = await api("/workspaces?select=id", { tok: await token("service_role", undefined, { key: strangerKey }) });
  check("a token signed with another key is rejected", refused(r), brief(r));
  r = await api("/workspaces?select=id", { tok: await token("service_role", undefined, { aud: "someone-else" }) });
  check("a token for another audience is rejected", refused(r), brief(r));
  const past = Math.floor(Date.now() / 1000) - 3600;
  r = await api("/workspaces?select=id", { tok: await token("service_role", undefined, { iat: past - 60, exp: past }) });
  check("an expired token is rejected", refused(r), brief(r));
  r = await api("/workspaces?select=id", { tok: await token("neondb_owner") });
  check("a token cannot name the database owner role", r.status >= 400, brief(r));

  // ── visitors: public data only ──
  // A request without any token: this gateway refuses it outright (PostgREST would treat it as anonymous).
  r = await api("/ladder_state?select=*");
  check("no token: refused, or public data only", r.status === 401 || (r.status === 200 && r.data.length === 1), brief(r));
  for (const t of PRIVATE_TABLES) {
    r = await api(`/${t}?select=*&limit=1`);
    if (!denied(r)) check(`no token: cannot read ${t}`, false, brief(r));
  }
  check("no token: cannot read any private table", true);

  r = await api("/ladder_state?select=*", { tok: anon });
  check("visitor: can read the public price ladder", r.status === 200 && r.data.length === 1, brief(r));
  for (const t of PRIVATE_TABLES) {
    r = await api(`/${t}?select=*&limit=1`, { tok: anon });
    if (!denied(r)) check(`visitor: cannot read ${t}`, false, brief(r));
  }
  check("visitor: cannot read any private table", true);
  r = await api("/rpc/ensure_user", { tok: anon, method: "POST", body: { p_id: randomUUID(), p_email: `x@${EMAIL_DOMAIN}` } });
  check("visitor: cannot call server functions", r.status >= 400, brief(r));
  r = await api("/user?select=*&limit=1", { tok: service, headers: { "Accept-Profile": "neon_auth" } });
  check("the sign-in schema (neon_auth) is not reachable through the API", r.status >= 400, brief(r));

  // ── tenant isolation ──
  r = await api("/businesses", { tok: service, method: "POST", body: { workspace_id: wsB, name: "Cloud check B", lat: 52.37, lng: 4.9 } });
  const bizB = r.data?.[0]?.id;
  check("server can insert", r.status === 201 && !!bizB, brief(r));
  r = await api("/workspaces?select=id", { tok: userA });
  check("user A sees exactly their own workspace", r.status === 200 && r.data.length === 1 && r.data[0].id === wsA, brief(r));
  r = await api("/profiles?select=id", { tok: userA });
  check("user A sees exactly their own profile", r.status === 200 && r.data.length === 1 && r.data[0].id === a, brief(r));
  r = await api("/workspace_members?select=user_id", { tok: userA });
  check("user A sees only their own membership", r.status === 200 && r.data.length === 1 && r.data[0].user_id === a, brief(r));
  r = await api(`/workspaces?id=eq.${wsA}&select=id,brand_name`, { tok: userA, method: "PATCH", body: { brand_name: "Cloud check" } });
  check("user A can set branding on their own workspace", r.status === 200 && r.data?.[0]?.brand_name === "Cloud check", brief(r));
  r = await api(`/workspaces?id=eq.${wsB}&select=id`, { tok: userA, method: "PATCH", body: { brand_name: "taken over" } });
  check("user A cannot set branding on user B's workspace", Array.isArray(r.data) ? r.data.length === 0 : r.status >= 400, brief(r));

  // Many interleaved requests. The gateway pools connections, so prove identities never mix.
  // Known gateway behaviour: the first request on a new connection can arrive without the token's
  // claims. The database then answers RB001 (never an empty result), and the app retries.
  const once = (i) => {
    const [tok, own] = i % 2 ? [userA, wsA] : [userB, wsB];
    return api("/workspaces?select=id", { tok, raw: true }).then((res) => ({ res, own, tok }));
  };
  const first = await Promise.all(Array.from({ length: 60 }, (_, i) => once(i)));
  const isOwn = ({ res, own }) => res.status === 200 && res.data.length === 1 && res.data[0].id === own;
  const isRetry = ({ res }) => res.data?.code === "RB001";
  const leaked = first.filter(({ res, own }) => Array.isArray(res.data) && res.data.some((w) => w.id !== own));
  check("60 interleaved requests: nobody ever sees another workspace", leaked.length === 0, `${leaked.length} responses contained a foreign workspace`);
  const silent = first.filter((x) => !isOwn(x) && !isRetry(x));
  check("60 interleaved requests: a request without its identity is refused, never answered with nothing", silent.length === 0, `${silent.length} silent wrong answers, e.g. ${silent[0] ? brief(silent[0].res) : ""}`);
  let pending = first.filter(isRetry);
  const refusedFirst = pending.length;
  for (let attempt = 0; attempt < 4 && pending.length; attempt++) {
    await new Promise((res) => setTimeout(res, 40 * (attempt + 1)));
    const again = await Promise.all(pending.map(({ tok, own }) => api("/workspaces?select=id", { tok, raw: true }).then((res) => ({ res, own, tok }))));
    const bad = again.filter((x) => !isOwn(x) && !isRetry(x));
    if (bad.length) check("retried requests answer correctly", false, brief(bad[0].res));
    pending = again.filter(isRetry);
  }
  check(`with the app's retry rule everybody gets their own workspace (${refusedFirst} of 60 needed a retry)`, pending.length === 0, `${pending.length} still refused after 4 retries`);

  r = await api(`/businesses?select=id&id=eq.${bizB}`, { tok: userA });
  check("user A cannot read user B's business", r.status === 200 && r.data.length === 0, brief(r));
  r = await api(`/businesses?id=eq.${bizB}`, { tok: userA, method: "PATCH", body: { name: "taken over" } });
  check("user A cannot change user B's business", Array.isArray(r.data) ? r.data.length === 0 : r.status >= 400, brief(r));
  r = await api("/businesses", { tok: userA, method: "POST", body: { workspace_id: wsB, name: "planted" } });
  check("user A cannot insert into user B's workspace", r.status >= 400, brief(r));
  r = await api(`/businesses?select=id&id=eq.${bizB}`, { tok: userB });
  check("user B reads their own business", r.status === 200 && r.data.length === 1, brief(r));
  r = await api("/businesses", { tok: userA, method: "POST", body: { workspace_id: wsA, name: "Cloud check A", lat: 52.37, lng: 4.9 } });
  const bizA = r.data?.[0]?.id;
  check("user A can add a business to their own workspace", r.status === 201 && !!bizA, brief(r));

  // ── a user cannot give themselves a plan, credits or secrets ──
  r = await api(`/workspaces?id=eq.${wsA}`, { tok: userA, method: "PATCH", body: { plan: "lifetime" } });
  const plan = (await q("select plan from public.workspaces where id = $1", [wsA]))[0].plan;
  check("user A cannot upgrade their own plan", plan === "locked", `plan is now ${plan}; ${brief(r)}`);
  r = await api("/credit_ledger", { tok: userA, method: "POST", body: { workspace_id: wsA, delta: 1000, reason: "grant" } });
  check("user A cannot grant themselves credits", r.status >= 400, brief(r));
  r = await api("/orders", { tok: userA, method: "POST", body: { workspace_id: wsA, product_key: "lifetime", amount_cents: 0, status: "paid" } });
  check("user A cannot create an order", r.status >= 400, brief(r));
  r = await api("/api_credentials?select=*", { tok: userA });
  check("user A cannot read stored key ciphertext", denied(r), brief(r));
  r = await api("/rpc/claim_scan", { tok: userA, method: "POST", body: { p_scan_id: randomUUID() } });
  check("user A cannot call server functions", r.status >= 400, brief(r));

  // ── claim-style updates return the changed row through this gateway ──
  const scanId = (await q(
    `insert into public.scans (workspace_id, business_id, kind, grid_size, radius_miles, center_lat, center_lng, funding, status)
     values ($1, $2, 'maps', 3, 2, 52.37, 4.9, 'byok', 'queued') returning id`, [wsA, bizA]))[0].id;
  r = await api("/rpc/claim_scan", { tok: service, method: "POST", body: { p_scan_id: scanId, p_lease_seconds: 60 } });
  check("claim_scan returns the claimed scan", r.status === 200 && r.data?.[0]?.id === scanId && r.data[0].status === "running", brief(r));
  r = await api("/rpc/claim_scan", { tok: service, method: "POST", body: { p_scan_id: scanId, p_lease_seconds: 60 } });
  check("a second claim of the same scan gets nothing", r.status === 200 && r.data.length === 0, brief(r));
  r = await api(`/scans?select=id&status=in.(queued,running)&or=(lease_until.is.null,lease_until.lt.${new Date().toISOString()})&id=eq.${scanId}`, { tok: service });
  check("a leased scan is not reported as stalled", r.status === 200 && r.data.length === 0, brief(r));

  await q("update public.scans set status = 'failed', lease_until = null where id = $1", [scanId]);
  r = await api(`/scans?id=eq.${scanId}&status=in.(partial,failed)&select=id`, { tok: service, method: "PATCH", body: { status: "queued", error: null, finished_at: null, lease_until: null } });
  check("retry: reopening a failed scan returns the row", r.status === 200 && r.data.length === 1, brief(r));

  const fcId = (await q("insert into public.free_checks (email_hash, ip_hash, business_name, city) values ($1, 'cloud-check', 'x', 'y') returning id", [`pending:${randomUUID()}`]))[0].id;
  r = await api(`/free_checks?id=eq.${fcId}&email_hash=like.pending:*&select=*`, { tok: service, method: "PATCH", body: { email_hash: `cloud-check-${randomUUID()}` } });
  check("free check: binding the email returns the row", r.status === 200 && r.data.length === 1, brief(r));
  r = await api(`/free_checks?id=eq.${fcId}&status=in.(pending,queued_tomorrow,failed)&select=id`, { tok: service, method: "PATCH", body: { status: "running" } });
  check("free check: claiming it returns the row", r.status === 200 && r.data.length === 1, brief(r));
  r = await api(`/free_checks?id=eq.${fcId}&status=in.(pending,queued_tomorrow,failed)&select=id`, { tok: service, method: "PATCH", body: { status: "running" } });
  check("free check: a second claim gets nothing", r.status === 200 && r.data.length === 0, brief(r));

  const due = new Date(Date.now() - 60_000).toISOString();
  const tqId = (await q(
    `insert into public.tracked_queries (workspace_id, business_id, kind, grid_size, keyword, schedule, next_run_at)
     values ($1, $2, 'maps', 3, 'cloud check', 'weekly', $3) returning id`, [wsA, bizA, due]))[0].id;
  const next = new Date(Date.now() + 7 * 86_400_000).toISOString();
  r = await api(`/tracked_queries?id=eq.${tqId}&next_run_at=eq.${encodeURIComponent(due)}&select=id`, { tok: service, method: "PATCH", body: { next_run_at: next } });
  check("schedule: claiming a due schedule returns the row", r.status === 200 && r.data.length === 1, brief(r));
  r = await api(`/tracked_queries?id=eq.${tqId}&next_run_at=eq.${encodeURIComponent(due)}&select=id`, { tok: service, method: "PATCH", body: { next_run_at: next } });
  check("schedule: a second claim gets nothing", r.status === 200 && r.data.length === 0, brief(r));

  // ── the app's client library against this gateway (the shapes the app code depends on) ──
  const svc = appClient("service_role");
  const asA = appClient("authenticated", a);
  const show = (x) => JSON.stringify(x).slice(0, 220);

  let c = await svc.from("businesses").insert({ workspace_id: wsA, name: "Client check", lat: 52.37, lng: 4.9 }).select("id, name").single();
  check("client: insert().select().single() returns one object", !c.error && typeof c.data?.id === "string" && !Array.isArray(c.data), show(c));
  const clientBiz = c.data?.id;
  c = await svc.from("businesses").update({ name: "Client check 2" }).eq("id", clientBiz).select("id, name").maybeSingle();
  check("client: update().select().maybeSingle() returns the changed row", !c.error && c.data?.name === "Client check 2", show(c));
  c = await svc.from("businesses").update({ name: "never" }).eq("id", randomUUID()).select("id").maybeSingle();
  check("client: maybeSingle() with no match gives null without an error", c.error === null && c.data === null, show(c));
  c = await asA.from("businesses").select("id").eq("id", bizB).maybeSingle();
  check("client: a row behind RLS reads as null, not as an error", c.error === null && c.data === null, show(c));

  c = await asA.from("workspace_members").select("role, workspaces(*)").eq("user_id", a).order("created_at", { ascending: true }).limit(1);
  const embedded = Array.isArray(c.data?.[0]?.workspaces) ? c.data[0].workspaces[0] : c.data?.[0]?.workspaces;
  check("client: the session query (membership with its workspace embedded) works", !c.error && c.data?.[0]?.role === "owner" && embedded?.id === wsA && embedded?.plan === "locked", show(c));

  c = await svc.rpc("credit_balance", { p_workspace_id: wsA });
  check("client: a function returning a number gives a bare number", c.error === null && c.data === 0, show(c));
  await q("insert into public.credit_ledger (workspace_id, delta, reason, ref) values ($1, 2, 'pack', 'cloud-check')", [wsA]);
  c = await svc.rpc("use_credits", { p_workspace_id: wsA, p_n: 1, p_reason: "cloud_check", p_ref: "cloud-check" });
  check("client: use_credits returns the bare value true when the balance covers it", c.error === null && c.data === true, show(c));
  c = await svc.rpc("use_credits", { p_workspace_id: wsA, p_n: 5, p_reason: "cloud_check", p_ref: "cloud-check" });
  check("client: use_credits returns the bare value false when it does not", c.error === null && c.data === false, show(c));
  c = await svc.rpc("credit_balance", { p_workspace_id: wsA });
  check("client: the balance is 1 after spending 1 of 2", c.data === 1, show(c));
  c = await svc.rpc("ensure_user", { p_id: a, p_email: `a-${a.slice(0, 8)}@${EMAIL_DOMAIN}` });
  check("client: ensure_user returns the existing workspace id for a known user", c.error === null && c.data === wsA, show(c));
  c = await svc.rpc("claim_scan", { p_scan_id: randomUUID(), p_lease_seconds: 60 });
  check("client: a set-returning function with no rows gives an empty list", c.error === null && Array.isArray(c.data) && c.data.length === 0, show(c));

  const cacheKey = `cloud-check:${randomUUID()}`;
  c = await svc.from("geo_cache").upsert({ key: cacheKey, kind: "places", value: [{ name: "one" }] });
  const again = await svc.from("geo_cache").upsert({ key: cacheKey, kind: "places", value: [{ name: "two" }] });
  const cached = await svc.from("geo_cache").select("value").eq("key", cacheKey).maybeSingle();
  check("client: upsert inserts, then overwrites the same key", c.error === null && again.error === null && cached.data?.value?.[0]?.name === "two", show({ c, again, cached }));

  c = await svc.from("businesses").select("id", { count: "exact", head: true }).eq("workspace_id", wsA);
  check("client: an exact count without rows works", c.error === null && c.count === 2 && c.data === null, show(c));
  c = await svc.from("businesses").select("id, name").in("id", [clientBiz, bizA]).not("lat", "is", null).like("name", "Client%").order("created_at", { ascending: false }).limit(5);
  check("client: in / not-is-null / like / order / limit filters work together", c.error === null && c.data?.length === 1 && c.data[0].id === clientBiz, show(c));
  c = await appClient("anonymous").from("ladder_state").select("sold_total, current_price_cents").single();
  check("client: a visitor reads the price ladder as one object", c.error === null && typeof c.data?.current_price_cents === "number", show(c));
  c = await asA.from("orders").insert({ workspace_id: wsA, product_key: "lifetime", amount_cents: 0, status: "paid" });
  check("client: a refused write reports a permission error", c.error?.code === "42501", show(c));

} finally {
  await cleanup().catch((e) => console.error("cleanup failed:", e.message));
  const left = await q("select count(*)::int as n from public.profiles where email like $1", [`%@${EMAIL_DOMAIN}`]);
  check("cleanup removed every test row", left[0].n === 0);
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
