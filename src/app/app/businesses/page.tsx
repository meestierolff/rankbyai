import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AddBusiness } from "@/components/app/add-business";
import { plural } from "@/components/app/first-run";
import { LocalTime } from "@/components/app/local-time";
import { EmptyState, Note, PageHeader, Panel, PrimaryLink, cardClass } from "@/components/app/ui";
import { secondaryClass } from "@/components/brand/primitives";
import { requireSession } from "@/lib/auth";
import { memberRead } from "@/lib/db/member-read";
import { isMockMode } from "@/lib/mock";
import { DATAFORSEO_MAPS_PER_POINT } from "@/lib/pricing-constants";
import { getCreditBalance, getKeyStatuses } from "@/lib/workspace-data";

export const metadata: Metadata = { title: "Businesses" };

interface Row {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  region: string | null;
  primary_category: string | null;
  rating: number | null;
  reviews_count: number | null;
}
interface ScanLite {
  business_id: string;
  kind: "ai" | "maps";
  grid_size: number;
  summary: { points_mentioned?: number; points?: number; avg_rank?: number | null; solv?: number | null; share_of_ai_voice?: number | null };
  created_at: string;
}

export default async function BusinessesPage() {
  const ctx = await requireSession("/app/businesses");
  const wsId = ctx.workspace.id;
  // Both reads are filtered by the session's workspace id and go through memberRead: a read that
  // fails throws (the page's error state shows); it never comes back as "No businesses yet".
  const [{ data }, keys, credits, { data: scanRows }] = await Promise.all([
    memberRead("Businesses", wsId, (db) =>
      db.from("businesses").select("id, name, address, city, region, primary_category, rating, reviews_count").eq("workspace_id", wsId).neq("source", "prospect").order("created_at", { ascending: false }).limit(500),
    ),
    getKeyStatuses(wsId),
    getCreditBalance(wsId),
    memberRead("Finished scans", wsId, (db) =>
      db.from("scans").select("business_id, kind, grid_size, summary, created_at").eq("workspace_id", wsId).in("status", ["done", "partial"]).order("created_at", { ascending: false }).limit(1000),
    ),
  ]);
  const rows = (data ?? []) as Row[];
  // Latest finished scan of each kind per business (rows arrive newest first).
  const latest = new Map<string, ScanLite>();
  for (const s of (scanRows ?? []) as ScanLite[]) {
    const key = `${s.business_id}:${s.kind}`;
    if (!latest.has(key)) latest.set(key, s);
  }
  const locked = ctx.workspace.plan !== "lifetime";
  const hasDfs = isMockMode() || keys.some((k) => k.provider === "dataforseo" && k.status === "valid");
  const searchCost = `$${DATAFORSEO_MAPS_PER_POINT.live.toFixed(3)}`;
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

  return (
    <>
      <PageHeader title="Businesses" description="The businesses you track. Search by name, confirm the Google listing, then run checks on it." />
      <Panel title="Add a business">
        {locked ? (
          <AddBusiness disabled disabledReason="Adding businesses needs lifetime access." />
        ) : hasDfs ? (
          <AddBusiness />
        ) : (
          // The listing search (GET /api/businesses/search) runs on the workspace's own DataForSEO
          // key only. Say so here instead of letting the search fail after submit.
          <div className="flex flex-col items-start gap-4">
            <Note>
              <span className="text-fg">Adding a business needs your own DataForSEO login.</span> The form searches Google Maps for the listing, and that one lookup ({searchCost} per search) runs on your key.
              {credits > 0
                ? ` Your ${plural(credits, "included scan credit")} cannot pay for this search today; ${credits === 1 ? "it pays" : "they pay"} for the scans you run afterwards.`
                : " Included scan credits cannot pay for this search today."}
            </Note>
            <PrimaryLink href="/app/settings/keys">Add your DataForSEO login</PrimaryLink>
          </div>
        )}
      </Panel>
      <div className="mt-6 flex flex-col gap-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No businesses yet"
            body={
              hasDfs || locked
                ? "Search for your client's Google listing above and confirm it. You need a business before you can run an AI check, a Maps grid or an audit."
                : "Once your DataForSEO login is saved, search for your client's Google listing here and confirm it. You need a business before you can run an AI check, a Maps grid or an audit."
            }
          />
        ) : (
          rows.map((b) => {
            const ai = latest.get(`${b.id}:ai`);
            const maps = latest.get(`${b.id}:maps`);
            return (
              <article key={b.id} className={`${cardClass} flex min-w-0 flex-col gap-4 p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link href={`/app/businesses/${b.id}`} className="truncate text-[18px] font-semibold text-fg no-underline hover:underline">{b.name}</Link>
                    <span className="text-[13px] text-dim">
                      {[b.primary_category, b.address ?? [b.city, b.region].filter(Boolean).join(", "), b.rating != null ? `${Number(b.rating).toFixed(1)}★ (${b.reviews_count ?? 0})` : null].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/app/maps-grid?business=${b.id}`} className={secondaryClass()}>Maps grid</Link>
                    <Link href={`/app/ai-visibility?business=${b.id}`} className={secondaryClass()}>AI check</Link>
                  </div>
                </div>
                <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-4">
                  <Metric label="AI: points named" value={ai ? `${ai.summary.points_mentioned ?? 0}/${ai.summary.points ?? ai.grid_size * ai.grid_size}` : "—"} hint={ai ? <LocalTime iso={ai.created_at} mode="date" /> : "No AI check yet"} />
                  <Metric label="Share of AI Voice" value={pct(ai?.summary.share_of_ai_voice)} hint={ai ? `${ai.grid_size}×${ai.grid_size} grid` : ""} />
                  <Metric label="Maps: average rank" value={maps?.summary.avg_rank != null ? String(maps.summary.avg_rank) : "—"} hint={maps ? <LocalTime iso={maps.created_at} mode="date" /> : "No Maps grid yet"} />
                  <Metric label="Share of Local Voice" value={pct(maps?.summary.solv)} hint={maps ? `${maps.grid_size}×${maps.grid_size} grid` : ""} />
                </dl>
              </article>
            );
          })
        )}
      </div>
    </>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="m-0 font-mono text-[22px] leading-none font-semibold">{value}</dd>
      <span className="text-[12px] text-dim">{hint}</span>
    </div>
  );
}
