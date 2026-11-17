/** Public, indexable static pages. One list feeds the sitemap and llms.txt. `updated` is the real last-edit date. */
export const STATIC_PAGES: { path: string; title: string; updated: string; inLlms?: boolean }[] = [
  { path: "/", title: "RankbyAI: AI visibility software you pay for once", updated: "2026-11-17", inLlms: true },
  { path: "/terms", title: "Terms", updated: "2026-11-17", inLlms: true },
  { path: "/privacy", title: "Privacy", updated: "2026-11-17", inLlms: true },
  { path: "/refunds", title: "Refund policy", updated: "2026-11-17", inLlms: true },
  { path: "/disclaimer", title: "Disclaimer", updated: "2026-11-17", inLlms: true },
  { path: "/removal", title: "Removal or correction request", updated: "2026-11-17" },
  { path: "/docs/api", title: "API and MCP documentation", updated: "2026-11-17", inLlms: true },
  { path: "/ai", title: "AI visibility by city", updated: "2026-11-17", inLlms: true },
];
