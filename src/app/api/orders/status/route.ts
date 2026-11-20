import { attributionFromCookieHeader } from "@/lib/attribution";
import { getSessionContext } from "@/lib/auth";
import { claimPurchaseConversion } from "@/lib/conversions-server";
import { memberRead } from "@/lib/db/member-read";

/** Polled by /app/thanks until the webhook has written the order. Access is never granted here. */
export async function GET(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return Response.json({ error: "session_id required" }, { status: 400 });

  let data: unknown;
  try {
    // The workspace filter is in the query itself, so the server fallback of memberRead can only
    // ever see an order of the session's own workspace.
    ({ data } = await memberRead("Order status", ctx.workspace.id, (db) =>
      db
        .from("orders")
        .select("id, product_key, status, ladder_seat, amount_cents, tax_cents, currency")
        .eq("stripe_checkout_session_id", sessionId)
        .eq("workspace_id", ctx.workspace.id)
        .maybeSingle(),
    ));
  } catch (e) {
    // A failed read is not "the order is not there yet"; the page keeps polling on a 503.
    console.error(`[api] order status: read failed (${e instanceof Error ? e.name : "unknown"})`);
    return Response.json({ error: "unavailable", message: "Could not load this right now. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  // The purchase conversion is reported once per order, whatever the browser does (reloads, tabs).
  const order = data as { id: string } | null;
  const first = order
    ? (await claimPurchaseConversion({ orderId: order.id, workspaceId: ctx.workspace.id, userId: ctx.user.id, cookie: attributionFromCookieHeader(request.headers.get("cookie")) }).catch(() => ({ first: false }))).first
    : false;
  return Response.json(
    data ? { ready: true, order: data, first } : { ready: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
