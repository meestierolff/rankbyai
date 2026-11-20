/**
 * Campaign attribution: utm_* and Google click ids from the first landing. Shared rules for the
 * browser (lib/attribution-client) and the server (signup and purchase read the cookie).
 *
 * Stored only as far as consent allows: UTM parameters with analytics consent, click ids (gclid,
 * gbraid, wbraid: advertising identifiers) only with advertising consent. First touch wins: a later
 * visit with other parameters does not overwrite it. Pure; no PII.
 */
export const ATTRIBUTION_COOKIE = "rb_attr";
export const ATTRIBUTION_DAYS = 90;
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export const CLICK_KEYS = ["gclid", "gbraid", "wbraid"] as const;
type Key = (typeof UTM_KEYS)[number] | (typeof CLICK_KEYS)[number];

export type Attribution = Partial<Record<Key, string>> & { landing_path?: string; first_seen?: string };

const VALUE = /^[\w.~:@%+\-/ |]{1,200}$/;
/** A plain same-site path: one leading slash, no "//", no markup or query characters. */
const PATH = /^\/(?!\/)[\w\-/.~]{0,199}$/;

/**
 * The landing path, safe to keep: a report address (/r/{slug}) is an access key and is never stored,
 * and anything that is not a plain path is dropped.
 */
export function safeLandingPath(path: string): string | undefined {
  if (/^\/r(\/|$)/.test(path)) return "/r/[report]";
  return PATH.test(path) ? path : undefined;
}

/** The attribution parameters in a URL's query, or null when it has none. */
export function fromSearch(search: string, path: string, now: Date): Attribution | null {
  const q = new URLSearchParams(search);
  const out: Attribution = {};
  for (const k of [...UTM_KEYS, ...CLICK_KEYS]) {
    const v = q.get(k)?.trim();
    if (v && VALUE.test(v)) out[k] = v;
  }
  if (!Object.keys(out).length) return null;
  const landing = safeLandingPath(path);
  return { ...out, ...(landing ? { landing_path: landing } : {}), first_seen: now.toISOString() };
}

/** Keeps only what the visitor's consent allows. */
export function limitToConsent(a: Attribution, consent: { analytics: boolean; ads: boolean }): Attribution | null {
  const out: Attribution = {};
  if (consent.analytics) for (const k of UTM_KEYS) if (a[k]) out[k] = a[k];
  if (consent.ads) for (const k of CLICK_KEYS) if (a[k]) out[k] = a[k];
  if (!Object.keys(out).length) return null;
  return { ...out, ...(a.landing_path ? { landing_path: a.landing_path } : {}), ...(a.first_seen ? { first_seen: a.first_seen } : {}) };
}

/** Parses the cookie value strictly: unknown keys and odd values are dropped. */
export function parseAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw.length > 2000 ? "" : raw) as Record<string, unknown>;
    const out: Attribution = {};
    for (const k of [...UTM_KEYS, ...CLICK_KEYS]) {
      const v = obj[k];
      if (typeof v === "string" && VALUE.test(v)) out[k] = v;
    }
    if (!Object.keys(out).length) return null;
    const landing = typeof obj.landing_path === "string" ? safeLandingPath(obj.landing_path) : undefined;
    if (landing) out.landing_path = landing;
    if (typeof obj.first_seen === "string" && !Number.isNaN(Date.parse(obj.first_seen))) out.first_seen = obj.first_seen;
    return out;
  } catch {
    return null;
  }
}

/** The attribution cookie from a request's Cookie header (server side), parsed strictly. */
export function attributionFromCookieHeader(header: string | null | undefined): Attribution | null {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== ATTRIBUTION_COOKIE) continue;
    try {
      return parseAttribution(decodeURIComponent(part.slice(eq + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}
