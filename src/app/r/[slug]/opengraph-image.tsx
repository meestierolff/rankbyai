import { OG_SIZE } from "@/components/report/og-card";
import { reportPreviewImage } from "./preview-image";

export const alt = "AI visibility report: where AI assistants and Google Maps name the business";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image({ params }: { params: Promise<{ slug: string }> }) {
  return reportPreviewImage(params);
}
