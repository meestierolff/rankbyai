import "server-only";
import { dbAdmin, type Db } from "./clients";
import { currentUserDb } from "./session";

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
 * The rule that makes the second step safe: `run` MUST scope its query to `workspaceId` itself
 * (`.eq("workspace_id", workspaceId)`), and `workspaceId` MUST come from the verified session
 * (`requireSession()` / `getSessionContext()`), never from the request. The server role bypasses
 * row-level security, so a query without that filter would read other workspaces.
 *
 * `asServer` tells `run` which of the two it is, for the rare read that needs another source as
 * the server (a member-only view returns nothing to the server role).
 */
export interface ReadResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
  count?: number | null;
}

export async function memberRead<T>(what: string, run: (db: Db, asServer: boolean) => PromiseLike<ReadResult<T>>): Promise<{ data: T | null; count: number | null }> {
  const first = await run(await currentUserDb(), false);
  if (!first.error) return { data: first.data, count: first.count ?? null };
  console.warn(`[db] ${what}: signed-in read failed (${first.error.code ?? "no code"}); reading as the server`);
  const second = await run(dbAdmin(), true);
  if (!second.error) return { data: second.data, count: second.count ?? null };
  throw new Error(`${what} could not be loaded (${second.error.code ?? "unknown"})`);
}
