import type { NextConfig } from "next";

/** [variant, canonical]. The canonical pages cover these phrasings in their text and FAQ (lib/seo-pages.ts). */
const CLOSE_VARIANTS: [string, string][] = [
  ["/ai-visibility-tool", "/ai-visibility-tracker"],
  ["/ai-visibility-tools", "/ai-visibility-tracker"],
  ["/ai-visibility-software", "/ai-visibility-tracker"],
  ["/chatgpt-rank-tracker", "/ai-rank-tracker"],
  ["/chatgpt-visibility-tracker", "/ai-rank-tracker"],
  ["/google-maps-rank-tracker", "/map-rank-tracker"],
  ["/local-rank-trackers", "/local-rank-tracker"],
  ["/local-seo-rank-tracker", "/local-rank-tracker"],
  ["/google-local-rank-tracker", "/local-rank-tracker"],
  ["/rank-tracker-local", "/local-rank-tracker"],
  ["/brightlocal-vs-local-falcon", "/local-falcon-vs-brightlocal"],
  ["/profound-vs-peec-ai", "/peec-ai-vs-profound"],
  ["/alternatives/local-falcon-alternatives", "/alternatives/local-falcon"],
  ["/alternatives/brightlocal-alternatives", "/alternatives/brightlocal"],
  ["/alternatives/peec", "/alternatives/peec-ai"],
  ["/alternatives/otterly-ai", "/alternatives/otterly"],
  ["/blog/local-falcon-price", "/blog/local-falcon-pricing"],
  ["/blog/local-falcon-cost", "/blog/local-falcon-pricing"],
  ["/blog/local-falcon-plans", "/blog/local-falcon-pricing"],
  ["/blog/brightlocal-price", "/blog/brightlocal-pricing"],
  ["/blog/peec-ai-price", "/blog/peec-ai-pricing"],
  ["/blog/profound-price", "/blog/profound-pricing"],
  ["/blog/otterly-price", "/blog/otterly-pricing"],
  ["/semrush-ai-visibility-toolkit", "/semrush-ai-visibility"],
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // One id per deployment: a tab still on the previous version that navigates gets a full reload onto
  // the new one instead of an error (Next.js version-skew handling; Vercel sets VERCEL_DEPLOYMENT_ID).
  ...(process.env.VERCEL_DEPLOYMENT_ID ? { deploymentId: process.env.VERCEL_DEPLOYMENT_ID } : {}),
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The OAuth consent page must never be framed (clickjacking an "Allow" click), and the code it
  // sends a browser on with must not leak through a Referer header.
  headers: async () => [
    {
      source: "/oauth/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    },
  ],
  // Old and guessed addresses of the API documentation. The in-app reference is /app/api/reference.
  redirects: async () => [
    { source: "/api/reference", destination: "/docs/api", permanent: true },
    { source: "/docs", destination: "/docs/api", permanent: true },
    // Close variants of a search page: one canonical URL per intent, the variants answer 301.
    ...CLOSE_VARIANTS.map(([source, destination]) => ({ source, destination, statusCode: 301 as const })),
  ],
};

export default nextConfig;
