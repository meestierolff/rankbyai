import Link from "next/link";
import { notFound } from "next/navigation";
import { AiGridMock, MapsGridMock } from "@/components/marketing/feature-mocks";
import { SampleTag } from "@/components/brand/primitives";
import type { SessionContext } from "@/lib/auth";
import { isMockMode } from "@/lib/mock";
import { currentUserDb } from "@/lib/db/session";
import { getCreditBalance, getKeyStatuses, type ScanRow } from "@/lib/workspace-data";
import { ScheduleActions } from "./m3-controls";
import { ScanForm, type FormBusiness } from "./scan-form";
import { ScanResult } from "./scan-result";
import { EmptyState, PageHeader, Panel, PrimaryLink, SecondaryLink, StatusChip, fmtDateTime, fmtUsd } from "./ui";

/* Server-side page bodies shared by the AI Visibility and Maps Grid sections. */

const COPY = {
  ai: {
    title: "AI Visibility",
    path: "ai-visibility",
    description: "Ask ChatGPT, Perplexity and Gemini the same prompt at every point of a map grid, and see where they name the business.",
    run: "New AI check",
    empty: "Run your first AI check to see which businesses AI assistants name around your client, and where your client is missing.",
  },
  maps: {
    title: "Maps Grid",
    path: "maps-grid",
    description: "Google Maps rank for a keyword at every point of a grid, from 3×3 to 9×9, with the top 20 at each pin.",
    run: "New Maps grid",
    empty: "Run your first Maps grid to see where the business ranks on Google Maps across its area.",
  },
} as const;

export async function ScanIndexPage({ ctx, kind, businessId }: { ctx: SessionContext; kind: "ai" | "maps"; businessId?: string }) {
  const copy = COPY[kind];
  const supabase = await currentUserDb();
  const ws = ctx.workspace;
  const [{ data: bizRows }, keyRows, credits, { data: scanRows }, { data: scheduleRows }] = await Promise.all([
    supabase.from("businesses").select("id, name, city, primary_category").eq("workspace_id", ws.id).not("lat", "is", null).order("created_at", { ascending: false }).limit(500),
    getKeyStatuses(ws.id),
    getCreditBalance(ws.id),
    supabase
      .from("scans")
      .select("id, business_id, kind, grid_size, status, funding, keyword, niche, engines, est_cost_usd, actual_cost_usd, summary, created_at, finished_at, businesses(name)")
      .eq("workspace_id", ws.id)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("tracked_queries").select("id, business_id, keyword, niche, grid_size, schedule, next_run_at, active, funding, businesses(name)").eq("workspace_id", ws.id).eq("kind", kind).neq("schedule", "none").order("created_at", { ascending: false }).limit(100),
  ]);
  const schedules = (scheduleRows ?? []) as unknown as { id: string; keyword: string | null; niche: string | null; grid_size: number; schedule: string; next_run_at: string | null; active: boolean; funding: string; businesses: { name: string } | null }[];
  const businesses: FormBusiness[] = ((bizRows ?? []) as { id: string; name: string; city: string | null; primary_category: string | null }[]).map((b) => ({ id: b.id, name: b.name, city: b.city, category: b.primary_category }));
  const scans = (scanRows ?? []) as unknown as ScanRow[];
  const mock = isMockMode();
  const has = (p: string) => mock || keyRows.some((k) => k.provider === p && k.status === "valid");
  const keys = { dataforseo: has("dataforseo"), openai: has("openai"), perplexity: has("perplexity"), gemini: has("gemini") };
  const locked = ws.plan !== "lifetime";

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />

      {locked ? (
        <div className="mb-6 flex flex-col gap-3">
          <span className="flex items-center gap-2 text-[13px] text-dim"><SampleTag /> A preview of this screen with fictional data. Real scans need lifetime access.</span>
          <div className="overflow-hidden rounded-2xl border border-border bg-bg-alt p-[clamp(12px,2vw,24px)] pb-0">{kind === "ai" ? <AiGridMock /> : <MapsGridMock />}</div>
        </div>
      ) : null}

      {businesses.length === 0 ? (
        <EmptyState
          title="Add a business first"
          body="A scan is centred on a business's Google listing. Add one, then come back here."
          action={<PrimaryLink href="/app/businesses">Add a business</PrimaryLink>}
        />
      ) : (
        <Panel title={copy.run}>
          <ScanForm kind={kind} businesses={businesses} keys={keys} credits={credits} locked={locked} defaultBusinessId={businessId} />
        </Panel>
      )}

      {schedules.length ? (
        <Panel title="Schedules" className="mt-6">
          <ul className="m-0 flex list-none flex-col p-0">
            {schedules.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
                <span className="flex min-w-0 flex-col gap-[2px]">
                  <span className="truncate text-[15px] font-medium">{t.businesses?.name ?? "Business"} · “{t.niche ?? t.keyword}” · {t.grid_size}×{t.grid_size}</span>
                  <span className="text-[13px] text-dim">
                    {t.schedule} · {t.funding === "byok" ? "on your keys" : "included scans"} · {t.active ? `next run ${t.next_run_at ? fmtDateTime(t.next_run_at) : "—"}` : "paused"}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <StatusChip tone={t.active ? "good" : "idle"}>{t.active ? "active" : "paused"}</StatusChip>
                  <ScheduleActions id={t.id} active={t.active} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="History" className="mt-6">
        {scans.length === 0 ? (
          <p className="m-0 text-[15px] text-muted-foreground">{copy.empty}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {scans.map((s) => {
              const sum = s.summary as { points_mentioned?: number; avg_rank?: number | null; top3_points?: number; points_done?: number };
              return (
                <li key={s.id} className="border-b border-line last:border-b-0">
                  <Link href={`/app/${copy.path}/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 no-underline">
                    <span className="flex min-w-0 flex-col gap-[2px]">
                      <span className="truncate text-[15px] font-medium text-fg">{s.businesses?.name ?? "Business"} · “{s.niche ?? s.keyword}”</span>
                      <span className="text-[13px] text-dim">
                        {s.grid_size}×{s.grid_size} · {fmtDateTime(s.created_at)} ·{" "}
                        {kind === "ai" ? `named at ${sum.points_mentioned ?? 0}/${s.grid_size * s.grid_size} points` : `avg rank ${sum.avg_rank ?? "—"} · top-3 at ${sum.top3_points ?? 0}/${sum.points_done ?? s.grid_size * s.grid_size}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-[13px] text-muted-foreground">{fmtUsd(s.actual_cost_usd ?? s.est_cost_usd, 3)}</span>
                      <StatusChip tone={s.status === "done" ? "good" : s.status === "failed" ? "bad" : s.status === "partial" ? "warn" : "idle"}>{s.status}</StatusChip>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

export async function ScanDetailPage({ ctx, kind, scanId }: { ctx: SessionContext; kind: "ai" | "maps"; scanId: string }) {
  const copy = COPY[kind];
  if (!/^[0-9a-f-]{36}$/.test(scanId)) notFound();
  const supabase = await currentUserDb();
  const { data: scan } = await supabase.from("scans").select("id, kind, business_id, tracked_query_id, businesses(id, name)").eq("id", scanId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!scan || scan.kind !== kind) notFound();
  const business = (Array.isArray(scan.businesses) ? scan.businesses[0] : scan.businesses) as { id: string; name: string } | null;
  const { data: siblings } = await supabase.from("scans").select("id, grid_size, keyword, niche, status, created_at").eq("business_id", scan.business_id).eq("kind", kind).order("created_at", { ascending: false }).limit(12);
  const history = (siblings ?? []) as { id: string; grid_size: number; keyword: string | null; niche: string | null; status: string; created_at: string }[];
  return (
    <>
      <PageHeader
        title={business?.name ?? copy.title}
        description={<Link href={`/app/${copy.path}`} className="text-muted-foreground no-underline hover:text-fg">← {copy.title}</Link>}
        actions={
          <>
            {business ? <SecondaryLink href={`/app/businesses/${business.id}`}>Business page</SecondaryLink> : null}
            {history.length > 1 ? <SecondaryLink href={`/app/compare?kind=${kind}&business=${scan.business_id}&b=${scan.id}`}>Compare with another scan</SecondaryLink> : null}
            <PrimaryLink href={`/app/${copy.path}?business=${scan.business_id}`}>Run again</PrimaryLink>
          </>
        }
      />
      {history.length > 1 ? (
        <nav aria-label="Scan history" className="mb-5 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-dim">History:</span>
          {history.map((h) => (
            <Link
              key={h.id}
              href={`/app/${copy.path}/${h.id}`}
              aria-current={h.id === scan.id ? "page" : undefined}
              className={`rounded-full border px-3 py-1 no-underline ${h.id === scan.id ? "border-fg bg-fg text-bg" : "border-border-strong text-muted-foreground hover:text-fg"}`}
            >
              {new Date(h.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short" })} · {h.grid_size}×{h.grid_size}
            </Link>
          ))}
        </nav>
      ) : null}
      <ScanResult scanId={scan.id} businessName={business?.name ?? "the business"} />
    </>
  );
}
