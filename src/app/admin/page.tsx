import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, ShellSkeleton } from "@/components/app/app-shell";
import { PageHeader, Panel, StatTile, StatusChip, fmtDateTime, fmtUsd } from "@/components/app/ui";
import { requireAdmin } from "@/lib/auth";
import { costEnv } from "@/lib/env";
import { fmtPrice } from "@/lib/ladder";
import { fetchOfferFresh } from "@/lib/offer";
import { dbAdmin } from "@/lib/db/clients";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const instant = false;

export default function AdminPage() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Admin />
    </Suspense>
  );
}

const hoursAgoIso = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** Operator view (ADMIN_USER_IDS only): house spend, failures, ladder, orders, refunds. */
async function Admin() {
  const ctx = await requireAdmin();
  const admin = dbAdmin();
  const env = costEnv.get();
  const since = hoursAgoIso(24);
  const [{ data: spendRows }, offer, { data: orders }, { data: failed }, { count: freeToday }, { count: queued }] = await Promise.all([
    admin.rpc("house_spend"),
    fetchOfferFresh(),
    admin.from("orders").select("id, email, product_key, amount_cents, tax_cents, status, ladder_seat, created_at").order("created_at", { ascending: false }).limit(50),
    admin.from("scans").select("id, kind, funding, status, error, created_at").in("status", ["failed", "partial"]).gte("created_at", since).order("created_at", { ascending: false }).limit(25),
    admin.from("free_checks").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin.from("free_checks").select("id", { count: "exact", head: true }).eq("status", "queued_tomorrow"),
  ]);
  const spend = (spendRows ?? []) as { funding: string; provider: string; usd: number }[];
  const total = (f: string) => spend.filter((r) => r.funding === f).reduce((s, r) => s + Number(r.usd), 0);
  const list = (orders ?? []) as { id: string; email: string | null; product_key: string; amount_cents: number; tax_cents: number; status: string; ladder_seat: number | null; created_at: string }[];
  const paid = list.filter((o) => o.status === "paid");
  const refunded = list.filter((o) => o.status !== "paid");
  const gross = paid.reduce((s, o) => s + o.amount_cents, 0) / 100;

  return (
    <AppShell ctx={ctx}>
      <PageHeader title="Admin" description="House-key spend, failures, the ladder and orders. BYOK scans are the customers' own spend and are not shown here." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <StatTile label="House spend today: included scans" value={fmtUsd(total("credits"), 3)} hint={`Daily cap ${fmtUsd(env.COST_DAILY_HOUSE_CAP_USD)}`} tone={total("credits") > env.COST_DAILY_HOUSE_CAP_USD * 0.8 ? "warn" : undefined} />
        <StatTile label="House spend today: free checks" value={fmtUsd(total("free"), 3)} hint={`Daily cap ${fmtUsd(env.COST_DAILY_FREE_CAP_USD)} · ${freeToday ?? 0} checks in 24 h · ${queued ?? 0} queued`} tone={total("free") > env.COST_DAILY_FREE_CAP_USD * 0.8 ? "warn" : undefined} />
        <StatTile label="Ladder" value={offer.available ? fmtPrice(offer.offer.currentPriceUsd) : "—"} hint={offer.available ? `${offer.paidTotal} paid · ${offer.offer.soldTotal - offer.paidTotal} in checkout · ${offer.offer.seatsLeftAtCurrentPrice} left at this price` : "Offer unavailable"} />
        <StatTile label="Gross, last 50 orders" value={fmtUsd(gross)} hint={`${paid.length} paid · ${refunded.length} refunded`} />
      </div>

      <div role="note" className="mt-6 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-[14px] leading-normal text-muted-foreground">
        Refunds reduce hackathon profit, and Stripe keeps its fee on a refunded payment. A refunded lifetime seat still counts on the ladder.
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="House spend today by provider">
          {spend.length === 0 ? <p className="m-0 text-[15px] text-muted-foreground">No house-key spend today.</p> : (
            <ul className="m-0 flex list-none flex-col p-0">
              {spend.map((r) => (
                <li key={r.funding + r.provider} className="flex justify-between border-b border-line py-2 text-[14px] last:border-b-0">
                  <span>{r.provider} <span className="text-dim">· {r.funding}</span></span>
                  <span className="font-mono">{fmtUsd(Number(r.usd), 4)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Failed or partial scans, last 24 hours">
          {(failed ?? []).length === 0 ? <p className="m-0 text-[15px] text-muted-foreground">None.</p> : (
            <ul className="m-0 flex list-none flex-col p-0">
              {(failed ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-[14px] last:border-b-0">
                  <span className="flex min-w-0 flex-col"><span>{s.kind} · {s.funding} · {fmtDateTime(s.created_at)}</span><span className="truncate text-[13px] text-dim">{s.error ?? "partial result"}</span></span>
                  <StatusChip tone={s.status === "failed" ? "bad" : "warn"}>{s.status}</StatusChip>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Orders" className="mt-6">
        {list.length === 0 ? <p className="m-0 text-[15px] text-muted-foreground">No orders yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
              <thead><tr className="text-[12px] text-dim uppercase">{["When", "Product", "Seat", "Amount", "Tax", "Buyer", "Status"].map((h) => <th key={h} scope="col" className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id} className="border-t border-line">
                    <td className="py-2 pr-4">{fmtDateTime(o.created_at)}</td>
                    <td className="py-2 pr-4">{o.product_key}</td>
                    <td className="py-2 pr-4 font-mono">{o.ladder_seat ? `#${o.ladder_seat}` : "—"}</td>
                    <td className="py-2 pr-4 font-mono">{fmtUsd(o.amount_cents / 100)}</td>
                    <td className="py-2 pr-4 font-mono">{fmtUsd(o.tax_cents / 100)}</td>
                    <td className="max-w-[220px] truncate py-2 pr-4 text-muted-foreground">{o.email ?? "—"}</td>
                    <td className="py-2"><StatusChip tone={o.status === "paid" ? "good" : "warn"}>{o.status.replace("_", " ")}</StatusChip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
