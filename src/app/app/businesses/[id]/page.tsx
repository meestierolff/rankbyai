import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CombinedView } from "@/components/app/combined-view";
import type { MapPoint } from "@/components/app/grid-map";
import { EmptyState, PageHeader, Panel, PrimaryLink, SecondaryLink, StatTile, StatusChip, fmtDateTime, fmtUsd } from "@/components/app/ui";
import { aiCellColors, mapsCellColors, pointName } from "@/components/brand/grid";
import { requireSession } from "@/lib/auth";
import { combinedInsight, type AiSummary, type MapsSummary } from "@/lib/scans/summary";
import { createSupabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Business" };

interface ScanLite {
  id: string;
  kind: "ai" | "maps";
  grid_size: number;
  radius_miles: number;
  status: string;
  keyword: string | null;
  niche: string | null;
  summary: Record<string, unknown>;
  actual_cost_usd: number | null;
  created_at: string;
}

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession("/app/businesses");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createSupabaseServer();
  const { data: b } = await supabase.from("businesses").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!b) notFound();

  const { data: scanRows } = await supabase
    .from("scans")
    .select("id, kind, grid_size, radius_miles, status, keyword, niche, summary, actual_cost_usd, created_at")
    .eq("business_id", id)
    .order("created_at", { ascending: false })
    .limit(30);
  const scans = (scanRows ?? []) as ScanLite[];
  const usable = (s: ScanLite) => s.status === "done" || s.status === "partial";
  const latestMaps = scans.find((s) => s.kind === "maps" && usable(s)) ?? null;
  const latestAi = scans.find((s) => s.kind === "ai" && usable(s)) ?? null;

  let mapsPts: MapPoint[] | null = null;
  let aiPts: MapPoint[] | null = null;
  if (latestMaps) {
    const { data } = await supabase.from("scan_points").select("idx, row, col, lat, lng, rank, status").eq("scan_id", latestMaps.id).order("idx");
    mapsPts = ((data ?? []) as { idx: number; row: number; col: number; lat: number; lng: number; rank: number | null; status: string }[])
      .filter((p) => p.status === "done")
      .map((p) => ({ key: `m${p.idx}`, lat: p.lat, lng: p.lng, ...mapsCellColors(p.rank), title: `Maps point ${pointName(p.row, p.col)}: ${p.rank ? `rank #${p.rank}` : "not in the top 20"}` }));
  }
  if (latestAi) {
    const [{ data: pts }, { data: smp }] = await Promise.all([
      supabase.from("scan_points").select("idx, row, col, lat, lng").eq("scan_id", latestAi.id).order("idx"),
      supabase.from("ai_samples").select("point_idx, status, mentioned, mention_position").eq("scan_id", latestAi.id),
    ]);
    const samples = (smp ?? []) as { point_idx: number; status: string; mentioned: boolean | null; mention_position: number | null }[];
    aiPts = ((pts ?? []) as { idx: number; row: number; col: number; lat: number; lng: number }[]).map((p) => {
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
        <StatTile label="AI: points named" value={aiSum ? `${aiSum.points_mentioned ?? 0}/${aiSum.points ?? 0}` : "—"} hint={latestAi ? `Latest AI check, ${fmtDateTime(latestAi.created_at)}` : "No AI check yet"} />
        <StatTile label="Maps: average rank" value={mapsSum?.avg_rank ?? "—"} hint={latestMaps ? `Top-3 at ${mapsSum?.top3_points ?? 0}/${mapsSum?.points_done ?? 0} points` : "No Maps grid yet"} />
        <StatTile label="Website" value={<span className="text-[15px] font-normal">{b.website ? new URL(b.website).hostname.replace(/^www\./, "") : "—"}</span>} hint={b.phone ?? undefined} />
      </div>

      <Panel title="Combined view: Maps rank and AI mentions" className="mt-6">
        {mapsPts || aiPts ? (
          <CombinedView
            center={{ lat: b.lat, lng: b.lng }}
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
                    <span className="text-[13px] text-dim">{fmtDateTime(s.created_at)}</span>
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
    </>
  );
}
