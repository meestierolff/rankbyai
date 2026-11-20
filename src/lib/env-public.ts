/**
 * Public (browser-safe) configuration. This is the ONLY env module client components may import;
 * lib/env.ts is server-only so variable names and validation never reach the browser bundle.
 */
// NEXT_PUBLIC_* must be referenced statically so Next can inline them in client bundles.
// A preview deployment has no fixed address: it uses the one Vercel gives it, so share links, sign-in
// and checkout return to the preview and not to the live site.
const previewUrl = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" && process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : "";

export const publicEnv = {
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || previewUrl || "https://rankbyai.live").replace(/\/$/, ""),
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
  /**
   * Google tags (GA4 and Google Ads conversions). Empty = not loaded at all. When set, they load only
   * after the visitor's consent where consent is asked (components/analytics/google-tags.tsx).
   */
  gaMeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "",
  googleAdsId: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "",
  googleAdsLabels: {
    free_check_completed: process.env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_FREE_CHECK || "",
    sign_up: process.env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_SIGNUP || "",
    purchase: process.env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_PURCHASE || "",
  },
};
