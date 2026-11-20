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

/** The attribution parameters in a URL's query, or null when it has none. */
export function fromSearch(search: string, path: string, now: Date): Attribution | null {
  const q = new URLSearchParams(search);
  const out: Attribution = {};
  for (const k of [...UTM_KEYS, ...CLICK_KEYS]) {
    const v = q.get(k)?.trim();
    if (v && VALUE.test(v)) out[k] = v;
  }
  if (!Object.keys(out).length) return null;
  return { ...out, landing_path: path.slice(0, 200), first_seen: now.toISOString() };
}

/** Keeps only what the visitor's consent allows. */
export function limitToConsent(a: Attribution, consent: { analytics: boolean; ads: boolean }): Attribution | null {
  const out: Attribution = {};
  if (consent.analytics) for (const k of UTM_KEYS) if (a[k]) out[k] = a[k];
  if (consent.ads) for (const k of CLICK_KEYS) if (a[k]) out[k] = a[k];
  if (!Object.keys(out).length) return null;
  return { ...out, landing_path: a.landing_path, first_seen: a.first_seen };
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
    if (typeof obj.landing_path === "string" && obj.landing_path.startsWith("/") && obj.landing_path.length <= 200) out.landing_path = obj.landing_path;
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
