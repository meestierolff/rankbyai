import { z } from "zod";
import { err, json, SAVE_FAILED, unavailable, withSession } from "@/lib/api";
import { currentUserDb } from "@/lib/db/session";

const FOREIGN_KEY_VIOLATION = "23503";

/** One vote per person per request. Voting twice changes nothing. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async () => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown request.");
    const db = await currentUserDb();
    const { data, error } = await db.rpc("vote_feature_request", { p_request_id: id.data });
    // An unknown request fails the foreign key of the vote (23503). Any other error means the vote
    // was not stored, which is not the same as "unknown request".
    if (error && error.code !== FOREIGN_KEY_VIOLATION) return unavailable(SAVE_FAILED);
    if (error || data == null) return err(404, "not_found", "Unknown request.");
    return json({ ok: true, votes: data });
  });
}
