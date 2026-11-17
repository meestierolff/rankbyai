import { getSessionContext } from "@/lib/auth";
import { currentUserDb } from "@/lib/db/session";

/** Polled by /app/thanks until the webhook has written the order. Access is never granted here. */
export async function GET(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return Response.json({ error: "session_id required" }, { status: 400 });

  const supabase = await currentUserDb();
  const { data } = await supabase
    .from("orders")
    .select("id, product_key, status, ladder_seat, amount_cents")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  return Response.json(
    data ? { ready: true, order: data } : { ready: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
