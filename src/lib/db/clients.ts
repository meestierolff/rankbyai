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

function client(role: DbRole, userId?: string): Db {
  // The token is resolved per request so it is always fresh; the builder API stays synchronous.
  const authedFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${await mintDbToken(role, userId)}`);
    return fetch(input, { ...init, headers, cache: "no-store" });
  };
  return new PostgrestClient(baseUrl(), { fetch: authedFetch });
}

let admin: Db | undefined;
let anon: Db | undefined;

export const dbAdmin = (): Db => (admin ??= client("service_role"));
export const dbAnon = (): Db => (anon ??= client("anonymous"));
export const dbUser = (userId: string): Db => client("authenticated", userId);
