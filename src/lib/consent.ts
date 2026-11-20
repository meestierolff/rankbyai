"use client";

/**
 * The visitor's cookie choices, shared by PostHog, the Google tags and campaign attribution.
 *
 * Two separate decisions, both stored in localStorage on this site only:
 *  - rb_consent      "granted" | "denied": an analytics cookie (the original banner's question).
 *  - rb_consent_ads  "granted" | "denied": advertising measurement (Google Ads conversions, click ids).
 * An earlier "Allow" on the analytics question is never read as consent to advertising.
 *
 * Where consent is asked (EEA, UK, Switzerland: same rule as before, by time zone with the browser
 * language region as fallback), nothing optional is stored or loaded until the visitor says yes.
 * Elsewhere both default to allowed, and a "no" given through "Cookie choices" is respected.
 */
export const CONSENT_KEY = "rb_consent";
export const ADS_CONSENT_KEY = "rb_consent_ads";
export const CONSENT_EVENT = "rb:consent";
export const CONSENT_OPEN_EVENT = "rb:consent-open";

export type Choice = "granted" | "denied" | null;
export interface ConsentState {
  /** True where the banner must ask first. */
  required: boolean;
  analytics: Choice;
  ads: Choice;
}

export const EU_LANG_REGIONS = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","IS","LI","NO","GB","CH"]);

/** EU/EEA/UK/CH visitors are asked first: time zone, with browser language region as a fallback. */
export function consentRequired(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("Europe/") || tz === "Atlantic/Reykjavik" || tz === "Atlantic/Canary" || tz === "Atlantic/Madeira") return true;
    return (navigator.languages || []).some((l) => EU_LANG_REGIONS.has((l.split("-")[1] || "").toUpperCase()));
  } catch {
    return true;
  }
}

const read = (key: string): Choice => {
  try {
    const v = localStorage.getItem(key);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
};

export function readConsent(): ConsentState {
  return { required: consentRequired(), analytics: read(CONSENT_KEY), ads: read(ADS_CONSENT_KEY) };
}

/** What may run now. Pure, so the rule is unit-tested (tests/unit/consent.test.ts). */
export function allowed(s: ConsentState): { analytics: boolean; ads: boolean } {
  return {
    analytics: s.required ? s.analytics === "granted" : s.analytics !== "denied",
    ads: s.required ? s.ads === "granted" : s.ads !== "denied",
  };
}

export function saveConsent(choice: { analytics?: Exclude<Choice, null>; ads?: Exclude<Choice, null> }) {
  try {
    if (choice.analytics) localStorage.setItem(CONSENT_KEY, choice.analytics);
    if (choice.ads) localStorage.setItem(ADS_CONSENT_KEY, choice.ads);
  } catch {}
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
}

/** Opens the banner again (the "Cookie choices" link in the footer). */
export function openConsentChoices() {
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
}
