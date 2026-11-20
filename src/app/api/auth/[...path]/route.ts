import { isAuthConfigured, neonAuth } from "@/lib/auth-neon/server";
import { gateAuthRequest } from "@/lib/reviewer-login";

/**
 * All sign-in traffic (Google OAuth start, callback, session, sign-out) is proxied to Neon Auth here.
 * Password sign-in passes only for listed app-directory reviewers; see src/lib/reviewer-login.ts.
 */
type Ctx = { params: Promise<{ path: string[] }> };
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function run(method: Method) {
  return async (request: Request, ctx: Ctx) => {
    if (!isAuthConfigured()) {
      return Response.json({ error: "auth_not_configured", message: "Sign-in is not configured on this deployment yet." }, { status: 503 });
    }
    const blocked = await gateAuthRequest(method, (await ctx.params).path ?? [], request);
    if (blocked) return blocked;
    const handlers = neonAuth().handler() as Record<Method, (req: Request, c: Ctx) => Promise<Response>>;
    return handlers[method](request, ctx);
  };
}

export const GET = run("GET");
export const POST = run("POST");
export const PUT = run("PUT");
export const PATCH = run("PATCH");
export const DELETE = run("DELETE");
