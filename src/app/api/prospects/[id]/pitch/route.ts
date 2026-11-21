import { z } from "zod";
import { err, json, sessionRead, withSession } from "@/lib/api";
import { reportOriginFor } from "@/lib/domains-server";
import type { BatchRow } from "@/lib/prospects/batch";
import { pitchForProspect } from "@/lib/prospects/pitch";

/** The email teaser of one report in a batch, for the batch page. Free: it formats the stored report. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    const business = z.uuid().safeParse(new URL(request.url).searchParams.get("business_id"));
    if (!id.success || !business.success) return err(400, "invalid_id", "Unknown batch or business.");
    const { data: batch } = await sessionRead<{ rows: BatchRow[] }>("Prospect batch", ctx, (db) =>
      db.from("prospect_batches").select("rows").eq("id", id.data).eq("workspace_id", ctx.workspace.id).maybeSingle(),
    );
    if (!batch) return err(404, "not_found", "Unknown batch.");
    const r = await pitchForProspect(batch.rows ?? [], business.data, await reportOriginFor(ctx.workspace.id));
    return r.ok ? json(r.body) : err(r.status, r.error, r.message);
  });
}
