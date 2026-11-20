import { z } from "zod";
import { attributionFromCookieHeader } from "@/lib/attribution";
import { getSessionContext } from "@/lib/auth";
import { claimPurchaseConversion } from "@/lib/conversions-server";

const Body = z.object({ order_id: z.uuid() });

/**
 * Called by /app/thanks once the order is ready. `first` is true exactly once per order (a
 * conditional UPDATE), so the purchase is reported once whatever the browser does; the order must
 * belong to the caller's workspace. A POST, so the write is never triggered by a cross-site GET; the
 * session cookie is SameSite=Lax, so a cross-site POST arrives without it and is refused.
 */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const ctx = await getSessionContext();
  if (!ctx) return Response.json({ first: false }, { status: 401, headers });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ first: false }, { status: 400, headers });
  const result = await claimPurchaseConversion({
    orderId: parsed.data.order_id, workspaceId: ctx.workspace.id, userId: ctx.user.id, cookie: attributionFromCookieHeader(request.headers.get("cookie")),
  }).catch(() => ({ first: false }));
  return Response.json(result, { headers });
}
