import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/app/local-time";
import { EmptyState, PageHeader, Panel } from "@/components/app/ui";
import { AddClient, DeleteClient } from "@/components/app/workspace-client";
import { requireSession } from "@/lib/auth";
import { memberRead } from "@/lib/db/member-read";

export const metadata: Metadata = { title: "Clients" };

export default async function Page() {
  const ctx = await requireSession("/app/clients");
  const wsId = ctx.workspace.id;
  // Filtered by the session's workspace and read through memberRead: a failed read throws and
  // the page shows its error state, never "No clients yet".
  const [{ data: clients }, { data: businesses }] = await Promise.all([
    memberRead("Clients", wsId, (db) => db.from("clients").select("id, name, notes, created_at").eq("workspace_id", wsId).order("name").limit(500)),
    memberRead("Businesses of clients", wsId, (db) => db.from("businesses").select("id, name, client_id").eq("workspace_id", wsId).not("client_id", "is", null).limit(1000)),
  ]);
  const rows = (clients ?? []) as { id: string; name: string; notes: string | null; created_at: string }[];
  const byClient = new Map<string, { id: string; name: string }[]>();
  for (const b of (businesses ?? []) as { id: string; name: string; client_id: string }[]) byClient.set(b.client_id, [...(byClient.get(b.client_id) ?? []), { id: b.id, name: b.name }]);
  const locked = ctx.workspace.plan !== "lifetime";
  return (
    <>
      <PageHeader title="Clients" description="Group the businesses you track by client. Pick the client when you add a business." />
      <div className="flex flex-col gap-6">
        <Panel title="Add a client"><AddClient locked={locked} /></Panel>
        <Panel title={`Clients (${rows.length})`}>
          {rows.length === 0 ? (
            <EmptyState title="No clients yet" body="A client is a name you group businesses under, for example an agency customer with several locations. Add one with the form above." />
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {rows.map((c) => {
                const list = byClient.get(c.id) ?? [];
                return (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-4 first:pt-0 last:border-0 last:pb-0">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[16px] font-semibold">{c.name}</span>
                      {c.notes ? <span className="text-[14px] text-muted-foreground">{c.notes}</span> : null}
                      <span className="text-[13px] text-dim">
                        {list.length === 0 ? "No businesses yet" : <>{list.length} {list.length === 1 ? "business" : "businesses"}: {list.slice(0, 6).map((b, i) => <span key={b.id}>{i ? ", " : ""}<Link href={`/app/businesses/${b.id}`} className="text-fg underline underline-offset-2">{b.name}</Link></span>)}{list.length > 6 ? "…" : ""}</>} · added <LocalTime iso={c.created_at} mode="date" />
                      </span>
                    </div>
                    <DeleteClient id={c.id} name={c.name} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
