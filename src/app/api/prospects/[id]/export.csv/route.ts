import { z } from "zod";
import { err, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import { currentUserDb } from "@/lib/db/session";
import { publicEnv } from "@/lib/env";
import { batchCsv, type BatchRow } from "@/lib/prospects/batch";

/** Batch export (brief 7.7): business, website, phone, Maps score, AI mention rate, top competitor, opener, report URL. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown batch.");
    const db = await currentUserDb();
    const { data: batch } = await db.from("prospect_batches").select("id, niche, rows").eq("id", id.data).maybeSingle();
    if (!batch) return err(404, "not_found", "Unknown batch.");
    await captureServer("csv_exported", ctx.workspace.id, { kind: "prospect_batch" });
    return new Response(batchCsv(batch.rows as BatchRow[], publicEnv.siteUrl), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="prospects-${String(batch.niche ?? "batch").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv"`, "Cache-Control": "no-store" },
    });
  });
}
