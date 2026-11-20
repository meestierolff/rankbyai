import { CHECK_COOKIE, readCookie, runPublicCheck } from "@/lib/free-check-public";

export const maxDuration = 300;

/**
 * Runs the free check held in this browser's cookie (no account). Idempotent: a finished check
 * answers ok, a running one answers 409 `running` so the page asks again. Every limit and the budget
 * claim live in runPublicCheck; nothing here trusts the request body.
 */
export async function POST(request: Request) {
  const result = await runPublicCheck(readCookie(request.headers.get("cookie"), CHECK_COOKIE)).catch(() => null);
  const headers = { "Cache-Control": "no-store" };
  if (!result) return Response.json({ error: "unavailable", message: "Free checks are not available right now. Try again later." }, { status: 503, headers });
  if (result.ok) return Response.json({ ok: true }, { headers });
  return Response.json({ error: result.error, message: result.message, running: result.running ?? false, waiting: result.waiting ?? false }, { status: result.status, headers });
}
