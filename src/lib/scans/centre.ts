import { z } from "zod";

/**
 * Optional grid centre on scan and schedule requests: both coordinates or neither. Without it the
 * grid is centred on the business's map point.
 */
export const centreFields = {
  center_lat: z.number().min(-90).max(90).optional(),
  center_lng: z.number().min(-180).max(180).optional(),
};

export const centreBothOrNone = (b: { center_lat?: number; center_lng?: number }) => (b.center_lat == null) === (b.center_lng == null);
export const CENTRE_PAIR_MESSAGE = "Send center_lat and center_lng together, or neither.";

export const centreOf = (b: { center_lat?: number; center_lng?: number }): { lat: number; lng: number } | null =>
  b.center_lat != null && b.center_lng != null ? { lat: b.center_lat, lng: b.center_lng } : null;
