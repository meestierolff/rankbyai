import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { userRead } from "@/components/app/reads";
import { PackForm, PackPoller, PackRerun } from "@/components/app/pack-form";
import { EmptyState, Note, PageHeader, Panel, SecondaryLink, StatTile, StatusChip, fmtDateTime, fmtUsd } from "@/components/app/ui";
import { MISSING_NOTE } from "@/lib/api-v1/packs";
import type { CitedDomain, CitedUrl, PackResults } from "@/lib/citations/inventory";
import { requireSession } from "@/lib/auth";
import { memberRead } from "@/lib/db/member-read";
import { suggestBuyerPrompts, suggestOnlinePrompts } from "@/lib/packs/prompts";
import { listPacks, loadInventory, loadPack, suggestionInputs } from "@/lib/packs/run";
import { ENGINE_LABEL, ENGINES, type Engine } from "@/lib/pricing-constants";
import type { Read } from "@/lib/scans/change-note-data";
import { getKeyStatuses } from "@/lib/workspace-data";

export const metadata: Metadata = { title: "Citation workflow" };

const TYPE_LABEL: Record<string, string> = {
  listicle: "List", review: "Review", directory: "Directory", official_site: "Own site", forum: "Forum", social: "Social", maps_listing: "Google Maps", other: "Other",
};
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const pct = (v: number | null | undefined) => (v == null ? "–" : `${v}%`);
const statusTone = (s: string) => (s === "done" ? "good" : s === "partial" ? "warn" : s === "failed" ? "bad" : "idle") as "good" | "warn" | "bad" | "idle";

export default async function CitationsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pack?: string; run?: string; view?: string; group?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireSession(`/app/businesses/${id}/citations`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const wsId = ctx.workspace.id;
  const ws: Read = async (what, run) => (await memberRead(what, wsId, (db) => run(db))).data;
  const rows: Read = (what, run) => userRead(what, run);

  const inputs = await suggestionInputs({ ws, rows }, wsId, id);
  if (!inputs) notFound();
  const business = inputs.business;
  const service = inputs.service ?? business.primary_category?.toLowerCase() ?? "";
  const suggestions = service ? suggestBuyerPrompts({ service, city: business.city, neighbourhood: inputs.neighbourhood, category: business.primary_category, competitors: inputs.competitors }).map((s) => s.text) : [];
  const onlineSuggestions = service ? suggestOnlinePrompts({ service, category: business.primary_category, competitors: inputs.competitors }).map((s) => s.text) : [];
  const [keys, packs] = await Promise.all([getKeyStatuses(wsId), listPacks(ws, wsId, { businessId: id, limit: 20, offset: 0 })]);
  const enginesWithKeys = ENGINES.filter((e) => keys.some((k) => k.provider === e && k.status !== "invalid"));
  const locked = ctx.workspace.plan !== "lifetime";

  const packId = sp.pack && /^[0-9a-f-]{36}$/.test(sp.pack) ? sp.pack : packs[0]?.id;
  const loaded = packId ? await loadPack({ ws, rows }, wsId, { packId, runId: sp.run && /^[0-9a-f-]{36}$/.test(sp.run) ? sp.run : undefined }) : null;
  const report = loaded?.ok ? (loaded.report as unknown as PackReport) : null;
  const inv = report?.run ? await loadInventory({ ws, rows }, wsId, { packId: report.pack.id }) : null;
  const missingOnly = sp.view === "missing";
  const byDomain = sp.group === "domain";
  const base = `/app/businesses/${id}/citations?pack=${report?.pack.id ?? ""}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Citation workflow · ${business.name}`}
        description="Step 1: ask buyer prompts on ChatGPT, Perplexity and Gemini. Step 2: see every page the answers cite, and which ones leave this business out. Every number is counted from stored answers."
        actions={<SecondaryLink href={`/app/businesses/${id}`}>Back to the business</SecondaryLink>}
      />

      <Panel title="1 · Prompt pack">
        <PackForm businessId={id} defaultService={service} suggestions={suggestions} onlineSuggestions={onlineSuggestions} enginesWithKeys={enginesWithKeys} locked={locked} />
      </Panel>

      {packs.length ? (
        <Panel title="Saved packs">
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
            {packs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3">
                <Link href={`/app/businesses/${id}/citations?pack=${p.id}`} className={p.id === report?.pack.id ? "font-semibold text-fg" : "text-muted-foreground underline"}>{p.name}</Link>
                <span className="text-dim">{p.prompts.length} prompts · {p.scope === "online" ? "online" : p.location === "pin" ? "map point" : `${p.grid_size}×${p.grid_size} grid`} · {p.repeats} {p.repeats === 1 ? "run" : "runs"} per prompt · {p.runs} {p.runs === 1 ? "run" : "runs"}</span>
                {p.latest_run ? <StatusChip tone={statusTone(p.latest_run.status)}>{p.latest_run.status}</StatusChip> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {report?.run && report.results ? (
        <Panel title={`Results · ${report.pack.name} · ${fmtDateTime(report.run.created_at)}`} action={<PackRerun packId={report.pack.id} businessId={id} locked={locked} />}>
          <div className="flex flex-col gap-5">
            <PackPoller packId={report.pack.id} runId={report.run.id} status={report.run.status} pagesChecked={report.run.pages_checked} />
            {report.runs.length > 1 ? (
              <p className="m-0 text-[13px] text-dim">Runs: {report.runs.map((r, i) => (
                <span key={r.id}>{i ? " · " : ""}<Link href={`${base}&run=${r.id}`} className={r.id === report.run!.id ? "text-fg" : "underline"}>{day(r.created_at)}</Link></span>
              ))}</p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <StatTile label="Answers" value={report.results.answers} hint={`${report.run.scans.length} scans`} />
              <StatTile label="Named the business" value={pct(report.results.mention_rate)} hint={`${report.results.named_client} of ${report.results.answers} answers`} />
              <StatTile label="Status" value={report.run.status} />
              <StatTile label="Cost" value={report.run.actual_cost_usd != null && report.run.status !== "queued" ? fmtUsd(report.run.actual_cost_usd, 3) : "–"} hint={report.run.est_cost_usd != null ? `estimated ${fmtUsd(report.run.est_cost_usd, 3)}` : undefined} />
            </div>
            <ResultsTable results={report.results} engines={report.run.engines} />
            <div className="flex flex-col gap-2">
              <span className="text-[14px] font-medium">Share of answers</span>
              <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-[14px] text-muted-foreground">
                {report.results.share_of_answers.map((s) => <li key={s.name} className={s.you ? "text-fg" : ""}>{s.name}{s.you ? " (this business)" : ""}: {pct(s.share)} ({s.answers})</li>)}
              </ul>
              <span className="text-[13px] text-dim">{report.results.share_definition}</span>
            </div>
            <Note>{report.disclaimer}</Note>
          </div>
        </Panel>
      ) : packs.length === 0 ? (
        <EmptyState title="No prompt pack yet" body="Edit the suggested prompts above, check the estimate and run the pack. The answers and the pages they cite appear here." />
      ) : null}

      {inv?.ok ? (
        <Panel title="2 · Cited pages" action={
          <span className="flex flex-wrap gap-3 text-[14px]">
            <Link href={`${base}${byDomain ? "&group=domain" : ""}`} className={missingOnly ? "underline text-muted-foreground" : "text-fg"}>All</Link>
            <Link href={`${base}&view=missing${byDomain ? "&group=domain" : ""}`} className={missingOnly ? "text-fg" : "underline text-muted-foreground"}>Missing this business</Link>
            <span className="text-dim">·</span>
            <Link href={`${base}${missingOnly ? "&view=missing" : ""}`} className={byDomain ? "underline text-muted-foreground" : "text-fg"}>By page</Link>
            <Link href={`${base}${missingOnly ? "&view=missing" : ""}&group=domain`} className={byDomain ? "text-fg" : "underline text-muted-foreground"}>By site</Link>
          </span>
        }>
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[13px] text-dim">Over the latest {inv.inventory.runs} finished {inv.inventory.runs === 1 ? "run" : "runs"} of this pack: {inv.inventory.answers} answers, {inv.inventory.answers_with_sources} with cited pages.</p>
            {byDomain ? <DomainTable rows={inv.inventory.domains.filter((d) => !missingOnly || (d.client_absent && !d.page_types.every((t) => t === "maps_listing" || t === "official_site")))} /> : <UrlTable rows={inv.inventory.urls.filter((u) => !missingOnly || (u.missing.client_absent && u.page_type !== "maps_listing" && u.page_type !== "official_site"))} />}
            <p className="m-0 text-[13px] text-dim">{MISSING_NOTE} The page type comes from the address and title only.</p>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

interface PackReport {
  pack: { id: string; name: string };
  runs: { id: string; created_at: string }[];
  run: { id: string; status: string; created_at: string; est_cost_usd: number | null; actual_cost_usd: number | null; pages_checked: boolean; engines: Engine[]; scans: unknown[] } | null;
  results: PackResults | null;
  disclaimer: string;
}

function ResultsTable({ results, engines }: { results: PackResults; engines: Engine[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead className="text-[12.5px] text-dim">
          <tr>
            <th className="py-2 pr-3 font-medium">Prompt</th>
            {engines.map((e) => <th key={e} className="py-2 pr-3 font-medium">{ENGINE_LABEL[e].short}</th>)}
            <th className="py-2 font-medium">Named instead</th>
          </tr>
        </thead>
        <tbody>
          {results.prompts.map((p) => (
            <tr key={p.idx} className="border-t border-border align-top">
              <td className="py-2 pr-3">{p.text}</td>
              {engines.map((e) => {
                const row = p.engines.find((x) => x.engine === e);
                return <td key={e} className="py-2 pr-3 font-mono text-[13px]">{row && row.answers ? `${row.named_client}/${row.answers}${row.avg_position != null ? ` · #${row.avg_position}` : ""}` : "–"}</td>;
              })}
              <td className="py-2 text-muted-foreground">{p.top_names.map((n) => `${n.name} (${n.answers})`).join(", ") || "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 mt-2 text-[13px] text-dim">Per engine: answers that named the business / answers, and its average position when named.</p>
    </div>
  );
}

function UrlTable({ rows }: { rows: CitedUrl[] }) {
  if (!rows.length) return <p className="m-0 text-[14px] text-muted-foreground">No pages here.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead className="text-[12.5px] text-dim">
          <tr><th className="py-2 pr-3 font-medium">Page</th><th className="py-2 pr-3 font-medium">Type</th><th className="py-2 pr-3 font-medium">Cited in</th><th className="py-2 pr-3 font-medium">Named you</th><th className="py-2 pr-3 font-medium">This business</th><th className="py-2 font-medium">Seen</th></tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((u) => (
            <tr key={u.key} className="border-t border-border align-top">
              <td className="max-w-[420px] py-2 pr-3">
                <a href={u.url} target="_blank" rel="noopener noreferrer nofollow" className="break-words text-fg underline">{u.title ?? u.key}</a>
                <div className="text-[12px] break-all text-dim">{u.domain} · {u.engines.map((e) => ENGINE_LABEL[e].short).join(", ")}</div>
              </td>
              <td className="py-2 pr-3" title={u.type_why}>{TYPE_LABEL[u.page_type]}<div className="text-[12px] text-dim">{u.type_confidence}</div></td>
              <td className="py-2 pr-3 font-mono text-[13px]">{u.answers}</td>
              <td className="py-2 pr-3 font-mono text-[13px]">{u.answers_naming_client}</td>
              <td className="py-2 pr-3">
                {u.page_type === "maps_listing" || u.page_type === "official_site" ? <span className="text-dim">–</span> : u.missing.client_absent ? <StatusChip tone="warn">Missing</StatusChip> : <StatusChip tone="good">Named</StatusChip>}
                <div className="text-[12px] text-dim">{u.missing.basis === "page" ? "on the page" : "in the answers"}{u.missing.competitors_present.length ? ` · ${u.missing.competitors_present.slice(0, 3).join(", ")}` : ""}</div>
              </td>
              <td className="py-2 text-[13px] text-muted-foreground">{day(u.first_seen)}{u.last_seen !== u.first_seen ? ` – ${day(u.last_seen)}` : ""}{u.disappeared_on ? <div className="text-[12px] text-danger">gone {day(u.disappeared_on)}</div> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 ? <p className="m-0 mt-2 text-[13px] text-dim">Showing the 100 most cited of {rows.length}. The API (list_cited_sources) pages through all of them.</p> : null}
    </div>
  );
}

function DomainTable({ rows }: { rows: CitedDomain[] }) {
  if (!rows.length) return <p className="m-0 text-[14px] text-muted-foreground">No sites here.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead className="text-[12.5px] text-dim">
          <tr><th className="py-2 pr-3 font-medium">Site</th><th className="py-2 pr-3 font-medium">Types</th><th className="py-2 pr-3 font-medium">Pages</th><th className="py-2 pr-3 font-medium">Cited in</th><th className="py-2 pr-3 font-medium">Named you</th><th className="py-2 font-medium">Seen</th></tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((d) => (
            <tr key={d.domain} className="border-t border-border align-top">
              <td className="py-2 pr-3">{d.domain}</td>
              <td className="py-2 pr-3">{d.page_types.map((t) => TYPE_LABEL[t]).join(", ")}</td>
              <td className="py-2 pr-3 font-mono text-[13px]">{d.urls}</td>
              <td className="py-2 pr-3 font-mono text-[13px]">{d.answers}</td>
              <td className="py-2 pr-3 font-mono text-[13px]">{d.answers_naming_client}</td>
              <td className="py-2 text-[13px] text-muted-foreground">{day(d.first_seen)}{d.last_seen !== d.first_seen ? ` – ${day(d.last_seen)}` : ""}{d.disappeared_on ? <div className="text-[12px] text-danger">gone {day(d.disappeared_on)}</div> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
