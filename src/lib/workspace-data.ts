import "server-only";
import { memberRead } from "@/lib/db/member-read";
import { REFUND_DAYS, type Engine } from "@/lib/pricing-constants";

/**
 * Reads shared by app pages. Each runs as the signed-in user under row-level security and is also
 * filtered by the workspace id of the verified session; see memberRead for what happens on failure.
 */

export type Provider = "dataforseo" | Engine;
export interface KeyStatus {
  provider: Provider;
  hint: string | null;
  status: "valid" | "invalid" | "unchecked";
  last_validated_at: string | null;
  last_balance_usd: number | null;
}

export async function getKeyStatuses(workspaceId: string): Promise<KeyStatus[]> {
  const cols = "provider, hint, status, last_validated_at, last_balance_usd";
  // Members read the safe view. The server reads the same safe columns from the table (the view
  // shows rows to members only); the encrypted key itself is never selected.
  const { data } = await memberRead("API key status", workspaceId, (db, asServer) => db.from(asServer ? "api_credentials" : "api_credentials_public").select(cols).eq("workspace_id", workspaceId));
  return (data ?? []) as KeyStatus[];
}

export async function getCreditBalance(workspaceId: string): Promise<number> {
  const { data } = await memberRead("Credit balance", workspaceId, (db) => db.from("credit_ledger").select("delta").eq("workspace_id", workspaceId));
  return ((data ?? []) as { delta: number }[]).reduce((s, r) => s + r.delta, 0);
}

export interface OrderRow {
  id: string;
  product_key: "lifetime" | "pack_25" | "pack_100";
  amount_cents: number;
  tax_cents: number;
  status: "paid" | "refunded" | "partially_refunded";
  ladder_seat: number | null;
  created_at: string;
  /** Paid and still inside the refund window. */
  refundable: boolean;
}
export async function getOrders(workspaceId: string): Promise<OrderRow[]> {
  const { data } = await memberRead("Orders", workspaceId, (db) =>
    db
      .from("orders")
      .select("id, product_key, amount_cents, tax_cents, status, ladder_seat, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
  );
  const now = Date.now();
  return ((data ?? []) as Omit<OrderRow, "refundable">[]).map((o) => ({
    ...o,
    refundable: o.status === "paid" && now - new Date(o.created_at).getTime() <= REFUND_DAYS * 86_400_000,
  }));
}

export interface ScanRow {
  id: string;
  business_id: string;
  kind: "maps" | "ai";
  grid_size: number;
  status: "queued" | "running" | "done" | "partial" | "failed";
  funding: string;
  keyword: string | null;
  niche: string | null;
  engines: string[];
  est_cost_usd: number | null;
  actual_cost_usd: number | null;
  summary: Record<string, unknown>;
  created_at: string;
  finished_at: string | null;
  businesses?: { name: string } | null;
}
export async function getRecentScans(workspaceId: string, limit = 8): Promise<ScanRow[]> {
  const { data } = await memberRead("Recent scans", workspaceId, (db) =>
    db
      .from("scans")
      .select("id, business_id, kind, grid_size, status, funding, keyword, niche, engines, est_cost_usd, actual_cost_usd, summary, created_at, finished_at, businesses(name)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  return (data ?? []) as unknown as ScanRow[];
}

/** Spend on the user's OWN keys this calendar month (from scan actuals; never our money). */
export async function getByokSpendThisMonth(workspaceId: string): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await memberRead("Spend this month", workspaceId, (db) =>
    db.from("scans").select("actual_cost_usd").eq("workspace_id", workspaceId).eq("funding", "byok").gte("created_at", start.toISOString()),
  );
  return ((data ?? []) as { actual_cost_usd: number | null }[]).reduce((s, r) => s + Number(r.actual_cost_usd ?? 0), 0);
}

export async function countRows(table: "businesses" | "clients" | "tracked_queries" | "api_keys", workspaceId: string): Promise<number> {
  const { count } = await memberRead(`Count of ${table}`, workspaceId, (db) => db.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId));
  return count ?? 0;
}
