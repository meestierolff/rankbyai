import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Google Consent Mode v2 as loaded by components/analytics/google-tags.ts, with a stubbed browser.
 * Simulates an EEA visitor: nothing loads before consent, analytics consent never grants ad signals.
 */
type Cmd = unknown[];
let appended: { src: string }[];
let win: { dataLayer?: IArguments[] };

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-TEST123";
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "AW-TEST456";
  appended = [];
  win = {};
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { createElement: () => ({ src: "", async: false }), head: { appendChild: (s: { src: string }) => appended.push(s) } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  delete process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
});

const commands = (): Cmd[] => (win.dataLayer ?? []).map((a) => Array.from(a));

describe("Google tags under Consent Mode v2", () => {
  it("EEA, undecided or denied: no tag is loaded and nothing is queued", async () => {
    const { applyGoogleConsent } = await import("@/components/analytics/google-tags");
    applyGoogleConsent({ analytics: false, ads: false });
    expect(appended).toEqual([]);
    expect(win.dataLayer).toBeUndefined();
  });

  it("analytics allowed only: consent default first, ad signals denied, GA configured, Ads not", async () => {
    const { applyGoogleConsent } = await import("@/components/analytics/google-tags");
    applyGoogleConsent({ analytics: true, ads: false });
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toContain("googletagmanager.com/gtag/js?id=G-TEST123");
    const cmds = commands();
    expect(cmds[0]).toEqual(["consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", wait_for_update: 500 }]);
    expect(cmds).toContainEqual(["config", "G-TEST123"]);
    expect(cmds.some((c) => c[0] === "config" && c[1] === "AW-TEST456")).toBe(false);
  });

  it("advertising allowed later: consent update granted and the Ads tag configured once", async () => {
    const { applyGoogleConsent } = await import("@/components/analytics/google-tags");
    applyGoogleConsent({ analytics: true, ads: false });
    applyGoogleConsent({ analytics: true, ads: true });
    applyGoogleConsent({ analytics: true, ads: true });
    const cmds = commands();
    expect(cmds).toContainEqual(["consent", "update", { analytics_storage: "granted", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" }]);
    expect(cmds.filter((c) => c[0] === "config" && c[1] === "AW-TEST456")).toHaveLength(1);
    expect(appended).toHaveLength(1);
  });

  it("withdrawing consent sends a denied update", async () => {
    const { applyGoogleConsent } = await import("@/components/analytics/google-tags");
    applyGoogleConsent({ analytics: true, ads: true });
    applyGoogleConsent({ analytics: false, ads: false });
    expect(commands()).toContainEqual(["consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
  });
});
