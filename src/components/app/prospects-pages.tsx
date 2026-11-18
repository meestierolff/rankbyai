import Link from "next/link";
import { notFound } from "next/navigation";
import type { SessionContext } from "@/lib/auth";
import { memberRead } from "@/lib/db/member-read";
import { isMockMode } from "@/lib/mock";
import type { BatchRow } from "@/lib/prospects/batch";
import { getCreditBalance, getKeyStatuses } from "@/lib/workspace-data";
import { BatchProgress, ProspectFinder, type BatchView } from "./prospects-client";
import { ErrorState, PageHeader, Panel, PrimaryLink, StatusChip } from "./ui";
import { LocalTime } from "./local-time";

export async function ProspectIndexPage({ ctx }: { ctx: SessionContext }) {
  const ws = ctx.workspace;
  // memberRead falls back to a server read for this workspace when the gateway drops the signed-in identity.
  const [keyRows, credits, { data: batchRows, error }] = await Promise.all([
    getKeyStatuses(ws.id),
    getCreditBalance(ws.id),
    memberRead<Omit<BatchView, "rows">[]>("Prospect batches", ws.id, (db) =>
      db.from("prospect_batches").select("id, mode, niche, city, funding, total, done, failed, status, created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(50),
    ).then((r) => ({ data: r.data, error: null }), (e: unknown) => ({ data: null, error: e })),
  ]);
  const batches = (batchRows ?? []) as Omit<BatchView, "rows">[];
  const locked = ws.plan !== "lifetime";
  const hasDataForSeo = isMockMode() || keyRows.some((k) => k.provider === "dataforseo" && k.status === "valid");

  return (
    <>
      <PageHeader title="Prospects" description="Find local businesses, then get a report for each one: where AI assistants and Google Maps leave it out, a quick audit, and one factual sentence to open with. Reports are white-labelled with your branding." />
      <Panel title="Find businesses" className="mb-6">
        {locked ? <p className="mt-0 mb-4 text-[14px] text-muted-foreground">Prospect mode needs lifetime access. You can look at the form; searching and creating reports are switched off.</p> : null}
        <ProspectFinder credits={credits} locked={locked} hasDataForSeo={hasDataForSeo} />
      </Panel>
      <Panel title="Batches">
        {error ? <ErrorState body="The batches could not be loaded. Reload the page." /> : batches.length === 0 ? (
          <p className="m-0 text-[15px] text-muted-foreground">No batches yet. A batch of five reports takes about 5 to 10 minutes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-[14px]">
              <thead><tr className="text-[13px] text-dim">{["Batch", "Source", "Reports", "Paid with", "Status", "Started"].map((h) => <th key={h} scope="col" className="border-b border-line px-3 py-2 font-medium first:pl-0">{h}</th>)}</tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-3 pl-0"><Link href={`/app/prospects/${b.id}`} className="font-medium text-fg no-underline hover:underline">{b.niche}{b.city ? ` · ${b.city}` : ""}</Link></td>
                    <td className="px-3 py-3 text-muted-foreground">{b.mode === "csv" ? "CSV" : "Search"}</td>
                    <td className="px-3 py-3 font-mono">{b.done} of {b.total}{b.failed ? <span className="text-dim"> · {b.failed} failed</span> : null}</td>
                    <td className="px-3 py-3 text-muted-foreground">{b.funding === "credits" ? "Included scans" : "Own keys"}</td>
                    <td className="px-3 py-3"><StatusChip tone={b.status === "done" ? "good" : b.status === "failed" ? "bad" : "warn"}>{b.status}</StatusChip></td>
                    <td className="px-3 py-3 text-muted-foreground"><LocalTime iso={b.created_at} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

export async function ProspectBatchPage({ ctx, batchId }: { ctx: SessionContext; batchId: string }) {
  if (!/^[0-9a-f-]{36}$/.test(batchId)) notFound();
  // A failed read raises an error page; only a batch that really is not there is a 404.
  const { data: batch } = await memberRead<Omit<BatchView, "rows"> & { rows: unknown }>("Prospect batch", ctx.workspace.id, (db) =>
    db.from("prospect_batches").select("id, mode, niche, city, funding, total, done, failed, status, rows, created_at").eq("id", batchId).eq("workspace_id", ctx.workspace.id).maybeSingle(),
  );
  if (!batch) notFound();
  const view: BatchView = { ...batch, rows: batch.rows as BatchRow[] };
  return (
    <>
      <PageHeader
        title={`${batch.niche}${batch.city ? ` · ${batch.city}` : ""}`}
        description={<Link href="/app/prospects" className="text-muted-foreground no-underline hover:text-fg">← Prospects</Link>}
        actions={<PrimaryLink href="/app/prospects">New batch</PrimaryLink>}
      />
      <BatchProgress initial={view} />
    </>
  );
}
