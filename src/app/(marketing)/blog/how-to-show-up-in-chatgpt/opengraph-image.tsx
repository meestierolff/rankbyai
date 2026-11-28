import { OG_SIZE, ogCard } from "@/lib/og";
import { seoPage } from "@/lib/seo-pages";

const page = seoPage("/blog/how-to-show-up-in-chatgpt")!;

export const alt = page.h1;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ eyebrow: page.eyebrow, title: "How to rank in ChatGPT as a local business", footer: "Checklist + how to check from your own area" });
}
