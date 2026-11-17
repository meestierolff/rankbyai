/** Grid geometry (brief 6.1). Row 0 is the northern edge; the centre is the business location. */
export interface GridPoint {
  idx: number;
  row: number;
  col: number;
  lat: number;
  lng: number;
}

const MILES_PER_DEG_LAT = 69;

export function buildGrid(center: { lat: number; lng: number }, n: number, radiusMiles: number): GridPoint[] {
  if (n === 1) return [{ idx: 0, row: 0, col: 0, lat: center.lat, lng: center.lng }];
  const c = (n - 1) / 2;
  const spacing = (2 * radiusMiles) / (n - 1);
  const milesPerDegLng = MILES_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const points: GridPoint[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      points.push({
        idx: row * n + col,
        row,
        col,
        lat: round7(center.lat + ((c - row) * spacing) / MILES_PER_DEG_LAT),
        lng: round7(center.lng + ((col - c) * spacing) / milesPerDegLng),
      });
    }
  }
  return points;
}

const round7 = (v: number) => Math.round(v * 1e7) / 1e7;

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * MILES_PER_DEG_LAT;
  const dLng = (b.lng - a.lng) * MILES_PER_DEG_LAT * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

const DIRS = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"];
export function bearingWord(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  const dy = to.lat - from.lat;
  const dx = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  return DIRS[Math.round((((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360) / 45) % 8];
}

export const pointName = (row: number, col: number) => `${String.fromCharCode(65 + row)}${col + 1}`;
