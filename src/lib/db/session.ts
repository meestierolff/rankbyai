import "server-only";
import { getSessionContext } from "@/lib/auth";
import { dbAnon, dbUser, type Db } from "./clients";

/** The Data API client for whoever is making this request: their own rows through RLS, or public data only. */
export async function currentUserDb(): Promise<Db> {
  const ctx = await getSessionContext();
  return ctx ? dbUser(ctx.user.id) : dbAnon();
}

/**
 * The signed-in user and the one workspace their verified session belongs to, or null.
 * memberRead uses it to refuse any workspace id that is not the session's own.
 */
export async function currentMember(): Promise<{ userId: string; workspaceId: string } | null> {
  const ctx = await getSessionContext();
  return ctx ? { userId: ctx.user.id, workspaceId: ctx.workspace.id } : null;
}
