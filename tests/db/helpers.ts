import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { randomUUID } from "node:crypto";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const DB_URL = process.env.SUPABASE_DB_URL!;

export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const anon = (): SupabaseClient =>
  createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

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
  client: SupabaseClient;
}

/** Creates a confirmed user (the signup trigger builds profile + workspace) and a signed-in client. */
export async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@test.rankbyai.local`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn failed: ${signIn.error.message}`);
  const rows = await sql<{ workspace_id: string }>("select workspace_id from public.workspace_members where user_id = $1", [data.user.id]);
  if (!rows[0]) throw new Error("signup trigger did not create a workspace");
  return { id: data.user.id, email, workspaceId: rows[0].workspace_id, client };
}

/** Removes everything the tests created. Only ever runs against the local stack (see tests/setup.ts). */
export async function resetData() {
  await sql(`truncate public.ladder_holds, public.stripe_events, public.credit_ledger, public.entitlements,
    public.orders, public.api_credentials, public.api_keys, public.ai_samples, public.scan_points, public.scans,
    public.audit_findings, public.audits, public.fix_kits, public.reports, public.prospect_batches,
    public.tracked_queries, public.businesses, public.clients, public.free_checks, public.spend_log, public.jobs,
    public.rate_limits, public.removal_requests, public.feature_request_votes, public.feature_requests,
    public.regional_pages, public.geo_cache cascade`);
  await sql(`update public.ladder_lock set base_price_cents = 2900, step_cents = 1000, seats_per_step = 5,
    closes_at = '2026-12-16T13:00:00Z' where id = 1`);
  await sql(`update public.workspaces set plan = 'locked', lifetime_seat = null, stripe_customer_id = null`);
}

export async function deleteTestUsers() {
  await sql(`delete from auth.users where email like '%@test.rankbyai.local'`);
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
