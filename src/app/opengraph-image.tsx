import { OG_SIZE, ogCard } from "@/lib/og";

export const alt = "RankbyAI: AI visibility software you pay for once";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ eyebrow: "AI visibility + Google Maps grid", title: "AI visibility software you pay for once." });
}
