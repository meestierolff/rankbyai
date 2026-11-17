import "server-only";
import { zipSync } from "fflate";
import { pdfFileName, renderReportPdf } from "@/lib/pdf/report-pdf";
import { getReportView } from "@/lib/reports";
import type { BatchRow } from "./batch";

/** One PDF per finished report, zipped. File names are unique even when two businesses share a name. */
export async function zipBatchPdfs(rows: BatchRow[], siteUrl: string): Promise<{ bytes: Uint8Array; count: number }> {
  const files: Record<string, Uint8Array> = {};
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const row = rows[next++];
      if (!row.report_slug) continue;
      const view = await getReportView(row.report_slug);
      if (!view) continue; // revoked in the meantime
      const pdf = await renderReportPdf(view, `${siteUrl}/r/${row.report_slug}`);
      let name = pdfFileName(row.name);
      for (let n = 2; files[name]; n++) name = pdfFileName(row.name).replace(/\.pdf$/, `-${n}.pdf`);
      files[name] = new Uint8Array(pdf);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
  return { bytes: zipSync(files, { level: 0 }), count: Object.keys(files).length }; // PDFs are already compressed
}
