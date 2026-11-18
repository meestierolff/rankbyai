import { z } from "zod";
import { err, json, sessionRead, withSession } from "@/lib/api";
import { currentUserDb } from "@/lib/db/session";

const Body = z.object({ name: z.string().trim().min(1).max(200), notes: z.string().trim().max(2000).optional() });

/** Create a client (a group of businesses). Row-level security scopes it to the caller's workspace. */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "Adding clients needs lifetime access.");
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Give the client a name (up to 200 characters).");
    // A failed count answers 503 (sessionRead); it is never read as "no clients yet".
    const { count } = await sessionRead("Count of clients", ctx, (db) => db.from("clients").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id));
    if ((count ?? 0) >= 500) return err(409, "limit_reached", "A workspace can hold 500 clients.");
    // The write stays on the signed-in client: row-level security checks it.
    const db = await currentUserDb();
    const { data, error } = await db.from("clients").insert({ workspace_id: ctx.workspace.id, name: parsed.data.name, notes: parsed.data.notes || null }).select("id").single();
    if (error || !data) return err(500, "server_error", "The client could not be saved.");
    return json({ ok: true, id: data.id });
  });
}
