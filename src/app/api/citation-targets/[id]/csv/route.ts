import { z } from "zod";
import { err, withSession } from "@/lib/api";
import { memberRead } from "@/lib/db/member-read";
import { targetsCsv } from "@/lib/targets/plan";
import { loadTargets } from "@/lib/targets/run";

/** Every page of a citation target search as CSV, for the user's own tools. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return err(400, "invalid_id", "Unknown citation target search.");
    const wsId = ctx.workspace.id;
    const r = await loadTargets(async (what, run) => (await memberRead(what, wsId, (db) => run(db))).data, wsId, { listId: id, limit: 1000, offset: 0 });
    if (!r.ok) return err(r.status, r.error, r.message);
    return new Response(targetsCsv(r.targets), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="citation-targets-${r.list.created_at.slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
    });
  });
}
