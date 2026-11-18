import { z } from "zod";
import { err, sessionRead, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import { publicEnv } from "@/lib/env";
import type { BatchRow } from "@/lib/prospects/batch";
import { zipBatchPdfs } from "@/lib/prospects/zip";

export const maxDuration = 300;

/** All finished reports of a batch as PDFs in one zip. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown batch.");
    const { data: batch } = await sessionRead<{ id: string; niche: string | null; rows: BatchRow[] }>("Prospect batch", ctx, (db) => db.from("prospect_batches").select("id, niche, rows").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle());
    if (!batch) return err(404, "not_found", "Unknown batch.");
    const rows = batch.rows.filter((r) => r.status === "done" && r.report_slug);
    if (rows.length === 0) return err(409, "no_reports", "No report in this batch is ready yet.");
    const zip = await zipBatchPdfs(rows, publicEnv.siteUrl);
    await captureServer("pdf_downloaded", ctx.workspace.id, { kind: "batch_zip", count: zip.count });
    return new Response(new Uint8Array(zip.bytes), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="prospect-reports-${String(batch.niche ?? "batch").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.zip"`, "Cache-Control": "no-store" },
    });
  });
}
