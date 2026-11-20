import { OG_SIZE, ogCard } from "@/lib/og";
import { seoPage } from "@/lib/seo-pages";

const page = seoPage("/alternatives/otterly")!;

export const alt = page.h1;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ eyebrow: page.eyebrow, title: page.h1 });
}
