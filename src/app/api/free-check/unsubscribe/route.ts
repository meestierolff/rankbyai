import { z } from "zod";
import { withdrawEmail } from "@/lib/free-check-public";

const Body = z.object({ token: z.string().max(100) });

/** Deletes the address a free-check result was emailed to (the link in that email leads here via a button). */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400, headers });
  const removed = await withdrawEmail(parsed.data.token).catch(() => null);
  if (removed === null) return Response.json({ error: "unavailable", message: "Try again in a minute." }, { status: 503, headers });
  // Same answer whether or not the token matched: nothing about other addresses is revealed.
  return Response.json({ ok: true }, { headers });
}
