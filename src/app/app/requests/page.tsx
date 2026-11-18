import type { Metadata } from "next";
import { LocalTime } from "@/components/app/local-time";
import { ErrorState, PageHeader, Panel, StatusChip } from "@/components/app/ui";
import { NewRequest, VoteButton } from "@/components/app/workspace-client";
import { requireSession } from "@/lib/auth";
import { CHANGELOG } from "@/lib/changelog";
import { currentUserDb } from "@/lib/db/session";

export const metadata: Metadata = { title: "Requests" };

const TONE = { open: "idle", planned: "warn", shipped: "good", declined: "bad" } as const;

export default async function Page() {
  await requireSession("/app/requests");
  // Feature requests are one list shared by every workspace, so this query has no workspace
  // filter and must not use memberRead (its server fallback is only safe on a workspace-filtered
  // query). The signed-in read stays, and a failed read shows the error state below.
  const db = await currentUserDb();
  const { data, error } = await db.from("feature_requests").select("id, title, body, votes, status, created_at").order("votes", { ascending: false }).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as { id: string; title: string; body: string | null; votes: number; status: keyof typeof TONE; created_at: string }[];
  return (
    <>
      <PageHeader title="Requests" description="Ask for a feature, vote on what others asked for, and see what has shipped." />
      <div className="flex flex-col gap-6">
        <Panel title="Ask for a feature"><NewRequest /></Panel>
        <Panel title={`Feature requests (${rows.length})`}>
          {error ? <ErrorState body="The requests could not be loaded. Reload the page." /> : rows.length === 0 ? <p className="m-0 text-[15px] text-muted-foreground">No requests yet. Use the form above to ask for what you need.</p> : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {rows.map((r) => (
                <li key={r.id} className="flex gap-4 rounded-xl border border-border bg-inset p-4">
                  <VoteButton id={r.id} votes={r.votes} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">{r.title} <StatusChip tone={TONE[r.status] ?? "idle"}>{r.status}</StatusChip></span>
                    {r.body ? <p className="m-0 text-[14px] leading-normal whitespace-pre-line text-muted-foreground">{r.body}</p> : null}
                    <LocalTime iso={r.created_at} mode="date" className="text-[12px] text-dim" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Changelog">
          <ul className="m-0 flex list-none flex-col gap-5 p-0">
            {CHANGELOG.map((c) => (
              <li key={c.date} className="flex flex-col gap-2">
                <span className="text-[15px] font-semibold">{c.title} <LocalTime iso={c.date} mode="date" className="font-mono text-[12px] font-normal text-dim" /></span>
                <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-normal text-muted-foreground">{c.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
