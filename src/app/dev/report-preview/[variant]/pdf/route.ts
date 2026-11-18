import { pdfFileName, renderReportPdf } from "@/lib/pdf/report-pdf";
import { VARIANTS, isVariant } from "../../fixtures";
import { previewDisabled } from "../../guard";

/** Development only: the PDF of one fixture variant, shown inline. */
export async function GET(request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  if (previewDisabled() || !isVariant(variant)) return new Response("Not found", { status: 404 });
  const view = VARIANTS[variant].build();
  const pdf = await renderReportPdf(view, `${new URL(request.url).origin}/r/preview-${variant}`);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdfFileName(view.business.name)}"`, "Cache-Control": "no-store" } });
}
