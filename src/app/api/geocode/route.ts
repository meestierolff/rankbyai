import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { GeocodeError, geocode } from "@/lib/geocode";

/**
 * Per signed-in user, per server instance: enough for setting up grids, not for bulk lookups. Per
 * instance is enough at today's traffic; a shared counter is the step if that changes.
 */
const LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;
const recent = new Map<string, number[]>();

const Query = z.object({ q: z.string().trim().min(3).max(200), country: z.string().regex(/^[A-Za-z]{2}$/).optional() });

/** Address search for choosing a grid centre or correcting a business's map point. Signed in only. */
export async function GET(request: Request) {
  return withSession(async (ctx) => {
    const url = new URL(request.url);
    const parsed = Query.safeParse({ q: url.searchParams.get("q") ?? "", country: url.searchParams.get("country") || undefined });
    if (!parsed.success) return err(400, "invalid_query", "Type an address or place of at least 3 characters.");
    const now = Date.now();
    // Keep the table small: forget users with no search in the window.
    if (recent.size > 1000) for (const [k, ts] of recent) if (!ts.some((t) => now - t < WINDOW_MS)) recent.delete(k);
    const mine = (recent.get(ctx.user.id) ?? []).filter((t) => now - t < WINDOW_MS);
    if (mine.length >= LIMIT) return err(429, "too_many_searches", "Too many address searches. Wait a few minutes, or drag the map instead.");
    recent.set(ctx.user.id, [...mine, now]);
    try {
      const places = await geocode(parsed.data.q, parsed.data.country);
      return json({ places, attribution: "Search by Nominatim · © OpenStreetMap contributors" });
    } catch (e) {
      return err(502, "geocode_failed", e instanceof GeocodeError ? e.message : "The address search failed.");
    }
  });
}
