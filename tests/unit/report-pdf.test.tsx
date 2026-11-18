import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VARIANTS, type VariantKey } from "@/app/dev/report-preview/fixtures";
import { pdfFileName, renderReportPdf } from "@/lib/pdf/report-pdf";

/**
 * Every report shape renders to a PDF: full prospect report, Maps only, the 1×1 free check, a
 * white-labelled report, a 15×15 grid with skipped and failed points, and a business without
 * coordinates. Set REPORT_PDF_OUT to a directory to keep the files and look at them.
 */
const out = process.env.REPORT_PDF_OUT;

describe("report PDF", () => {
  it.each(Object.keys(VARIANTS) as VariantKey[])("%s renders", async (key) => {
    const view = VARIANTS[key].build();
    const pdf = await renderReportPdf(view, "https://rankbyai.live/r/abcdefghijkl");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5_000);
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `${key}.pdf`), pdf);
    }
  });

  it("an answer with characters the PDF font cannot draw still renders", async () => {
    const view = VARIANTS.full.build();
    const quote = view.ai!.quote!;
    quote.answers[0] = { ...quote.answers[0], answer: `${quote.answers[0].answer}\n\n⭐ 4.9 → book online 🦷 歯医者` };
    const pdf = await renderReportPdf(view, "https://rankbyai.live/r/abcdefghijkl");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("names the file after the business", () => {
    expect(pdfFileName("Northgate Family Dental")).toBe("northgate-family-dental-ai-visibility.pdf");
  });
});
