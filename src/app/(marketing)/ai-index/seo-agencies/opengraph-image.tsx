import { ogCard, OG_SIZE } from "@/lib/og";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "SEO Agency AI Index: one ChatGPT run in 387 cities, 23 November 2026. A snapshot, not a ranking.";
export default function Image() {
  return ogCard({ eyebrow: "SEO Agency AI Index · 23 Nov 2026", title: "What ChatGPT named in 387 cities", footer: "One run per city · A snapshot, not a ranking" });
}
