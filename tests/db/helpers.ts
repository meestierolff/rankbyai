import { PostgrestClient } from "@supabase/postgrest-js";
import { importJWK, SignJWT, type JWK } from "jose";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { dbAdmin, dbAnon, dbUser, type Db } from "@/lib/db/clients";

export const DATA_API_URL = process.env.DATA_API_URL!;
export const DB_URL = process.env.DATABASE_URL!;

/** The application server's client (service role). */
export const admin: Db = dbAdmin();
/** A signed-out visitor. */
export const anon = (): Db => dbAnon();
/** A request with no token at all (or a forged one): must get nothing. */
export const rawClient = (token?: string): Db =>
  new PostgrestClient(DATA_API_URL, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

/** A correctly signed token with arbitrary claims, for cases the app itself never produces. */
export async function signToken(claims: Record<string, unknown>): Promise<string> {
  const jwk = JSON.parse(process.env.DATA_API_JWT_PRIVATE_JWK!) as JWK;
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: jwk.alg ?? "ES256", ...(jwk.kid ? { kid: jwk.kid } : {}) })
    .setIssuedAt(now).setExpirationTime(now + 60).setIssuer("rankbyai").setAudience("rankbyai-data-api")
    .sign(await importJWK(jwk, jwk.alg ?? "ES256"));
}

let pool: pg.Pool | undefined;
export const sql = async <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) => {
  pool ??= new pg.Pool({ connectionString: DB_URL, max: 4 });
  return (await pool.query<T>(text, params)).rows;
};
export const closePool = async () => {
  await pool?.end();
  pool = undefined;
};

export interface TestUser {
  id: string;
  email: string;
  workspaceId: string;
  client: Db;
}

/** Creates a user the way the app does on first sign-in (profile + workspace), plus a client acting as them. */
export async function createTestUser(label: string): Promise<TestUser> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@test.rankbyai.local`;
  const rows = await sql<{ workspace_id: string }>("select public.ensure_user($1, $2) as workspace_id", [id, email]);
  if (!rows[0]?.workspace_id) throw new Error("ensure_user did not create a workspace");
  return { id, email, workspaceId: rows[0].workspace_id, client: dbUser(id) };
}

/** Removes everything the tests created. Only ever runs against the local stack (see tests/setup.ts). */
export async function resetData() {
  await sql(`truncate public.ladder_holds, public.stripe_events, public.credit_ledger, public.entitlements,
    public.orders, public.api_credentials, public.api_keys, public.ai_samples, public.scan_points, public.scans,
    public.audit_findings, public.audits, public.fix_kits, public.reports, public.prospect_batches,
    public.tracked_queries, public.businesses, public.clients, public.free_checks, public.spend_log, public.jobs,
    public.rate_limits, public.removal_requests, public.feature_request_votes, public.feature_requests,
    public.regional_pages, public.geo_cache, public.oauth_tokens, public.oauth_codes, public.oauth_grants,
    public.oauth_clients, public.citation_target_lists, public.cited_pages, public.prompt_pack_runs, public.prompt_packs,
    public.appsumo_codes, public.appsumo_code_batches cascade`);
  await sql(`update public.ladder_lock set base_price_cents = 2900, step_cents = 1000, seats_per_step = 5,
    closes_at = '2026-12-16T13:00:00Z' where id = 1`);
  await sql(`update public.workspaces set plan = 'locked', lifetime_seat = null, stripe_customer_id = null`);
}

export async function deleteTestUsers() {
  await sql(`delete from public.workspaces where owner_id in (select id from public.profiles where email like '%@test.rankbyai.local')`);
  await sql(`delete from public.profiles where email like '%@test.rankbyai.local'`);
}

/** Inserts n paid lifetime orders directly (fast path for ladder maths tests). */
export async function insertLifetimeOrders(workspaceId: string, n: number, status = "paid") {
  const start = (await sql<{ m: number }>("select coalesce(max(ladder_seat), 0)::int as m from public.orders"))[0].m;
  for (let i = 1; i <= n; i++) {
    await sql(
      `insert into public.orders (workspace_id, product_key, amount_cents, status, ladder_seat, ladder_price_cents,
         stripe_checkout_session_id, stripe_payment_intent_id)
       values ($1, 'lifetime', 2900, $2, $3, 2900, $4, $5)`,
      [workspaceId, status, start + i, `cs_test_seed_${randomUUID()}`, `pi_test_seed_${randomUUID()}`],
    );
  }
}
