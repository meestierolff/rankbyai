import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CombinedView } from "@/components/app/combined-view";
import type { MapPoint } from "@/components/app/grid-map";
import { DeleteBusiness } from "@/components/app/delete-business";
import { ShareLinkCard } from "@/components/app/m3-controls";
import { LocalTime } from "@/components/app/local-time";
import { userRead } from "@/components/app/reads";
import { EmptyState, PageHeader, Panel, PrimaryLink, SecondaryLink, StatTile, StatusChip, fmtUsd } from "@/components/app/ui";
import { aiCellColors, mapsCellColors, pointName, skippedCell } from "@/components/brand/grid";
import { requireSession } from "@/lib/auth";
import { memberRead } from "@/lib/db/member-read";
import { linkDomainFor } from "@/lib/domains-server";
import { combinedInsight, type AiSummary, type MapsSummary } from "@/lib/scans/summary";
import { BusinessDetails } from "@/components/app/business-details";
import { languageNameFor } from "@/lib/countries";
import { isServiceArea } from "@/lib/service-area";

export const metadata: Metadata = { title: "Business" };

interface ScanLite {
  id: string;
  kind: "ai" | "maps";
  grid_size: number;
  radius_miles: number;
  center_lat: number | null;
  center_lng: number | null;
  status: string;
  keyword: string | null;
  niche: string | null;
  summary: Record<string, unknown>;
  actual_cost_usd: number | null;
  created_at: string;
}

interface BusinessRow {
  id: string;
  name: string;
  primary_category: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  rating: number | null;
  reviews_count: number | null;
  website: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  country: string | null;
  cid: string | null;
  language: string | null;
}

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession("/app/businesses");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const wsId = ctx.workspace.id;
  // Every read below that can carry the workspace filter does, and goes through memberRead: a
  // failed read throws (error state), and only "no such row in this workspace" is a 404.
  const { data: found } = await memberRead("Business", wsId, (db) =>
    db.from("businesses").select("id, name, primary_category, address, city, region, rating, reviews_count, website, phone, lat, lng, country, cid, language").eq("id", id).eq("workspace_id", wsId).maybeSingle(),
  );
  const b = found as BusinessRow | null;
  if (!b) notFound();

  const [{ data: scanRows }, { data: shareRows }] = await Promise.all([
    memberRead("Scans of this business", wsId, (db) =>
      db
        .from("scans")
        .select("id, kind, grid_size, radius_miles, center_lat, center_lng, status, keyword, niche, summary, actual_cost_usd, created_at")
        .eq("workspace_id", wsId)
        .eq("business_id", id)
        .order("created_at", { ascending: false })
        .limit(30),
    ),
    memberRead("Share link", wsId, (db) =>
      db.from("reports").select("share_slug").eq("workspace_id", wsId).eq("business_id", id).eq("kind", "share").eq("revoked", false).order("created_at", { ascending: false }).limit(1),
    ),
  ]);
  const scans = (scanRows ?? []) as ScanLite[];
  const share = ((shareRows ?? []) as { share_slug: string }[])[0] ?? null;
  const usable = (s: ScanLite) => s.status === "done" || s.status === "partial";
  const latestMaps = scans.find((s) => s.kind === "maps" && usable(s)) ?? null;
  const latestAi = scans.find((s) => s.kind === "ai" && usable(s)) ?? null;
  // The combined map is centred where the latest grids were run (a grid can be centred away from the pin).
  const scanCentre = [latestMaps, latestAi].find((s) => s?.center_lat != null && s?.center_lng != null);
  const combinedCentre = scanCentre ? { lat: Number(scanCentre.center_lat), lng: Number(scanCentre.center_lng) } : { lat: Number(b.lat ?? 0), lng: Number(b.lng ?? 0) };

  let mapsPts: MapPoint[] | null = null;
  let aiPts: MapPoint[] | null = null;
  if (latestMaps) {
    // scan_points and ai_samples have no workspace_id column: signed-in read under row-level
    // security, throwing on failure (see components/app/reads). The scan ids come from the
    // workspace-filtered read above.
    const mapsId = latestMaps.id;
    const data = await userRead("Maps grid points", (db) => db.from("scan_points").select("idx, row, col, lat, lng, rank, status").eq("scan_id", mapsId).order("idx"));
    mapsPts = ((data ?? []) as { idx: number; row: number; col: number; lat: number; lng: number; rank: number | null; status: string }[])
      .filter((p) => p.status === "done" || p.status === "skipped")
      .map((p) => p.status === "skipped" ? { key: `m${p.idx}`, lat: p.lat, lng: p.lng, ...skippedCell(pointName(p.row, p.col)) } : ({ key: `m${p.idx}`, lat: p.lat, lng: p.lng, ...mapsCellColors(p.rank), title: `Maps point ${pointName(p.row, p.col)}: ${p.rank ? `rank #${p.rank}` : "not in the top 20"}` }));
  }
  if (latestAi) {
    const aiId = latestAi.id;
    const [pts, smp] = await Promise.all([
      userRead("AI grid points", (db) => db.from("scan_points").select("idx, row, col, lat, lng, status").eq("scan_id", aiId).order("idx")),
      userRead("AI answers", (db) => db.from("ai_samples").select("point_idx, status, mentioned, mention_position").eq("scan_id", aiId)),
    ]);
    const samples = (smp ?? []) as { point_idx: number; status: string; mentioned: boolean | null; mention_position: number | null }[];
    aiPts = ((pts ?? []) as { idx: number; row: number; col: number; lat: number; lng: number; status: string }[]).map((p) => {
      if (p.status === "skipped") return { key: `a${p.idx}`, lat: p.lat, lng: p.lng, ...skippedCell(pointName(p.row, p.col)) };
      const done = samples.filter((s) => s.point_idx === p.idx && s.status === "done");
      const hits = done.filter((s) => s.mentioned);
      const best = hits.length ? Math.min(...hits.map((s) => s.mention_position ?? 5)) : null;
      return { key: `a${p.idx}`, lat: p.lat, lng: p.lng, ...aiCellColors(best), label: done.length ? `${hits.length}/${done.length}` : "!", title: `AI point ${pointName(p.row, p.col)}: named by ${hits.length} of ${done.length} engines` };
    });
  }
  const insight = combinedInsight((latestMaps?.summary as unknown as MapsSummary) ?? null, (latestAi?.summary as unknown as AiSummary) ?? null);
  const mapsSum = latestMaps?.summary as { avg_rank?: number; top3_points?: number; points_done?: number } | undefined;
  const aiSum = latestAi?.summary as { points_mentioned?: number; points?: number } | undefined;

  return (
    <>
      <PageHeader
        title={b.name}
        description={[b.primary_category, b.address ?? [b.city, b.region].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
        actions={
          <>
            <SecondaryLink href={`/app/maps-grid?business=${b.id}`}>Run Maps grid</SecondaryLink>
            <PrimaryLink href={`/app/ai-visibility?business=${b.id}`}>Run AI check</PrimaryLink>
          </>
        }
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        <StatTile label="Google rating" value={b.rating != null ? `${Number(b.rating).toFixed(1)}★` : "—"} hint={b.reviews_count != null ? `${b.reviews_count} reviews when added` : undefined} />
        <StatTile label="AI: points named" value={aiSum ? `${aiSum.points_mentioned ?? 0}/${aiSum.points ?? 0}` : "—"} hint={latestAi ? <>Latest AI check, <LocalTime iso={latestAi.created_at} /></> : "No AI check yet"} />
        <StatTile label="Maps: average rank" value={mapsSum?.avg_rank ?? "—"} hint={latestMaps ? `Top-3 at ${mapsSum?.top3_points ?? 0}/${mapsSum?.points_done ?? 0} points` : "No Maps grid yet"} />
        <StatTile label="Website" value={<span className="text-[15px] font-normal">{b.website ? new URL(b.website).hostname.replace(/^www\./, "") : "—"}</span>} hint={b.phone ?? undefined} />
      </div>

      <Panel title="Combined view: Maps rank and AI mentions" className="mt-6">
        {mapsPts || aiPts ? (
          <CombinedView
            center={combinedCentre}
            radiusMiles={Math.max(Number(latestMaps?.radius_miles ?? 0), Number(latestAi?.radius_miles ?? 0)) || 2}
            maps={mapsPts}
            ai={aiPts}
            insight={insight}
            mapsN={latestMaps?.grid_size ?? 0}
            aiN={latestAi?.grid_size ?? 0}
          />
        ) : (
          <EmptyState title="Nothing to show yet" body="Run an AI check and a Maps grid for this business. The latest of each is drawn on one map, so you can see where it ranks on Maps but is missing from AI answers." />
        )}
      </Panel>

      <Panel title="Client report (live share link)" className="mt-6">
        <ShareLinkCard businessId={b.id} slug={share?.share_slug ?? null} domain={await linkDomainFor(wsId)} locked={ctx.workspace.plan !== "lifetime"} />
      </Panel>

      <Panel title="Scans" className="mt-6">
        {scans.length === 0 ? (
          <p className="m-0 text-[15px] text-muted-foreground">No scans for this business yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {scans.map((s) => (
              <li key={s.id} className="border-b border-line last:border-b-0">
                <Link href={`/app/${s.kind === "ai" ? "ai-visibility" : "maps-grid"}/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 no-underline">
                  <span className="flex flex-col gap-[2px]">
                    <span className="text-[15px] font-medium text-fg">{s.kind === "ai" ? "AI grid" : "Maps grid"} {s.grid_size}×{s.grid_size} · “{s.niche ?? s.keyword}”</span>
                    <LocalTime iso={s.created_at} className="text-[13px] text-dim" />
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-[13px] text-muted-foreground">{fmtUsd(s.actual_cost_usd, 3)}</span>
                    <StatusChip tone={s.status === "done" ? "good" : s.status === "failed" ? "bad" : s.status === "partial" ? "warn" : "idle"}>{s.status}</StatusChip>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Business details" className="mt-6">
        <BusinessDetails
          id={b.id}
          location={b.lat != null && b.lng != null ? { lat: Number(b.lat), lng: Number(b.lng) } : null}
          serviceArea={isServiceArea(b)}
          language={b.language}
          country={b.country}
          countryLanguage={languageNameFor(b.country)}
        />
      </Panel>

      <Panel title="Delete" className="mt-6">
        <DeleteBusiness businessId={b.id} name={b.name} scanCount={scans.length < 30 ? scans.length : null} />
      </Panel>
    </>
  );
}
