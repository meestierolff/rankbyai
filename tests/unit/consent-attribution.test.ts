import { describe, expect, it } from "vitest";
import { consentSignals } from "@/components/analytics/google-tags";
import { attributionFromCookieHeader, fromSearch, limitToConsent, parseAttribution } from "@/lib/attribution";
import { allowed } from "@/lib/consent";

describe("consent", () => {
  it("where consent is asked, nothing optional runs until the visitor says yes, and each purpose separately", () => {
    expect(allowed({ required: true, analytics: null, ads: null })).toEqual({ analytics: false, ads: false });
    expect(allowed({ required: true, analytics: "granted", ads: null })).toEqual({ analytics: true, ads: false });
    expect(allowed({ required: true, analytics: "denied", ads: "granted" })).toEqual({ analytics: false, ads: true });
  });

  it("elsewhere both default to allowed, and a no is respected", () => {
    expect(allowed({ required: false, analytics: null, ads: null })).toEqual({ analytics: true, ads: true });
    expect(allowed({ required: false, analytics: "denied", ads: "denied" })).toEqual({ analytics: false, ads: false });
  });

  it("maps to the four Consent Mode v2 signals: analytics to analytics_storage, advertising to the three ad signals", () => {
    expect(consentSignals({ analytics: true, ads: false })).toEqual({ analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    expect(consentSignals({ analytics: false, ads: true })).toEqual({ analytics_storage: "denied", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" });
  });
});

describe("attribution", () => {
  const now = new Date("2026-11-20T12:00:00Z");

  it("reads utm parameters and Google click ids from the landing URL", () => {
    expect(fromSearch("?utm_source=google&utm_medium=cpc&utm_campaign=local-rank&gclid=Cj0KCQ-abc_123&x=1", "/local-rank-tracker", now)).toEqual({
      utm_source: "google", utm_medium: "cpc", utm_campaign: "local-rank", gclid: "Cj0KCQ-abc_123", landing_path: "/local-rank-tracker", first_seen: now.toISOString(),
    });
    expect(fromSearch("?ref=nothing", "/", now)).toBeNull();
    expect(fromSearch("?utm_source=<script>", "/", now)).toBeNull();
  });

  it("keeps UTMs only with analytics consent and click ids only with advertising consent", () => {
    const a = fromSearch("?utm_source=google&gclid=abc&wbraid=w1", "/", now)!;
    expect(limitToConsent(a, { analytics: true, ads: false })).toMatchObject({ utm_source: "google" });
    expect(limitToConsent(a, { analytics: true, ads: false })?.gclid).toBeUndefined();
    expect(limitToConsent(a, { analytics: false, ads: true })).toMatchObject({ gclid: "abc", wbraid: "w1" });
    expect(limitToConsent(a, { analytics: false, ads: false })).toBeNull();
  });

  it("parses the cookie strictly on the server", () => {
    const cookie = `other=1; rb_attr=${encodeURIComponent(JSON.stringify({ utm_source: "google", gclid: "abc", evil: "x", landing_path: "/pricing", first_seen: now.toISOString() }))}`;
    expect(attributionFromCookieHeader(cookie)).toEqual({ utm_source: "google", gclid: "abc", landing_path: "/pricing", first_seen: now.toISOString() });
    expect(parseAttribution("{not json")).toBeNull();
    expect(parseAttribution(JSON.stringify({ landing_path: "https://evil.example" }))).toBeNull();
    expect(attributionFromCookieHeader("a=b")).toBeNull();
  });
});
