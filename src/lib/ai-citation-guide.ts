/**
 * The free "4-step AI visibility & citation workflow" pack: the page people reach from the reply to an
 * X post ("comment GRID"). It is deliberately NOT in lib/seo-pages.ts, so it stays out of the sitemap,
 * the footer and llms.txt, and carries noindex while `listed` is false. Making it a public guide is a
 * decision for the owner: set `listed: true` (index, follow) and, if wanted, add it to the registry.
 *
 * The teardown figures on the page come from four stored scans of one real business (26 and 27 Nov
 * 2026), kept anonymous on purpose: no business, city, competitor or coordinates appear here.
 */
export const AI_CITATION_GUIDE = {
  path: "/guides/ai-citation-workflow",
  listed: false,
  eyebrow: "Free pack for local SEO agencies",
  title: "4-Step AI Citation Workflow for Local SEO",
  h1: "The 4-step workflow to get cited in ChatGPT, Gemini and Perplexity",
  description:
    "10 local buyer prompts, a 4-step citation and backlink-gap workflow, and a real $0.66 teardown of a 2-mile vs a 15-mile grid. For local SEO agencies and freelancers.",
  socialTitle: "The 4-step workflow to get cited in ChatGPT, Gemini & Perplexity",
  socialFooter: "10 buyer prompts · the skill · a real $0.66 grid teardown",
  /** Last real edit, shown on the page. */
  updated: "2026-11-28",
} as const;
