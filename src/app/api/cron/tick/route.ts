import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { failStalledAudits } from "@/lib/audit/run";
import { cronEnv } from "@/lib/env";
import { findOpenBatches, processBatch } from "@/lib/prospects/batch";
import { rebuildRegionalPages } from "@/lib/regional";
import { runDueSchedules } from "@/lib/schedules";
import { findStalledScans, processScan } from "@/lib/scans/engine";
import { dbAdmin } from "@/lib/db/clients";

export const maxDuration = 300;

/** Runs every minute (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). Each step is idempotent. */
export async function GET(request: Request) {
  if (!cronEnv.isConfigured()) return Response.json({ error: "cron_not_configured" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${cronEnv.get().CRON_SECRET}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return Response.json({ error: "forbidden" }, { status: 403 });

  const admin = dbAdmin();
  const report: Record<string, unknown> = {};

  // 1. Expired checkout holds give their seat back.
  const { data: released } = await admin.rpc("ladder_release_expired");
  report.holds_released = released ?? 0;
  if ((released ?? 0) > 0) revalidateTag("offer", { expire: 0 });

  // 2. Scans without a live worker are continued.
  const stalled = await findStalledScans(5);
  await Promise.all(stalled.map((id) => processScan(id, 200_000)));
  report.scans_continued = stalled.length;

  // 3. Scheduled re-checks that are due (weekly / monthly, opt-in).
  report.schedules = await runDueSchedules(5);

  // 4. Audits whose worker died are closed and their credit returned.
  report.audits_timed_out = await failStalledAudits();

  // 5. Prospect batches waiting on the Maps queue are continued.
  const batches = await findOpenBatches(3);
  await Promise.all(batches.map((id) => processBatch(id, 150_000).catch(() => undefined)));
  report.batches_continued = batches.length;

  // 6. Public regional pages are rebuilt from the scans that may be published.
  report.regional = await rebuildRegionalPages().catch(() => ({ pages: 0, indexable: 0 }));

  // 7. Housekeeping: old rate-limit windows.
  await admin.from("rate_limits").delete().lt("window_start", new Date(Date.now() - 2 * 86_400_000).toISOString());

  return Response.json({ ok: true, ...report });
}
