import type { Metadata } from "next";
import Link from "next/link";
import { firstRunSteps, keysHint, plural, seatText, type FirstRunStep } from "@/components/app/first-run";
import { includedScans } from "@/components/app/included";
import { LocalTime } from "@/components/app/local-time";
import { EmptyState, PageHeader, Panel, PrimaryLink, SecondaryLink, StatTile, StatusChip, fmtUsd } from "@/components/app/ui";
import { requireSession } from "@/lib/auth";
import { estimateAiGrid } from "@/lib/cost/estimate";
import { memberRead } from "@/lib/db/member-read";
import { CREDIT_COST, ENGINE_LABEL, ENGINES } from "@/lib/pricing-constants";
import { cn } from "@/lib/utils";
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
  const [keys, credits, scans, spend, businesses, included, { count: finished }] = await Promise.all([
    getKeyStatuses(ws.id),
    getCreditBalance(ws.id),
    getRecentScans(ws.id),
    getByokSpendThisMonth(ws.id),
    countRows("businesses", ws.id),
    includedScans(ws.id),
    memberRead("Finished scans", ws.id, (db) =>
      db.from("scans").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).in("status", ["done", "partial"]),
    ),
  ]);
  const validKey = (p: Provider) => keys.some((k) => k.provider === p && k.status === "valid");
  const valid = keys.filter((k) => k.status === "valid").length;
  const lifetime = ws.plan === "lifetime";
  const includedOpen = included.engines.length > 0;

  // What the first 3×3 AI check costs: on the workspace's own AI keys when it has any (the
  // app's estimator, same as the scan form), otherwise in included credits when those can pay.
  const ownEngines = ENGINES.filter((e) => validKey(e));
  const checkCost = ownEngines.length
    ? `A 3×3 check on your ${plural(ownEngines.length, "AI key")} costs about ${fmtUsd(estimateAiGrid(3, ownEngines).totalUsd, 2)}.`
    : includedOpen && credits >= CREDIT_COST.ai_grid_3
      ? `A 3×3 check uses ${plural(CREDIT_COST.ai_grid_3, "included credit")} (${credits} left).`
      : null;
  const newest = scans[0];
  const active = scans.find((s) => s.status === "queued" || s.status === "running");
  const steps = lifetime
    ? firstRunSteps({
        locked: !lifetime,
        businesses,
        finishedScans: finished ?? 0,
        activeScan: active ? { id: active.id, kind: active.kind } : null,
        lastScanFailed: !active && newest?.status === "failed",
        hasSearchKey: validKey("dataforseo"),
        checkCost,
      })
    : null;
  const seat = seatText(ws.lifetime_seat);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={lifetime ? "Keys, credits, recent scans and what you spent on your own keys this month." : "Have a look around. Buy lifetime access when you are ready to run real scans."}
        actions={<><SecondaryLink href="/app/businesses">Add a business</SecondaryLink><PrimaryLink href="/app/ai-visibility">Run an AI check</PrimaryLink></>}
      />

      {steps ? <GetStarted steps={steps} /> : null}

      <div className={cn("grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4", steps && "mt-6")}>
        <StatTile
          label="Plan"
          value={lifetime ? "Lifetime" : "Not purchased"}
          hint={lifetime ? (seat ? `${seat} · paid once, no renewal` : "Paid once. No renewal.") : <Link href="/app/billing" className="text-fg underline underline-offset-2">Get lifetime access</Link>}
          tone={lifetime ? "good" : undefined}
        />
        <StatTile label="API keys connected" value={`${valid}/4`} hint={keysHint(valid, credits, includedOpen)} />
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
                      {s.kind === "ai" ? "AI grid" : "Maps grid"} {s.grid_size}×{s.grid_size} · {s.niche ?? s.keyword ?? ""} · <LocalTime iso={s.created_at} />
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

/** The first-run checklist: three steps with their real state, one link each. Gone after the first finished scan. */
function GetStarted({ steps }: { steps: FirstRunStep[] }) {
  const done = steps.filter((s) => s.state === "done").length;
  return (
    <Panel title={<>Get started <span className="ml-2 font-mono text-[12px] font-normal text-dim">{done} of {steps.length} done</span></>}>
      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3 p-0">
        {steps.map((s, i) => (
          <li
            key={s.key}
            aria-current={s.state === "current" ? "step" : undefined}
            className={cn(
              "flex flex-col gap-2 rounded-[12px] border p-4",
              s.state === "current" ? "border-[rgba(255,122,26,0.45)] bg-[rgba(255,122,26,0.06)]" : "border-border bg-inset",
            )}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "grid size-[22px] shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold",
                  s.state === "done" ? "bg-g1 text-bg" : s.state === "current" ? "bg-lp-accent text-[#140800]" : "border border-border-strong text-dim",
                )}
              >
                {s.state === "done" ? "✓" : i + 1}
              </span>
              <span className={cn("text-[15px] font-medium", s.state === "todo" && "text-muted-foreground")}>{s.title}</span>
              <span className="sr-only">{s.state === "done" ? "(done)" : s.state === "current" ? "(next step)" : ""}</span>
            </span>
            <span className="text-[13px] leading-normal text-dim">{s.detail}</span>
            {s.state !== "todo" ? (
              <Link href={s.href} className="mt-auto text-[14px] font-medium text-fg underline underline-offset-[3px] hover:text-lp-accent-text">
                {s.action} →
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
