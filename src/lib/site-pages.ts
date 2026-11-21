import { SEO_PAGES } from "@/lib/seo-pages";

/** Public, indexable static pages. One list feeds the sitemap and llms.txt. `updated` is the real last-edit date. */
export const STATIC_PAGES: { path: string; title: string; updated: string; inLlms?: boolean }[] = [
  { path: "/", title: "RankbyAI: AI visibility software you pay for once", updated: "2026-11-17", inLlms: true },
  { path: "/terms", title: "Terms", updated: "2026-11-20", inLlms: true },
  { path: "/privacy", title: "Privacy", updated: "2026-11-20", inLlms: true },
  { path: "/refunds", title: "Refund policy", updated: "2026-11-17", inLlms: true },
  { path: "/disclaimer", title: "Disclaimer", updated: "2026-11-21", inLlms: true },
  { path: "/removal", title: "Removal or correction request", updated: "2026-11-17" },
  { path: "/support", title: "Support", updated: "2026-11-20", inLlms: true },
  { path: "/docs/api", title: "API and MCP documentation", updated: "2026-11-20", inLlms: true },
  { path: "/ai", title: "AI visibility by city", updated: "2026-11-17", inLlms: true },
  { path: "/pricing", title: "Pricing: pay once, scans at cost", updated: "2026-11-17", inLlms: true },
  ...SEO_PAGES.map((p) => ({ path: p.path, title: p.h1, updated: p.updated, inLlms: true })),
];
