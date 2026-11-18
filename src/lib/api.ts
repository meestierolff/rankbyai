import "server-only";
import { getSessionContext, type SessionContext } from "@/lib/auth";
import type { Db } from "@/lib/db/clients";
import { memberRead, type ReadResult } from "@/lib/db/member-read";
import { MissingEnvError } from "@/lib/env";

/** Small helpers for the app's own (session-authenticated) JSON routes. */
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const err = (status: number, error: string, message: string, extra: object = {}) => json({ error, message, ...extra }, status);

export const LOAD_FAILED = "Could not load this right now. Try again.";
export const SAVE_FAILED = "Could not save this right now. Try again.";
/**
 * 503: the database did not answer this request. The caller may try again. Never answer a failed
 * read with 404 or an empty 200: that tells a real user their data does not exist.
 */
export const unavailable = (message = LOAD_FAILED) => err(503, "unavailable", message);

/** A member's read failed as the signed-in user and as the server. withSession answers 503. */
export class ReadUnavailableError extends Error {
  constructor(what: string) {
    super(`${what} could not be loaded`);
    this.name = "ReadUnavailableError";
  }
}

/**
 * memberRead for a route inside withSession: the result, or a 503 when the read failed on both paths.
 *
 * The fallback runs as the server and bypasses row-level security, so `run` MUST filter by
 * `ctx.workspace.id` in the query itself (`.eq("workspace_id", ctx.workspace.id)`), also for a row
 * fetched by its own id. `ctx` is the verified session, never a value from the request.
 */
export async function sessionRead<T>(what: string, ctx: SessionContext, run: (db: Db, asServer: boolean) => PromiseLike<ReadResult<T>>): Promise<{ data: T | null; count: number | null }> {
  try {
    return await memberRead<T>(what, ctx.workspace.id, run);
  } catch (e) {
    if (e instanceof MissingEnvError) throw e;
    // memberRead has logged the error code of the signed-in read; no row content is logged here.
    console.error(`[api] ${what}: read failed (${e instanceof Error ? e.name : "unknown"})`);
    throw new ReadUnavailableError(what);
  }
}

export async function withSession(handler: (ctx: SessionContext) => Promise<Response>): Promise<Response> {
  // Outside the try on purpose: Next.js signals "this route is dynamic" by throwing from request
  // APIs during the build, and that signal must reach the framework.
  const ctx = await getSessionContext();
  if (!ctx) return err(401, "unauthorized", "Sign in first.");
  try {
    return await handler(ctx);
  } catch (e) {
    if (e instanceof MissingEnvError) return err(503, "not_configured", `This feature is not configured yet (${e.missing.join(", ")}).`);
    if (e instanceof ReadUnavailableError) return unavailable();
    console.error("[api] unexpected error:", e instanceof Error ? e.name : "unknown");
    return err(500, "server_error", "Something went wrong. Nothing was charged.");
  }
}

export const requireOwner = (ctx: SessionContext) => (ctx.role === "owner" ? null : err(403, "forbidden", "Only the workspace owner can do this."));
