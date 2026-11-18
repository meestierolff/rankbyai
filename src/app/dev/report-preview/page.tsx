import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VARIANTS } from "./fixtures";
import { previewDisabled } from "./guard";

export const metadata: Metadata = { title: "Report preview (development)", robots: { index: false, follow: false } };

/** Development only: the public report rendered from invented fixtures, one link per variant. */
export default function ReportPreviewIndex() {
  if (previewDisabled()) notFound();
  return (
    <main className="container-lp flex flex-col gap-6 py-16">
      <h1 className="m-0 text-[32px] font-semibold tracking-[-0.03em]">Report preview (development fixtures)</h1>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {Object.entries(VARIANTS).map(([key, v]) => (
          <li key={key} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Link href={`/dev/report-preview/${key}`} className="font-mono text-[15px] text-lp-fg underline underline-offset-4">{key}</Link>
            <span className="text-[14px] text-lp-muted">{v.title}</span>
            <a href={`/dev/report-preview/${key}/pdf`} className="text-[13px] text-dim underline">PDF</a>
            <a href={`/dev/report-preview/${key}/og`} className="text-[13px] text-dim underline">Link preview</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
