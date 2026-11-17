import "server-only";
import type { ScanSpec } from "@/lib/cost-guard";
import { FAIR_USE, type Engine, type MapsMode } from "@/lib/pricing-constants";
import { createScan, processScan } from "@/lib/scans/engine";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Scheduled re-checks (brief 7.2). A tracked query stores a scan setup; the cron tick runs the due
 * ones. BYOK schedules charge the user's own keys; credit-funded schedules need a balance.
 * Schedules are always opt-in: nothing recurs unless the user picked weekly or monthly.
 */
export type Schedule = "none" | "daily" | "weekly" | "monthly";

export function nextRunAt(schedule: Schedule, from: Date): Date | null {
  if (schedule === "none") return null;
  const d = new Date(from);
  if (schedule === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (schedule === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else {
    // Same day next month, clamped to the month's last day (31 Jan → 28/29 Feb).
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  }
  return d;
}

export interface TrackedQueryRow {
  id: string;
  workspace_id: string;
  business_id: string;
  kind: "ai" | "maps";
  keyword: string | null;
  prompt_template: string | null;
  niche: string | null;
  grid_size: number;
  radius_miles: number;
  engines: Engine[];
  funding: "byok" | "credits";
  schedule: Schedule;
  next_run_at: string | null;
  active: boolean;
}

export interface TrackInput {
  workspaceId: string;
  businessId: string;
  kind: "ai" | "maps";
  keyword: string;
  promptTemplate?: string | null;
  gridSize: number;
  radiusMiles: number;
  engines: Engine[];
  funding: "byok" | "credits";
  schedule: Exclude<Schedule, "none" | "daily">;
}

/** Create (or update) the schedule for one business + kind + keyword. */
export async function upsertTrackedQuery(input: TrackInput, now: Date = new Date()): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const admin = supabaseAdmin();
  const keyword = input.keyword.trim();
  const { data: existing } = await admin
    .from("tracked_queries")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("business_id", input.businessId)
    .eq("kind", input.kind)
    .eq(input.kind === "ai" ? "niche" : "keyword", keyword)
    .maybeSingle();
  const row = {
    workspace_id: input.workspaceId,
    business_id: input.businessId,
    kind: input.kind,
    keyword: input.kind === "maps" ? keyword : null,
    niche: input.kind === "ai" ? keyword : null,
    prompt_template: input.kind === "ai" ? (input.promptTemplate ?? null) : null,
    grid_size: input.gridSize,
    radius_miles: input.radiusMiles,
    engines: input.kind === "ai" ? input.engines : [],
    funding: input.funding,
    schedule: input.schedule,
    next_run_at: nextRunAt(input.schedule, now)!.toISOString(),
    active: true,
  };
  if (existing) {
    const { error } = await admin.from("tracked_queries").update(row).eq("id", existing.id);
    return error ? { ok: false, message: "The schedule could not be saved." } : { ok: true, id: existing.id };
  }
  const { count } = await admin.from("tracked_queries").select("id", { count: "exact", head: true }).eq("workspace_id", input.workspaceId).eq("active", true).neq("schedule", "none");
  if ((count ?? 0) >= FAIR_USE.scheduledQueries) return { ok: false, message: `The fair-use limit is ${FAIR_USE.scheduledQueries.toLocaleString("en-US")} scheduled queries per workspace.` };
  const { data, error } = await admin.from("tracked_queries").insert(row).select("id").single();
  return error || !data ? { ok: false, message: "The schedule could not be saved." } : { ok: true, id: data.id };
}

export interface ScheduleRunReport {
  due: number;
  started: number;
  skipped: { id: string; reason: string }[];
}

/**
 * Run the schedules that are due. Each one is claimed by moving `next_run_at` forward in a single
 * conditional UPDATE, so two overlapping cron ticks can never start the same schedule twice.
 */
export async function runDueSchedules(limit = 10, now: Date = new Date(), process: (scanId: string) => Promise<void> = (id) => processScan(id, 150_000)): Promise<ScheduleRunReport> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("tracked_queries").select("*").eq("active", true).neq("schedule", "none").lte("next_run_at", now.toISOString()).order("next_run_at").limit(limit);
  const due = (data ?? []) as TrackedQueryRow[];
  const report: ScheduleRunReport = { due: due.length, started: 0, skipped: [] };
  const started: string[] = [];

  for (const tq of due) {
    const next = nextRunAt(tq.schedule, now);
    const { data: claimed } = await admin
      .from("tracked_queries")
      .update({ next_run_at: next?.toISOString() ?? null })
      .eq("id", tq.id)
      .eq("next_run_at", tq.next_run_at as string)
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // another tick took it

    const { data: ws } = await admin.from("workspaces").select("plan").eq("id", tq.workspace_id).maybeSingle();
    const spec = (tq.kind === "ai"
      ? { kind: "ai", grid: tq.grid_size, engines: tq.engines }
      // Scheduled Maps scans use the Standard queue (the cheapest; brief 6.1).
      : { kind: "maps", grid: tq.grid_size, mode: "standard" as MapsMode }) as ScanSpec;
    const result = await createScan({
      workspaceId: tq.workspace_id,
      plan: (ws?.plan as "locked" | "lifetime") ?? "locked",
      businessId: tq.business_id,
      spec,
      keyword: (tq.kind === "ai" ? tq.niche : tq.keyword) ?? "",
      promptTemplate: tq.prompt_template,
      radiusMiles: Number(tq.radius_miles),
      funding: tq.funding,
      trackedQueryId: tq.id,
      confirm: true, // the user confirmed the recurring cost when they created the schedule
    });
    if (!result.ok) {
      report.skipped.push({ id: tq.id, reason: result.error });
      continue;
    }
    report.started++;
    started.push(result.scanId);
  }
  await Promise.all(started.map((id) => process(id).catch(() => undefined)));
  return report;
}
