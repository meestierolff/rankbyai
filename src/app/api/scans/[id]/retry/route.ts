import { after } from "next/server";
import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { processScan } from "@/lib/scans/engine";
import { dbAdmin } from "@/lib/db/clients";

export const maxDuration = 300;

/** Retry only the failed samples/points of a finished BYOK scan. Work that succeeded is never repeated. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown scan.");
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "Running scans needs lifetime access.");
    const admin = dbAdmin();
    const { data: scan } = await admin.from("scans").select("id, workspace_id, kind, status, funding").eq("id", id.data).maybeSingle();
    if (!scan || scan.workspace_id !== ctx.workspace.id) return err(404, "not_found", "Unknown scan.");
    if (scan.status !== "partial" && scan.status !== "failed") return err(409, "nothing_to_retry", "This scan has no failed parts.");
    if (scan.funding !== "byok") return err(409, "not_retryable", "Included-scan checks cannot be retried. Unused credits were refunded; run it again.");

    if (scan.kind === "ai") await admin.from("ai_samples").update({ status: "pending", error: null }).eq("scan_id", scan.id).in("status", ["failed", "skipped"]);
    else await admin.from("scan_points").update({ status: "pending", error: null, dfs_task_id: null }).eq("scan_id", scan.id).eq("status", "failed");
    // Only a finished scan can be reopened (guards against double clicks racing each other).
    const { data: reopened } = await admin.from("scans").update({ status: "queued", error: null, finished_at: null, lease_until: null }).eq("id", scan.id).in("status", ["partial", "failed"]).select("id").maybeSingle();
    if (!reopened) return err(409, "already_running", "This scan is already running again.");
    after(() => processScan(scan.id));
    return json({ ok: true });
  });
}
