import "server-only";
import { getSessionContext } from "@/lib/auth";
import { dbAnon, dbUser, type Db } from "./clients";

/** The Data API client for whoever is making this request: their own rows through RLS, or public data only. */
export async function currentUserDb(): Promise<Db> {
  const ctx = await getSessionContext();
  return ctx ? dbUser(ctx.user.id) : dbAnon();
}
