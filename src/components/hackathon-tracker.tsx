/**
 * Ship or Die hackathon traffic tracker, as the hackathon asks: a script tag with the site key in
 * the page's <head>. React moves an `async` script rendered anywhere into <head>, and it is in the
 * server HTML, which is where the hackathon looks for it.
 *
 * Production only, so previews and local runs never count as traffic.
 *
 * Rendered by the marketing, sign-in and app layouts, never on shared report links (/r/…). The
 * script sends each page's path to the hackathon, and a report's path is the key that opens it.
 * Every link to a report opens a new page (new tab or full navigation), so the script's history
 * hooks never see a report path either. Disclosed on /privacy and /disclaimer.
 *
 * What the script does (read 20 Nov 2026): no cookies or stored identifiers; skips browsers that
 * send Global Privacy Control; posts the path, the referrer's origin, utm_source/utm_medium and
 * whether the visit came from an ad click.
 */
export const HACKATHON_TRACKER = {
  src: "https://www.ship-or-die.com/hackathon/verify.js",
  site: "3885aeafebda9561011078b8184b8e6faa2bd7e3",
} as const;

export function HackathonTracker() {
  if (process.env.VERCEL_ENV !== "production") return null;
  return <script async src={HACKATHON_TRACKER.src} data-site={HACKATHON_TRACKER.site} />;
}
