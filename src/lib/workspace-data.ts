import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";
import { REFUND_DAYS, type Engine } from "@/lib/pricing-constants";

/** RLS-scoped reads shared by app pages. Every query runs as the signed-in user. */

export type Provider = "dataforseo" | Engine;
export interface KeyStatus {
  provider: Provider;
  hint: string | null;
  status: "valid" | "invalid" | "unchecked";
  last_validated_at: string | null;
  last_balance_usd: number | null;
}

export async function getKeyStatuses(workspaceId: string): Promise<KeyStatus[]> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("api_credentials_public").select("provider, hint, status, last_validated_at, last_balance_usd").eq("workspace_id", workspaceId);
  return (data ?? []) as KeyStatus[];
}

export async function getCreditBalance(workspaceId: string): Promise<number> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("credit_ledger").select("delta").eq("workspace_id", workspaceId);
  return (data ?? []).reduce((s, r) => s + (r.delta as number), 0);
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
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("orders")
    .select("id, product_key, amount_cents, tax_cents, status, ladder_seat, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
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
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("scans")
    .select("id, business_id, kind, grid_size, status, funding, keyword, niche, engines, est_cost_usd, actual_cost_usd, summary, created_at, finished_at, businesses(name)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as ScanRow[];
}

/** Spend on the user's OWN keys this calendar month (from scan actuals; never our money). */
export async function getByokSpendThisMonth(workspaceId: string): Promise<number> {
  const supabase = await createSupabaseServer();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("scans")
    .select("actual_cost_usd")
    .eq("workspace_id", workspaceId)
    .eq("funding", "byok")
    .gte("created_at", start.toISOString());
  return (data ?? []).reduce((s, r) => s + Number(r.actual_cost_usd ?? 0), 0);
}

export async function countRows(table: "businesses" | "clients" | "tracked_queries" | "api_keys", workspaceId: string): Promise<number> {
  const supabase = await createSupabaseServer();
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  return count ?? 0;
}
