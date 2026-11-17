import { after } from "next/server";
import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { currentUserDb } from "@/lib/db/session";
import { processBatch } from "@/lib/prospects/batch";

export const maxDuration = 300;

/** Batch status for the progress page. Polling also continues a batch that has no live worker. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async () => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown batch.");
    const db = await currentUserDb();
    const { data: batch } = await db.from("prospect_batches").select("id, mode, niche, city, funding, total, done, failed, status, rows, created_at, finished_at, lease_until").eq("id", id.data).maybeSingle();
    if (!batch) return err(404, "not_found", "Unknown batch.");
    const active = batch.status === "queued" || batch.status === "running";
    if (active && (!batch.lease_until || new Date(batch.lease_until).getTime() < Date.now())) after(() => processBatch(batch.id, 150_000));
    return json({ batch: { ...batch, lease_until: undefined } });
  });
}
