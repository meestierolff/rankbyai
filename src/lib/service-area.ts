/**
 * A service-area business on Google hides its street address: Google Maps data then has no address
 * for the listing, and its map point is only approximate (measured 19 Nov 2026 on a live Maps search:
 * those listings come back with address and every address part empty, but with coordinates).
 * True only for a business that came from a Google listing (it has a listing id) without an address.
 */
export const isServiceArea = (b: { cid?: string | null; address?: string | null }): boolean => !!b.cid && !String(b.address ?? "").trim();

export const SERVICE_AREA_NOTE = "No street address on the Google listing (a service-area business), so its map point is approximate. Check where the grid is centred before you scan.";
