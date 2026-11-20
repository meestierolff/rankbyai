import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/** Allow everything public, including AI crawlers. Keep the app, API, share links and admin out. */
export default function robots(): MetadataRoute.Robots {
  const disallow = ["/app", "/api/", "/r/", "/admin", "/auth/", "/free-check/"];
  const aiBots = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "PerplexityBot", "Perplexity-User", "Google-Extended", "ClaudeBot", "Claude-User", "Claude-SearchBot"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      ...aiBots.map((userAgent) => ({ userAgent, allow: ["/", "/llms.txt"], disallow })),
    ],
    sitemap: `${publicEnv.siteUrl}/sitemap.xml`,
    host: publicEnv.siteUrl,
  };
}
