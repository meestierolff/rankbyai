import { after } from "next/server";
import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { memberRead } from "@/lib/db/member-read";
import { loadPack, processPackRun } from "@/lib/packs/run";
import type { Read } from "@/lib/scans/change-note-data";
import { userRead } from "@/components/app/reads";

export const maxDuration = 300;

/** A pack run's progress for the citation workflow page; polling continues the run when no worker holds it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const { id } = await params;
    const q = z.object({ id: z.uuid(), run_id: z.uuid().optional() }).safeParse({ id, run_id: new URL(request.url).searchParams.get("run_id") ?? undefined });
    if (!q.success) return err(400, "invalid_id", "Unknown prompt pack.");
    const wsId = ctx.workspace.id;
    const ws: Read = async (what, run) => (await memberRead(what, wsId, (db) => run(db))).data;
    const rows: Read = (what, run) => userRead(what, run);
    const r = await loadPack({ ws, rows }, wsId, { packId: q.data.id, runId: q.data.run_id });
    if (!r.ok) return err(r.status, r.error, r.message);
    if (r.continueRun) after(() => processPackRun(r.continueRun!));
    const run = r.report.run as { status: string; pages_checked: boolean } | null;
    return json({ status: run?.status ?? null, pages_checked: run?.pages_checked ?? false });
  });
}
