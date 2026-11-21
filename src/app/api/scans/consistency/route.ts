import { after } from "next/server";
import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { CreateConsistency, runConsistency } from "@/lib/api-v1/core";
import { memberRead } from "@/lib/db/member-read";
import type { Read } from "@/lib/scans/change-note-data";
import { loadConsistency, processGroup } from "@/lib/scans/consistency-run";
import { userRead } from "@/components/app/reads";

export const maxDuration = 300;

/**
 * Consistency check from the scan form. Without `confirm: true` the response is the estimate only
 * (HTTP 409 confirmation_required: runs × one grid); with it, the runs are created and worked
 * through one after another after the response is sent.
 */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const parsed = CreateConsistency.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", parsed.error.issues[0]?.message ?? "Check the settings and try again.");
    const b = parsed.data;
    if (!b.engines?.length) return err(400, "invalid_body", "Pick at least one AI engine.");
    const r = await runConsistency(ctx.workspace.id, ctx.workspace.plan, b, b.engines);
    if (!r.ok) return err(r.status, r.error, r.message, "estimate" in r && r.estimate ? { estimate: r.estimate } : {});
    after(() => processGroup(r.runs.map((x) => x.scanId)));
    return json({ ok: true, group_id: r.groupId, runs: r.runs.map((x) => ({ role: x.role, scan_id: x.scanId })), estimate: r.estimate });
  });
}

/** The check's runs and comparisons for the result view; polling continues the next run, in order. */
export async function GET(request: Request) {
  return withSession(async (ctx) => {
    const sp = new URL(request.url).searchParams;
    const q = z.object({ group_id: z.uuid().optional(), a: z.uuid().optional(), b: z.uuid().optional() }).safeParse(Object.fromEntries(sp));
    if (!q.success) return err(400, "invalid_id", "Unknown consistency check.");
    const wsId = ctx.workspace.id;
    const ws: Read = async (what, run) => (await memberRead(what, wsId, (db) => run(db))).data;
    const rows: Read = (what, run) => userRead(what, run);
    const r = await loadConsistency({ ws, rows }, wsId, { groupId: q.data.group_id, a: q.data.a, b: q.data.b });
    if (!r.ok) return err(r.status, r.error, r.message);
    if (r.next?.leaseFree) {
      const rest = r.report.runs.filter((x) => x.status === "queued" || x.status === "running").map((x) => x.scan_id);
      after(() => processGroup(rest));
    }
    return json({ consistency: r.report });
  });
}
