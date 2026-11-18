import { io } from "next/cache";
import { isDatabaseConfigured } from "@/lib/db/clients";
import { pdfFileName, renderReportPdf } from "@/lib/pdf/report-pdf";
import { getReportView } from "@/lib/reports";

export const maxDuration = 60;

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });

/**
 * The report's PDF for anyone who has the link, like the page itself (/r/{slug}). It is built from
 * the same public view model, so it cannot contain anything the page does not show. A revoked or
 * unknown link is a 404. The QR code and link inside point at the address the PDF was requested
 * from, so a report opened on an agency's own domain keeps pointing there.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  await io();
  const { slug } = await params;
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(slug) || !isDatabaseConfigured()) return notFound();
  const view = await getReportView(slug);
  if (!view) return notFound();
  const pdf = await renderReportPdf(view, `${new URL(request.url).origin}/r/${slug}`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName(view.business.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
