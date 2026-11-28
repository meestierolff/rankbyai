import { AI_CITATION_GUIDE as guide } from "@/lib/ai-citation-guide";
import { OG_SIZE, ogCard } from "@/lib/og";

export const alt = guide.h1;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ eyebrow: guide.eyebrow, title: guide.socialTitle, footer: guide.socialFooter });
}
