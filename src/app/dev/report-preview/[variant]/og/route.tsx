import { reportOgImage } from "@/components/report/og-card";
import { VARIANTS, isVariant } from "../../fixtures";
import { previewDisabled } from "../../guard";

/** Development only: the link preview image of one fixture variant. */
export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  if (previewDisabled() || !isVariant(variant)) return new Response("Not found", { status: 404 });
  return reportOgImage(VARIANTS[variant].build());
}
