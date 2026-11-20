"use client";

import { publicEnv } from "@/lib/env-public";

/**
 * GA4 and Google Ads, with Google Consent Mode v2 (basic implementation).
 *
 *  - Nothing loads unless NEXT_PUBLIC_GA_MEASUREMENT_ID or NEXT_PUBLIC_GOOGLE_ADS_ID is set.
 *  - Nothing loads, and no request goes to Google, until the visitor's consent allows the tag
 *    (lib/consent: asked first in the EEA, UK and Switzerland). Then the consent default is set
 *    BEFORE the tag's first command, with the four v2 signals:
 *      analytics_storage                                ← analytics consent
 *      ad_storage, ad_user_data, ad_personalization     ← advertising consent
 *  - A later change (Cookie choices) sends `consent update`; the Ads tag is configured only once
 *    advertising consent exists.
 */
type Gtag = (...args: unknown[]) => void;
type Win = { dataLayer?: unknown[]; gtag?: Gtag };

let started = false;
let adsConfigured = false;
let gaConfigured = false;

export const googleTagsConfigured = () => !!(publicEnv.gaMeasurementId || publicEnv.googleAdsId);

const v = (b: boolean) => (b ? "granted" : "denied");
export const consentSignals = (a: { analytics: boolean; ads: boolean }) => ({
  analytics_storage: v(a.analytics), ad_storage: v(a.ads), ad_user_data: v(a.ads), ad_personalization: v(a.ads),
});

export function applyGoogleConsent(a: { analytics: boolean; ads: boolean }) {
  if (!googleTagsConfigured() || typeof window === "undefined") return;
  const win = window as unknown as Win;
  const ga = publicEnv.gaMeasurementId;
  const ads = publicEnv.googleAdsId;
  const wanted = (a.analytics && !!ga) || (a.ads && !!ads);

  if (!started) {
    if (!wanted) return; // basic consent mode: no tag, no cookieless pings
    win.dataLayer = win.dataLayer || [];
    // gtag pushes the `arguments` object itself (Google's snippet); an array would not be read.
    win.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      win.dataLayer!.push(arguments);
    };
    win.gtag("consent", "default", { ...consentSignals(a), wait_for_update: 500 });
    win.gtag("set", "ads_data_redaction", !a.ads);
    win.gtag("js", new Date());
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga || ads)}`;
    document.head.appendChild(s);
    started = true;
  } else {
    win.gtag?.("consent", "update", consentSignals(a));
    win.gtag?.("set", "ads_data_redaction", !a.ads);
  }
  // Each product is configured once, and only when its own consent exists.
  if (ga && a.analytics && !gaConfigured) {
    win.gtag?.("config", ga);
    gaConfigured = true;
  }
  if (ads && a.ads && !adsConfigured) {
    win.gtag?.("config", ads);
    adsConfigured = true;
  }
}
