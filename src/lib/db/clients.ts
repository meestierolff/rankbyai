import "server-only";
import { PostgrestClient } from "@supabase/postgrest-js";
import { MissingEnvError } from "@/lib/env";
import { mintDbToken, type DbRole } from "./tokens";

/**
 * Database access goes through the Data API with one of three roles:
 *   dbAnon()        public data only (price ladder, indexable regional pages)
 *   dbUser(userId)  the signed-in user; row-level security decides what they see
 *   dbAdmin()       the application server; every caller must have authorised the request first
 * The same code runs against PostgREST locally and the Neon Data API in production.
 */
export type Db = PostgrestClient;

export const isDatabaseConfigured = () => !!process.env.DATA_API_URL && !!process.env.DATA_API_JWT_PRIVATE_JWK;

function baseUrl(): string {
  const url = process.env.DATA_API_URL;
  if (!url) throw new MissingEnvError("database", ["DATA_API_URL"]);
  return url.replace(/\/$/, "");
}

/** Raised by private.uid() when a signed-in request reached the database without its identity. */
export const IDENTITY_MISSING = "RB001";
const IDENTITY_RETRIES = 8;
/**
 * Wait before retry n (0-based): 30, 60, 120, 240, 480 ms, then 800 ms each, about 3.3 s in total.
 * On 18 Nov 2026 a first sign-in on production was refused five times within 350 ms, so the old
 * limit of four quick retries was too short for a cold gateway.
 */
export const identityRetryDelayMs = (attempt: number): number => Math.min(30 * 2 ** attempt, 800);

async function identityMissing(res: Response): Promise<boolean> {
  if (res.ok) return false;
  const body = (await res.clone().json().catch(() => null)) as { code?: string } | null;
  return body?.code === IDENTITY_MISSING;
}

function client(role: DbRole, userId?: string): Db {
  // The token is resolved per request so it is always fresh; the builder API stays synchronous.
  const authedFetch: typeof fetch = async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${await mintDbToken(role, userId)}`);
      const res = await fetch(input, { ...init, headers, cache: "no-store" });
      // The Neon gateway can run the first request on a new connection without the token's claims.
      // The database refuses such a request (RB001) before touching any row, so sending it again is
      // safe, also for writes. See db/migrations/0004_identity_guard.sql.
      if (role !== "authenticated" || attempt >= IDENTITY_RETRIES || !(await identityMissing(res))) return res;
      await new Promise((r) => setTimeout(r, identityRetryDelayMs(attempt) + Math.random() * 25));
    }
  };
  return new PostgrestClient(baseUrl(), { fetch: authedFetch });
}

let admin: Db | undefined;
let anon: Db | undefined;

export const dbAdmin = (): Db => (admin ??= client("service_role"));
export const dbAnon = (): Db => (anon ??= client("anonymous"));
export const dbUser = (userId: string): Db => client("authenticated", userId);
