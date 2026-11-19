import type { NextConfig } from "next";

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
  // Old and guessed addresses of the API documentation. The in-app reference is /app/api/reference.
  redirects: async () => [
    { source: "/api/reference", destination: "/docs/api", permanent: true },
    { source: "/docs", destination: "/docs/api", permanent: true },
  ],
};

export default nextConfig;
