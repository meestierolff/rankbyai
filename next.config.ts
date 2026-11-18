import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
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
