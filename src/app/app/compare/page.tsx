import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel, StatTile, fmtDate, fmtDateTime, inputClass } from "@/components/app/ui";
import { AiDisclaimer, ctaClass } from "@/components/brand/primitives";
import { DotGrid, aiCellColors, mapsCellColors, pointName, type CellView } from "@/components/brand/grid";
import { requireSession } from "@/lib/auth";
import { ENGINE_LABEL } from "@/lib/pricing-constants";
import { compareAi, compareHeadline, compareMaps, type AiCompareSample, type MapsComparePoint } from "@/lib/scans/compare";
import { currentUserDb } from "@/lib/db/session";
import { CompareViewed } from "./viewed";

export const metadata: Metadata = { title: "Compare scans" };

interface ScanLite {
  id: string;
  kind: "ai" | "maps";
  grid_size: number;
  keyword: string | null;
  niche: string | null;
  status: string;
  created_at: string;
}

const uuid = /^[0-9a-f-]{36}$/;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

/** Delta chip per point: ▲ better, ▼ worse, = unchanged, · no comparison possible. */
function deltaCell(key: string, delta: number | null, title: string): CellView {
  if (delta == null) return { key, bg: "var(--rb-well)", fg: "var(--rb-faint)", label: "·", title: `${title}: no comparison` };
  if (delta > 0) return { key, bg: "var(--rb-g1)", fg: "var(--rb-bg)", label: `▲${delta}`, title: `${title}: improved by ${delta}` };
  if (delta < 0) return { key, bg: "var(--rb-orange)", fg: "var(--rb-bg)", label: `▼${Math.abs(delta)}`, title: `${title}: declined by ${Math.abs(delta)}` };
  return { key, bg: "var(--rb-none)", fg: "var(--rb-muted)", label: "=", title: `${title}: unchanged` };
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ kind?: string; business?: string; a?: string; b?: string }> }) {
  const ctx = await requireSession("/app/compare");
  const sp = await searchParams;
  const kind = sp.kind === "maps" ? "maps" : "ai";
  const supabase = await currentUserDb();

  const { data: bizRows } = await supabase.from("businesses").select("id, name").eq("workspace_id", ctx.workspace.id).order("name").limit(500);
  const businesses = (bizRows ?? []) as { id: string; name: string }[];
  const businessId = sp.business && uuid.test(sp.business) ? sp.business : businesses[0]?.id;
  const business = businesses.find((b) => b.id === businessId);

  const { data: scanRows } = businessId
    ? await supabase.from("scans").select("id, kind, grid_size, keyword, niche, status, created_at").eq("business_id", businessId).eq("kind", kind).in("status", ["done", "partial"]).order("created_at", { ascending: false }).limit(60)
    : { data: [] };
  const scans = (scanRows ?? []) as ScanLite[];
  // Default: the latest scan (b) against the one before it (a).
  const b = scans.find((s) => s.id === sp.b) ?? scans[0];
  const a = scans.find((s) => s.id === sp.a && s.id !== b?.id) ?? scans.find((s) => s.id !== b?.id && new Date(s.created_at) <= new Date(b?.created_at ?? 0)) ?? scans.find((s) => s.id !== b?.id);
  const label = (s: ScanLite) => `${fmtDateTime(s.created_at)} · ${s.grid_size}×${s.grid_size} · “${s.niche ?? s.keyword}”`;
  const base = `/app/${kind === "ai" ? "ai-visibility" : "maps-grid"}`;

  const header = (
    <PageHeader
      title="Compare scans"
      description="Pick two scans of the same business. The earlier one is “before”, the later one “after”."
      actions={
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-dim">Type
            <select name="kind" defaultValue={kind} className={`${inputClass} py-[7px] text-[13px]`}><option value="ai">AI grid</option><option value="maps">Maps grid</option></select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-dim">Business
            <select name="business" defaultValue={businessId} className={`${inputClass} py-[7px] text-[13px]`}>{businesses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
          {scans.length >= 2 ? (
            <>
              <label className="flex flex-col gap-1 text-[12px] text-dim">Before
                <select name="a" defaultValue={a?.id} className={`${inputClass} py-[7px] text-[13px]`}>{scans.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}</select>
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-dim">After
                <select name="b" defaultValue={b?.id} className={`${inputClass} py-[7px] text-[13px]`}>{scans.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}</select>
              </label>
            </>
          ) : null}
          <button type="submit" className={ctaClass("sm", "h-[36px] cursor-pointer border-0")}><span>Compare</span></button>
        </form>
      }
    />
  );

  if (!business || !a || !b) {
    return (
      <>
        {header}
        <EmptyState
          title={business ? "This needs two finished scans" : "Add a business first"}
          body={business ? `${business.name} has ${scans.length} finished ${kind === "ai" ? "AI" : "Maps"} ${scans.length === 1 ? "scan" : "scans"}. Run another one, then compare before and after.` : "Compare shows what changed between two scans of one business."}
          action={<Link href={business ? `${base}?business=${business.id}` : "/app/businesses"} className={ctaClass("sm")}><span>{business ? "Run a scan" : "Add a business"}</span><span aria-hidden>→</span></Link>}
        />
      </>
    );
  }
  // Order by date so "before" is always the older scan, whatever the selects said.
  const [before, after] = new Date(a.created_at) <= new Date(b.created_at) ? [a, b] : [b, a];
  const { data: pointRows } = await supabase.from("scan_points").select("scan_id, idx, row, col, rank, status").in("scan_id", [before.id, after.id]).order("idx");
  const pts = (pointRows ?? []) as { scan_id: string; idx: number; row: number; col: number; rank: number | null; status: string }[];
  const where = (idx: number) => {
    const p = pts.find((x) => x.scan_id === after.id && x.idx === idx);
    return p ? `Point ${pointName(p.row, p.col)}` : `Point ${idx + 1}`;
  };

  let body: React.ReactNode;
  let headline: string;
  if (kind === "ai") {
    const { data: sampleRows } = await supabase.from("ai_samples").select("scan_id, point_idx, engine, status, mentioned, mention_position").in("scan_id", [before.id, after.id]);
    const all = (sampleRows ?? []) as (AiCompareSample & { scan_id: string })[];
    const sa = all.filter((s) => s.scan_id === before.id);
    const sb = all.filter((s) => s.scan_id === after.id);
    const c = compareAi(sa, sb, before.grid_size, after.grid_size);
    headline = compareHeadline("ai", c);
    const grid = (samples: AiCompareSample[], n: number): CellView[] =>
      Array.from({ length: n * n }, (_, idx) => {
        const done = samples.filter((s) => s.point_idx === idx && s.status === "done");
        const hits = done.filter((s) => s.mentioned);
        const best = hits.length ? Math.min(...hits.map((s) => s.mention_position ?? 5)) : null;
        return { key: String(idx), ...aiCellColors(best), label: done.length ? `${hits.length}/${done.length}` : "!", title: `${where(idx)}: named by ${hits.length} of ${done.length} engines` };
      });
    body = (
      <>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
          <StatTile label="Points where AI names the business" value={signed(c.pointsMentioned.delta)} hint={`${c.pointsMentioned.before} → ${c.pointsMentioned.after} of ${c.pointsMentioned.total}`} tone={c.pointsMentioned.delta > 0 ? "good" : c.pointsMentioned.delta < 0 ? "bad" : undefined} />
          {c.engines.map((e) => (
            <StatTile key={e.engine} label={ENGINE_LABEL[e.engine].short} value={e.delta == null ? "—" : signed(e.delta)} hint={e.before == null || e.after == null ? "Not available in both scans" : `${e.before}/${e.beforeDone} → ${e.after}/${e.afterDone} points`} tone={(e.delta ?? 0) > 0 ? "good" : (e.delta ?? 0) < 0 ? "bad" : undefined} />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Panel title={`Before · ${fmtDate(before.created_at)}`}><DotGrid n={before.grid_size} cells={grid(sa, before.grid_size)} fontPx={12} gapPx={7} /></Panel>
          <Panel title={`After · ${fmtDate(after.created_at)}`}><DotGrid n={after.grid_size} cells={grid(sb, after.grid_size)} fontPx={12} gapPx={7} /></Panel>
          <Panel title="Change per point">
            {c.samePoints ? (
              <>
                <DotGrid n={after.grid_size} cells={c.points.map((p) => deltaCell(String(p.idx), p.delta, where(p.idx)))} fontPx={12} gapPx={7} />
                <p className="mt-3 mb-0 text-[13px] text-dim">{c.improved} improved · {c.declined} declined. The number is the change in how many engines named the business.</p>
              </>
            ) : <p className="m-0 text-[14px] text-muted-foreground">These scans used different grid sizes, so points cannot be matched one to one. The metrics above still compare.</p>}
          </Panel>
        </div>
        <AiDisclaimer className="mt-4" />
      </>
    );
  } else {
    const pa: MapsComparePoint[] = pts.filter((p) => p.scan_id === before.id);
    const pb: MapsComparePoint[] = pts.filter((p) => p.scan_id === after.id);
    const c = compareMaps(pa, pb);
    headline = compareHeadline("maps", c);
    const grid = (points: MapsComparePoint[]): CellView[] =>
      points.map((p) => (p.status === "done" ? { key: String(p.idx), ...mapsCellColors(p.rank), title: `${where(p.idx)}: ${p.rank ? `rank #${p.rank}` : "not in the top 20"}` } : { key: String(p.idx), bg: "var(--rb-well)", fg: "var(--rb-faint)", label: "!", title: `${where(p.idx)}: no result` }));
    body = (
      <>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
          <StatTile label="Average rank" value={c.avgRank.delta == null ? "—" : c.avgRank.delta > 0 ? `▲ ${c.avgRank.delta}` : c.avgRank.delta < 0 ? `▼ ${Math.abs(c.avgRank.delta)}` : "±0"} hint={`${c.avgRank.before ?? "—"} → ${c.avgRank.after ?? "—"} (lower is better)`} tone={(c.avgRank.delta ?? 0) > 0 ? "good" : (c.avgRank.delta ?? 0) < 0 ? "bad" : undefined} />
          <StatTile label="Top-3 points" value={signed(c.top3.delta)} hint={`${c.top3.before} → ${c.top3.after}`} tone={c.top3.delta > 0 ? "good" : c.top3.delta < 0 ? "bad" : undefined} />
          {c.samePoints ? <StatTile label="Points improved" value={c.improved} hint={`${c.declined} declined · ${c.unchanged} unchanged`} tone={c.improved > c.declined ? "good" : undefined} /> : null}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Panel title={`Before · ${fmtDate(before.created_at)}`}><DotGrid n={before.grid_size} cells={grid(pa)} fontPx={before.grid_size >= 9 ? 9 : 11} gapPx={4} /></Panel>
          <Panel title={`After · ${fmtDate(after.created_at)}`}><DotGrid n={after.grid_size} cells={grid(pb)} fontPx={after.grid_size >= 9 ? 9 : 11} gapPx={4} /></Panel>
          <Panel title="Change per point">
            {c.samePoints ? (
              <>
                <DotGrid n={after.grid_size} cells={c.points.map((p) => deltaCell(String(p.idx), p.delta, where(p.idx)))} fontPx={after.grid_size >= 9 ? 8 : 10} gapPx={4} />
                <p className="mt-3 mb-0 text-[13px] text-dim">▲ = positions gained, ▼ = positions lost. Not in the top 20 counts as 21.</p>
              </>
            ) : <p className="m-0 text-[14px] text-muted-foreground">These scans used different grid sizes, so points cannot be matched one to one. The metrics above still compare.</p>}
          </Panel>
        </div>
      </>
    );
  }

  return (
    <>
      <CompareViewed kind={kind} />
      {header}
      <p className="mt-0 mb-6 border-l-2 border-fg py-1 pl-4 text-[19px] leading-snug font-medium">
        {business.name}: {headline}
      </p>
      {(before.niche ?? before.keyword) !== (after.niche ?? after.keyword) ? (
        <div role="note" className="mb-5 rounded-xl border border-amber/50 bg-surface-2 px-4 py-3 text-[14px] text-amber">These two scans used different keywords, so the change mixes two questions.</div>
      ) : null}
      {body}
    </>
  );
}
