import { AI_INDEX_PUBLIC } from "./config";
import { stats, coverageLine, percent } from "./findings";
import rawSnapshot from "../../../data/ai-index/index-2026-11.json";

import { snapshotSchema } from "./validate";

import { INDEX_PATH } from "./paths";
import type { IndexCity } from "./model";
export { INDEX_PATH } from "./paths";
export { COUNTRIES, cityPath, webUrl, type Country, type Agency, type IndexCity } from "./model";
const snapshot = snapshotSchema.parse(rawSnapshot);

export const INDEX_URL = `https://rankbyai.live${INDEX_PATH}`;
export const INDEX_TITLE = `ChatGPT SEO Agency Index: ${stats.total} Cities, 23 Nov 2026 | RankbyAI`;
export const INDEX_DESCRIPTION = `One ChatGPT run per city, 23 November 2026, in ${stats.total} US, UK, Australian and New Zealand cities. A snapshot with the method, not a ranking. Request a correction.`;
export const INDEX_H1 = `What ChatGPT named for “best SEO agency in {city}” across ${stats.total} cities`;
export const ENTITY_LINE = `RankbyAI (rankbyai.live) is pay-once AI visibility and local SEO software made by Mees Tierolff. The SEO Agency AI Index is a one-run snapshot of ChatGPT answers to the prompt “best SEO agency in {city}”, collected on 23 November 2026 for ${stats.total} cities in the United States, the United Kingdom, Australia and New Zealand. It is not a ranking, and it is not affiliated with Clutch, Expertise.com, The Manifest, or the agencies named in the answers.`;
export const OPENING = `On 23 November 2026 we asked ChatGPT “best SEO agency in {city}” once in each of ${stats.total} cities in the US, the UK, Australia and New Zealand. ${stats.parsed} answers produced a shortlist we could parse; ${stats.unparseable} we marked unparseable rather than guess. Across the ${stats.parsed}, ChatGPT named ${stats.mean.toFixed(2)} agencies on average (median ${stats.median}). This is one run, on one day. Answers vary, so it is a snapshot, not a ranking.`;
export const cities: IndexCity[] = snapshot.cities;
// Missing source data must never silently produce an indexable empty directory.
export const indexReady = cities.length === 387 && cities.filter(c => c.status === "parsed").length === 336;
export const publishedAt: string | null = snapshot.publishedAt;
export const updatedAt: string | null = snapshot.updatedAt;
export const indexPublished = indexReady && AI_INDEX_PUBLIC;
export const findCity = (country: string, slug: string) => cities.find(c => c.country === country && c.slug === slug);

export const INDEX_FAQS = [
  { q: "Is this a ranking of SEO agencies?", a: "No. It is one ChatGPT answer per city, collected on 23 November 2026. Answers vary from run to run." },
  { q: "How many cities are in the snapshot?", a: `${stats.total} cities. ${coverageLine}. ${stats.parsed} have a parsed shortlist; ${stats.unparseable} were marked unparseable.` },
  { q: "Why are some cities missing a shortlist?", a: "Because the answer asked which place was meant, listed more than one city, or was clearly about another country. We did not guess." },
  { q: "Does a mention mean ChatGPT always recommends that agency?", a: "No. It means that name appeared in this one run." },
  { q: "Why do so many answers cite Clutch or Expertise.com?", a: `In this snapshot, Clutch appeared in ${stats.directories.Clutch} of ${stats.total} source lists (${percent(stats.directories.Clutch, stats.total)}) and Expertise.com in ${stats.directories["Expertise.com"]} (${percent(stats.directories["Expertise.com"], stats.total)}). That is a count of citations, not proof that a directory caused a mention. In Australia, those global directories were rare (${stats.countries.au.directories} of ${stats.countries.au.total} answers).` },
  { q: "Can I have a name corrected or removed?", a: "Yes. Email mees@rankbyai.live with the city, the name as it appears, and what should change. We aim to handle requests within 7 days." },
  { q: "How is this different from RankbyAI’s /ai city pages?", a: "Those pages are built from repeated scans of a service niche (for example dentists in Austin) and are indexed when there are enough scans. This index is a one-day ChatGPT snapshot of SEO agencies." },
  { q: "Do you run this every day?", a: "No. This published set is the 23 November 2026 run. A free check is a new, current run for one business." },
];
