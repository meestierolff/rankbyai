import { after } from "next/server";
import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { memberRead } from "@/lib/db/member-read";
import { loadTargets, processTargets } from "@/lib/targets/run";

export const maxDuration = 300;

/** A search's status for the page's poller; polling finishes a search that has no live worker. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return err(400, "invalid_id", "Unknown citation target search.");
    const wsId = ctx.workspace.id;
    const r = await loadTargets(async (what, run) => (await memberRead(what, wsId, (db) => run(db))).data, wsId, { listId: id, limit: 1, offset: 0 });
    if (!r.ok) return err(r.status, r.error, r.message);
    if (r.continueList) after(() => processTargets(id));
    return json({ status: r.list.status, total: r.total });
  });
}
