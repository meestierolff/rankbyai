import "server-only";
import { dbAdmin } from "@/lib/db/clients";
import { CENTRED_MILES, MAX_CENTRE_MILES, milesBetween, validCoord } from "@/lib/scans/grid";

export type LocationResult =
  | { ok: true; following: number }
  | { ok: false; status: number; error: string; message: string };

/**
 * Correct a business's map point. Schedules without a centre of their own follow the business, so
 * they use the new point from their next run; a schedule whose own centre sat on the old point (put
 * there for the business) moves with it. A grid the user deliberately moved elsewhere stays put.
 * `following` counts the schedules that now run on the new point.
 */
export async function setBusinessLocation(workspaceId: string, businessId: string, to: { lat: number; lng: number }): Promise<LocationResult> {
  if (!validCoord(to)) return { ok: false, status: 400, error: "invalid_location", message: "That is not a valid map point." };
  const admin = dbAdmin();
  const { data: b } = await admin.from("businesses").select("id, lat, lng").eq("id", businessId).eq("workspace_id", workspaceId).maybeSingle<{ id: string; lat: number | null; lng: number | null }>();
  if (!b) return { ok: false, status: 404, error: "not_found", message: "Unknown business." };
  const old = b.lat != null && b.lng != null ? { lat: Number(b.lat), lng: Number(b.lng) } : null;
  const { error } = await admin.from("businesses").update({ lat: to.lat, lng: to.lng, updated_at: new Date().toISOString() }).eq("id", businessId).eq("workspace_id", workspaceId);
  if (error) return { ok: false, status: 500, error: "server_error", message: "The location could not be saved." };

  let moved = 0;
  if (old) {
    const { data: own } = await admin.from("tracked_queries").select("id, center_lat, center_lng").eq("workspace_id", workspaceId).eq("business_id", businessId).not("center_lat", "is", null);
    for (const t of (own ?? []) as { id: string; center_lat: number; center_lng: number }[]) {
      if (milesBetween({ lat: t.center_lat, lng: t.center_lng }, old) > CENTRED_MILES) continue;
      const { error: e } = await admin.from("tracked_queries").update({ center_lat: to.lat, center_lng: to.lng }).eq("id", t.id).eq("workspace_id", workspaceId);
      if (!e) moved++;
    }
  }
  const { count } = await admin.from("tracked_queries").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("business_id", businessId).is("center_lat", null);
  return { ok: true, following: (count ?? 0) + moved };
}

/** How far a new point is from the old one, for the confirmation text (null without an old point). */
export function movedMiles(from: { lat: number | null; lng: number | null }, to: { lat: number; lng: number }): number | null {
  return from.lat != null && from.lng != null ? milesBetween({ lat: Number(from.lat), lng: Number(from.lng) }, to) : null;
}

export { MAX_CENTRE_MILES };
