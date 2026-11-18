import "server-only";
import type { Db } from "@/lib/db/clients";
import { currentUserDb } from "@/lib/db/session";

/**
 * A signed-in read of a table that has NO workspace_id column (scan_points, ai_samples,
 * audit_findings: rows that hang off a scan or an audit).
 *
 * memberRead (lib/db/member-read) is not used for these on purpose: its server fallback bypasses
 * row-level security and is only safe on a query that filters by the session's workspace id
 * itself, which these tables cannot do. So this read stays under row-level security, and a
 * failure throws: the page shows its error state, never an empty one.
 */
export async function userRead<T>(what: string, run: (db: Db) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>): Promise<T | null> {
  const { data, error } = await run(await currentUserDb());
  if (error) throw new Error(`${what} could not be loaded (${error.code ?? "unknown"})`);
  return data;
}
