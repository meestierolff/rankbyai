import "server-only";
import { getSessionContext, type SessionContext } from "@/lib/auth";
import { MissingEnvError } from "@/lib/env";

/** Small helpers for the app's own (session-authenticated) JSON routes. */
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const err = (status: number, error: string, message: string, extra: object = {}) => json({ error, message, ...extra }, status);

export async function withSession(handler: (ctx: SessionContext) => Promise<Response>): Promise<Response> {
  // Outside the try on purpose: Next.js signals "this route is dynamic" by throwing from request
  // APIs during the build, and that signal must reach the framework.
  const ctx = await getSessionContext();
  if (!ctx) return err(401, "unauthorized", "Sign in first.");
  try {
    return await handler(ctx);
  } catch (e) {
    if (e instanceof MissingEnvError) return err(503, "not_configured", `This feature is not configured yet (${e.missing.join(", ")}).`);
    console.error("[api] unexpected error:", e instanceof Error ? e.name : "unknown");
    return err(500, "server_error", "Something went wrong. Nothing was charged.");
  }
}

export const requireOwner = (ctx: SessionContext) => (ctx.role === "owner" ? null : err(403, "forbidden", "Only the workspace owner can do this."));
