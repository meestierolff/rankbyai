import { after } from "next/server";
import { z } from "zod";
import { err, json, sessionRead, withSession } from "@/lib/api";
import { processBatch } from "@/lib/prospects/batch";

export const maxDuration = 300;

type BatchStatus = Record<string, unknown> & { id: string; status: string; lease_until: string | null };

/** Batch status for the progress page. Polling also continues a batch that has no live worker. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown batch.");
    const { data: batch } = await sessionRead<BatchStatus>("Prospect batch", ctx, (db) =>
      db.from("prospect_batches").select("id, mode, niche, city, funding, total, done, failed, status, rows, created_at, finished_at, lease_until").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle(),
    );
    if (!batch) return err(404, "not_found", "Unknown batch.");
    const active = batch.status === "queued" || batch.status === "running";
    if (active && (!batch.lease_until || new Date(batch.lease_until).getTime() < Date.now())) after(() => processBatch(batch.id, 150_000));
    return json({ batch: { ...batch, lease_until: undefined } });
  });
}
