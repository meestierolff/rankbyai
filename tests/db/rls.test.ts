import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, anon, closePool, createTestUser, deleteTestUsers, rawClient, resetData, signToken, sql, type TestUser } from "./helpers";

/**
 * Automated RLS test (M1 acceptance a). Runs against the real local Postgres:
 *   - every public table has RLS enabled
 *   - anon and a second user cannot read any private table
 *   - key ciphertext is unreadable even to the owning member
 *   - members cannot grant themselves a plan, credits or orders
 */
const PRIVATE_TABLES = [
  "profiles", "workspaces", "workspace_members", "api_credentials", "clients", "businesses", "tracked_queries",
  "scans", "scan_points", "ai_samples", "audits", "audit_findings", "fix_kits", "prospect_batches", "reports",
  "orders", "entitlements", "credit_ledger", "ladder_lock", "ladder_holds", "stripe_events", "api_keys",
  "free_checks", "spend_log", "jobs", "rate_limits", "geo_cache", "removal_requests", "feature_request_votes",
];

let a: TestUser;
let b: TestUser;
let businessId: string;
let scanId: string;
let auditId: string;
let orderId: string;

beforeAll(async () => {
  await resetData();
  a = await createTestUser("alice");
  b = await createTestUser("bob");

  // Seed one row in every private table for Alice's workspace (service role).
  const ins = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await admin.from(table).insert(row).select().single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as Record<string, string>;
  };
  await ins("api_credentials", {
    workspace_id: a.workspaceId, provider: "openai",
    ciphertext: "\\x0102", iv: "\\x0304", auth_tag: "\\x0506", hint: "…abcd", status: "valid",
  });
  const client = await ins("clients", { workspace_id: a.workspaceId, name: "Client A" });
  const business = await ins("businesses", { workspace_id: a.workspaceId, client_id: client.id, name: "Northgate Family Dental", city: "Austin" });
  businessId = business.id;
  await ins("tracked_queries", { workspace_id: a.workspaceId, business_id: businessId, kind: "ai", niche: "dentist", grid_size: 3, engines: ["openai"] });
  const scan = await ins("scans", {
    workspace_id: a.workspaceId, business_id: businessId, kind: "ai", grid_size: 3, radius_miles: 2,
    center_lat: 30.27, center_lng: -97.74, funding: "byok", status: "done",
  });
  scanId = scan.id;
  await ins("scan_points", { scan_id: scanId, idx: 0, row: 0, col: 0, lat: 30.27, lng: -97.74 });
  await ins("ai_samples", { scan_id: scanId, point_idx: 0, engine: "openai", prompt: "p", status: "done" });
  const audit = await ins("audits", { workspace_id: a.workspaceId, business_id: businessId, score: 64, status: "done" });
  auditId = audit.id;
  await ins("audit_findings", { audit_id: auditId, priority: "P1", category: "reviews", title: "t", fix: "f", check_key: "k" });
  await ins("fix_kits", { workspace_id: a.workspaceId, business_id: businessId, audit_id: auditId });
  await ins("prospect_batches", { workspace_id: a.workspaceId, mode: "search", niche: "dentist", city: "Austin" });
  await ins("reports", { workspace_id: a.workspaceId, business_id: businessId, kind: "share", share_slug: randomUUID().replace(/-/g, "") });
  const order = await ins("orders", {
    workspace_id: a.workspaceId, user_id: a.id, product_key: "pack_25", amount_cents: 1900,
    stripe_checkout_session_id: `cs_test_${randomUUID()}`, stripe_payment_intent_id: `pi_test_${randomUUID()}`,
  });
  orderId = order.id;
  await ins("entitlements", { workspace_id: a.workspaceId, kind: "pack", credits_granted: 25, source_order_id: orderId });
  await ins("credit_ledger", { workspace_id: a.workspaceId, delta: 25, reason: "pack_purchase", order_id: orderId });
  await ins("ladder_holds", { user_id: a.id, workspace_id: a.workspaceId, price_cents: 2900, expires_at: new Date(Date.now() - 1000).toISOString(), released: true });
  await ins("stripe_events", { id: `evt_${randomUUID()}`, type: "test" });
  await ins("api_keys", { workspace_id: a.workspaceId, name: "k", prefix: "rbai_liv", key_hash: randomUUID() });
  await ins("free_checks", { email_hash: randomUUID() });
  await ins("spend_log", { provider: "openai", usd: 0.01, funding: "free" });
  await ins("jobs", { type: "noop" });
  await admin.from("rate_limits").insert({ key: "k", window_start: new Date().toISOString(), count: 1 });
  await admin.from("geo_cache").insert({ key: "k", kind: "reverse", value: {} });
  await ins("removal_requests", { business_name: "X", email: "x@example.com" });
  const fr = await ins("feature_requests", { workspace_id: a.workspaceId, title: "Apple Maps" });
  await admin.from("feature_request_votes").insert({ request_id: fr.id, user_id: a.id });
});

afterAll(async () => {
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("RLS is enabled everywhere", () => {
  it("every table in schema public has row level security ON", async () => {
    const rows = await sql<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public'",
    );
    expect(rows.length).toBeGreaterThanOrEqual(31);
    expect(rows.filter((r) => !r.rowsecurity).map((r) => r.tablename)).toEqual([]);
  });

  it("views that leave the database are exactly the two public ones", async () => {
    const rows = await sql<{ viewname: string }>("select viewname from pg_views where schemaname = 'public' order by 1");
    expect(rows.map((r) => r.viewname)).toEqual(["api_credentials_public", "ladder_state"]);
  });
});

describe("anon and another user cannot read private tables", () => {
  for (const table of PRIVATE_TABLES) {
    it(`anon reads nothing from ${table}`, async () => {
      const { data, error } = await anon().from(table).select("*");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });

    it(`a second user reads none of Alice's rows from ${table}`, async () => {
      const { data, error } = await b.client.from(table).select("*");
      if (error) return; // permission denied is the strongest outcome
      const rows = (data ?? []) as Record<string, unknown>[];
      const leaked = rows.filter((r) => {
        const json = JSON.stringify(r);
        return json.includes(a.workspaceId) || json.includes(a.id) || json.includes(scanId) || json.includes(auditId);
      });
      expect(leaked).toEqual([]);
    });
  }

  it("anon cannot read the credentials view or feature requests", async () => {
    for (const t of ["api_credentials_public", "feature_requests"]) {
      const { data, error } = await anon().from(t).select("*");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
  });
});

describe("key vault is write-only for members", () => {
  it("the owner cannot read ciphertext, iv or auth_tag", async () => {
    const all = await a.client.from("api_credentials").select("*");
    expect(all.error).not.toBeNull();
    const cols = await a.client.from("api_credentials").select("ciphertext, iv, auth_tag");
    expect(cols.error).not.toBeNull();
  });

  it("the owner sees only safe columns through api_credentials_public", async () => {
    const { data, error } = await a.client.from("api_credentials_public").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(Object.keys(data![0]).sort()).toEqual(
      ["hint", "last_balance_usd", "last_validated_at", "provider", "status", "updated_at", "workspace_id"].sort(),
    );
  });

  it("the membership filter inside the view hides Alice's key from Bob", async () => {
    const { data, error } = await b.client.from("api_credentials_public").select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("members cannot write credentials directly", async () => {
    const { error } = await a.client.from("api_credentials").insert({
      workspace_id: a.workspaceId, provider: "gemini", ciphertext: "\\x00", iv: "\\x00", auth_tag: "\\x00",
    });
    expect(error).not.toBeNull();
  });

  it("api key hashes are never selectable", async () => {
    const hash = await a.client.from("api_keys").select("key_hash");
    expect(hash.error).not.toBeNull();
    const meta = await a.client.from("api_keys").select("id, name, prefix, revoked_at");
    expect(meta.error).toBeNull();
    expect(meta.data).toHaveLength(1);
  });
});

describe("members cannot grant themselves anything", () => {
  it("cannot set their own plan to lifetime (column grant)", async () => {
    const { error } = await a.client.from("workspaces").update({ plan: "lifetime" }).eq("id", a.workspaceId);
    expect(error).not.toBeNull();
    const seat = await a.client.from("workspaces").update({ lifetime_seat: 1 }).eq("id", a.workspaceId);
    expect(seat.error).not.toBeNull();
    const rows = await sql<{ plan: string }>("select plan from public.workspaces where id = $1", [a.workspaceId]);
    expect(rows[0].plan).toBe("locked");
  });

  it("can update brand fields on their own workspace only", async () => {
    const own = await a.client.from("workspaces").update({ brand_name: "Alice Agency" }).eq("id", a.workspaceId).select("brand_name");
    expect(own.error).toBeNull();
    expect(own.data?.[0]?.brand_name).toBe("Alice Agency");
    const other = await b.client.from("workspaces").update({ brand_name: "Hacked" }).eq("id", a.workspaceId).select("brand_name");
    expect(other.data ?? []).toEqual([]);
    const rows = await sql<{ brand_name: string }>("select brand_name from public.workspaces where id = $1", [a.workspaceId]);
    expect(rows[0].brand_name).toBe("Alice Agency");
  });

  it("cannot insert orders, entitlements or credits", async () => {
    const order = await a.client.from("orders").insert({ workspace_id: a.workspaceId, product_key: "lifetime", amount_cents: 0 });
    expect(order.error).not.toBeNull();
    const ent = await a.client.from("entitlements").insert({ workspace_id: a.workspaceId, kind: "pack", credits_granted: 999 });
    expect(ent.error).not.toBeNull();
    const led = await a.client.from("credit_ledger").insert({ workspace_id: a.workspaceId, delta: 999, reason: "gift" });
    expect(led.error).not.toBeNull();
  });

  it("cannot call the server-only functions", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["use_credits", { p_workspace_id: a.workspaceId, p_n: -100 }],
      ["ladder_reserve", { p_user_id: a.id, p_workspace_id: a.workspaceId, p_expected_price_cents: 2900 }],
      ["assign_ladder_seat", {
        p_session_id: "cs_x", p_payment_intent_id: "pi_x", p_workspace_id: a.workspaceId, p_user_id: a.id,
        p_email: a.email, p_amount_cents: 0, p_tax_cents: 0, p_currency: "usd", p_hold_id: null,
      }],
      ["fulfill_pack_order", {
        p_session_id: "cs_y", p_payment_intent_id: "pi_y", p_workspace_id: a.workspaceId, p_user_id: a.id,
        p_email: a.email, p_product_key: "pack_100", p_credits: 100, p_amount_cents: 0, p_tax_cents: 0, p_currency: "usd",
      }],
      ["credit_balance", { p_workspace_id: a.workspaceId }],
      ["claim_jobs", { p_limit: 1 }],
    ];
    for (const [fn, args] of calls) {
      const res = await a.client.rpc(fn, args);
      expect(res.error, fn).not.toBeNull();
      const anonRes = await anon().rpc(fn, args);
      expect(anonRes.error, `anon ${fn}`).not.toBeNull();
    }
  });

  it("cannot write scans or reports directly", async () => {
    const scan = await a.client.from("scans").insert({
      workspace_id: a.workspaceId, business_id: businessId, kind: "ai", grid_size: 3, radius_miles: 2,
      center_lat: 0, center_lng: 0, funding: "credits",
    });
    expect(scan.error).not.toBeNull();
    const upd = await a.client.from("scans").update({ actual_cost_usd: 0 }).eq("id", scanId);
    expect(upd.error).not.toBeNull();
  });
});

describe("members can use what they own", () => {
  it("Alice reads her own workspace data", async () => {
    for (const t of ["businesses", "clients", "scans", "scan_points", "ai_samples", "audits", "audit_findings", "reports", "orders", "credit_ledger"]) {
      const { data, error } = await a.client.from(t).select("*");
      expect(error, t).toBeNull();
      expect((data ?? []).length, t).toBeGreaterThan(0);
    }
  });

  it("Alice can add a business to her workspace but not to Bob's", async () => {
    const ok = await a.client.from("businesses").insert({ workspace_id: a.workspaceId, name: "Second" }).select("id");
    expect(ok.error).toBeNull();
    const bad = await a.client.from("businesses").insert({ workspace_id: b.workspaceId, name: "Intruder" }).select("id");
    expect(bad.error).not.toBeNull();
  });

  it("feature requests: everyone signed in reads, one vote per user", async () => {
    const list = await b.client.from("feature_requests").select("id, title, votes");
    expect(list.error).toBeNull();
    expect(list.data).toHaveLength(1);
    const id = list.data![0].id as string;
    const v1 = await b.client.rpc("vote_feature_request", { p_request_id: id });
    const v2 = await b.client.rpc("vote_feature_request", { p_request_id: id });
    expect(v1.data).toBe(1);
    expect(v2.data).toBe(1);
    const leak = await b.client.from("feature_requests").select("workspace_id");
    expect(leak.error).not.toBeNull();
  });
});

describe("a signed-in request without an identity", () => {
  // The Neon gateway can run a request as "authenticated" without the token's claims. That must be
  // an error the server can retry, never a quiet empty result that looks like "no data yet".
  it("is refused with RB001 instead of returning nothing", async () => {
    const nobody = rawClient(await signToken({ role: "authenticated" })); // no "sub"
    for (const table of ["workspaces", "profiles", "businesses", "scans", "workspace_members"]) {
      const { data, error } = await nobody.from(table).select("*").limit(1);
      expect(data, table).toBeNull();
      expect(error?.code, table).toBe("RB001");
    }
    const insert = await nobody.from("businesses").insert({ workspace_id: a.workspaceId, name: "ghost" });
    expect(insert.error?.code).toBe("RB001");
    expect(await sql("select 1 from public.businesses where name = 'ghost'")).toEqual([]);
  });

  it("visitors and the server are not affected: they have no user id by design", async () => {
    expect((await anon().from("ladder_state").select("sold_total").single()).error).toBeNull();
    expect((await admin.from("workspaces").select("id").limit(1)).error).toBeNull();
  });
});

describe("public ladder view exposes counts only", () => {
  it("anon can read ladder_state and it holds no identities", async () => {
    const { data, error } = await anon().from("ladder_state").select("*").single();
    expect(error).toBeNull();
    expect(Object.keys(data!).sort()).toEqual(
      ["band_index", "base_price_cents", "closes_at", "current_price_cents", "next_price_cents", "paid_total",
       "seats_left_at_current_price", "seats_per_step", "sold_total", "step_cents"].sort(),
    );
  });
});
