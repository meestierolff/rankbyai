"use client";

import { ATTRIBUTION_COOKIE, ATTRIBUTION_DAYS, CLICK_KEYS, fromSearch, limitToConsent, parseAttribution, type Attribution } from "@/lib/attribution";

/**
 * Reads the landing page's campaign parameters into memory once, and writes them to the first-party
 * `rb_attr` cookie only as far as consent allows. Without any consent nothing is written, and an
 * existing cookie is removed. Signup and purchase read the cookie on the server (lib/attribution).
 */
let landing: Attribution | null = null;
let captured = false;

export function captureLanding() {
  if (captured || typeof window === "undefined") return;
  captured = true;
  landing = fromSearch(window.location.search, window.location.pathname, new Date());
}

function readCookie(): Attribution | null {
  const part = document.cookie.split("; ").find((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`));
  if (!part) return null;
  try {
    return parseAttribution(decodeURIComponent(part.slice(ATTRIBUTION_COOKIE.length + 1)));
  } catch {
    return null;
  }
}

const secure = () => (window.location.protocol === "https:" ? "; Secure" : "");
const remove = () => { document.cookie = `${ATTRIBUTION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure()}`; };

export function persistAttribution(consent: { analytics: boolean; ads: boolean }) {
  if (typeof document === "undefined") return;
  const existing = readCookie();
  // First touch wins; click ids from this landing are added when consent for them arrives later.
  let next = existing ? limitToConsent(existing, consent) : landing ? limitToConsent(landing, consent) : null;
  if (next && existing && landing && consent.ads && !CLICK_KEYS.some((k) => next![k])) {
    const clicks = limitToConsent(landing, { analytics: false, ads: true });
    if (clicks) next = { ...next, ...Object.fromEntries(CLICK_KEYS.filter((k) => clicks[k]).map((k) => [k, clicks[k]])) };
  }
  if (!next) {
    if (existing) remove();
    return;
  }
  if (JSON.stringify(next) === JSON.stringify(existing)) return;
  document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; Path=/; Max-Age=${ATTRIBUTION_DAYS * 86_400}; SameSite=Lax${secure()}`;
}
