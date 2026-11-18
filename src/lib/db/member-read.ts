import "server-only";
import { dbAdmin, dbUser, type Db } from "./clients";
import { currentMember } from "./session";

/**
 * Reads for a signed-in member that must never come back as a fake "nothing here yet".
 *
 * Why this exists: the hosted database gateway sometimes runs a signed-in request without its
 * identity (seen on production on 18 Nov 2026 in two of three dashboard loads). Row-level security
 * then refuses the read or matches nothing, and a page that ignores the error shows an empty state
 * over real data ("0 of 4 keys", "No businesses yet").
 *
 * What it does: runs the query as the signed-in user (row-level security applies). If that read
 * fails, it runs the SAME query as the server and logs the first error. If that fails too, it
 * throws, so the page shows an error instead of a wrong empty state.
 *
 * The server role bypasses row-level security, so the fallback is guarded twice:
 *   1. `workspaceId` must be the workspace of the verified session. This function checks that
 *      itself, from the session cookie, and throws otherwise. A workspace id taken from the request
 *      can therefore never reach the server role.
 *   2. `run` must filter its query by that id (`.eq("workspace_id", workspaceId)`); for a row
 *      fetched by its own id, add the workspace filter as well. This part cannot be enforced here,
 *      so every caller is reviewed for it.
 *
 * `asServer` tells `run` which of the two it is, for the rare read that needs another source as
 * the server (a member-only view returns nothing to the server role).
 */
export interface ReadResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
  count?: number | null;
}

export class NotAMemberError extends Error {
  constructor() {
    super("This workspace does not belong to the signed-in user.");
    this.name = "NotAMemberError";
  }
}

export async function memberRead<T>(
  what: string,
  workspaceId: string,
  run: (db: Db, asServer: boolean) => PromiseLike<ReadResult<T>>,
): Promise<{ data: T | null; count: number | null }> {
  const member = await currentMember();
  // No session, or a workspace other than the session's own: never read, on either path.
  if (!member || member.workspaceId !== workspaceId) throw new NotAMemberError();

  const first = await run(dbUser(member.userId), false);
  if (!first.error) return { data: first.data, count: first.count ?? null };
  console.warn(`[db] ${what}: signed-in read failed (${first.error.code ?? "no code"}); reading as the server`);
  const second = await run(dbAdmin(), true);
  if (!second.error) return { data: second.data, count: second.count ?? null };
  throw new Error(`${what} could not be loaded (${second.error.code ?? "unknown"})`);
}
