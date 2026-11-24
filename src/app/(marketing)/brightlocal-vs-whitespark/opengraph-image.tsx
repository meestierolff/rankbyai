import { OG_SIZE, ogVersusCard } from "@/lib/og";
import { seoPage } from "@/lib/seo-pages";

const page = seoPage("/brightlocal-vs-whitespark")!;

export const alt = page.h1;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogVersusCard({ eyebrow: page.eyebrow, ...page.og! });
}
