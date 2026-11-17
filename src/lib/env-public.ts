/**
 * Public (browser-safe) configuration. This is the ONLY env module client components may import;
 * lib/env.ts is server-only so variable names and validation never reach the browser bundle.
 */
// NEXT_PUBLIC_* must be referenced statically so Next can inline them in client bundles.
export const publicEnv = {
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "https://rankbyai.live").replace(/\/$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
};
