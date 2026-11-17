import { fetchOfferFresh } from "@/lib/offer";

/** Public JSON of the live ladder. Same-origin only (no CORS headers), cached 5 s at the edge. */
export async function GET() {
  const result = await fetchOfferFresh();
  if (!result.available) {
    return Response.json(
      { error: "offer_unavailable", reason: result.reason },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { ...result.offer, paidTotal: result.paidTotal },
    { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } },
  );
}
