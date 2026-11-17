import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel, PrimaryLink, SecondaryLink, StatTile, StatusChip, fmtDateTime, fmtUsd } from "@/components/app/ui";
import { requireSession } from "@/lib/auth";
import { ENGINE_LABEL } from "@/lib/pricing-constants";
import { countRows, getByokSpendThisMonth, getCreditBalance, getKeyStatuses, getRecentScans, type Provider } from "@/lib/workspace-data";

export const metadata: Metadata = { title: "Dashboard" };

const PROVIDERS: { key: Provider; label: string; use: string }[] = [
  { key: "dataforseo", label: "DataForSEO", use: "Maps grids, business search, audit" },
  { key: "openai", label: `OpenAI (${ENGINE_LABEL.openai.short})`, use: "AI checks" },
  { key: "perplexity", label: "Perplexity", use: "AI checks" },
  { key: "gemini", label: "Gemini", use: "AI checks with Maps grounding" },
];

export default async function DashboardPage() {
  const ctx = await requireSession("/app");
  const ws = ctx.workspace;
  const [keys, credits, scans, spend, businesses] = await Promise.all([
    getKeyStatuses(ws.id),
    getCreditBalance(ws.id),
    getRecentScans(ws.id),
    getByokSpendThisMonth(ws.id),
    countRows("businesses", ws.id),
  ]);
  const valid = keys.filter((k) => k.status === "valid").length;
  const lifetime = ws.plan === "lifetime";

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={lifetime ? "Keys, credits, recent scans and what you spent on your own keys this month." : "Have a look around. Buy lifetime access when you are ready to run real scans."}
        actions={<><SecondaryLink href="/app/businesses">Add a business</SecondaryLink><PrimaryLink href="/app/ai-visibility">Run an AI check</PrimaryLink></>}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        <StatTile label="Lifetime seat" value={lifetime ? `#${ws.lifetime_seat ?? "—"}` : "—"} hint={lifetime ? "Paid once. No renewal." : <Link href="/app/billing" className="text-fg underline underline-offset-2">Get lifetime access</Link>} tone={lifetime ? "good" : undefined} />
        <StatTile label="API keys connected" value={`${valid}/4`} hint={valid === 0 ? "Add DataForSEO and one AI key to start" : "Tested and encrypted"} />
        <StatTile label="Included scan credits" value={credits} hint="Never expire" />
        <StatTile label="Spent on your keys this month" value={fmtUsd(spend)} hint="From scan actuals. Billed by your vendors, not by us." />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Recent scans" action={<Link href="/app/ai-visibility" className="text-[13px] text-muted-foreground no-underline hover:text-fg">All scans →</Link>}>
          {scans.length === 0 ? (
            <EmptyState
              title="No scans yet"
              body={businesses === 0 ? "Add a business first, then run an AI check or a Maps grid. The grid fills in point by point." : "Run an AI check or a Maps grid for one of your businesses."}
              action={<PrimaryLink href={businesses === 0 ? "/app/businesses" : "/app/ai-visibility"}>{businesses === 0 ? "Add a business" : "Run a check"}</PrimaryLink>}
            />
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {scans.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
                  <Link href={`/app/${s.kind === "ai" ? "ai-visibility" : "maps-grid"}/${s.id}`} className="flex min-w-0 flex-col gap-[2px] no-underline">
                    <span className="truncate text-[15px] font-medium text-fg">{s.businesses?.name ?? "Business"}</span>
                    <span className="text-[13px] text-dim">
                      {s.kind === "ai" ? "AI grid" : "Maps grid"} {s.grid_size}×{s.grid_size} · {s.niche ?? s.keyword ?? ""} · {fmtDateTime(s.created_at)}
                    </span>
                  </Link>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-[13px] text-muted-foreground">{fmtUsd(s.actual_cost_usd ?? s.est_cost_usd, 3)}</span>
                    <StatusChip tone={s.status === "done" ? "good" : s.status === "failed" ? "bad" : s.status === "partial" ? "warn" : "idle"}>{s.status}</StatusChip>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="API keys" action={<Link href="/app/settings/keys" className="text-[13px] text-muted-foreground no-underline hover:text-fg">Manage →</Link>}>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {PROVIDERS.map((p) => {
              const k = keys.find((x) => x.provider === p.key);
              return (
                <li key={p.key} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-medium">{p.label}</span>
                    <span className="truncate text-[13px] text-dim">
                      {k ? `${k.hint ?? "saved"}${k.last_balance_usd != null ? ` · balance ${fmtUsd(k.last_balance_usd)}` : ""}` : p.use}
                    </span>
                  </span>
                  <StatusChip tone={!k ? "idle" : k.status === "valid" ? "good" : k.status === "invalid" ? "bad" : "warn"}>{k ? k.status : "not set"}</StatusChip>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </>
  );
}
