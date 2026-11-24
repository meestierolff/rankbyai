import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportBody } from "@/components/report/report-body";
import { publicEnv } from "@/lib/env-public";
import { VARIANTS, isVariant } from "../fixtures";
import { previewDisabled } from "../guard";

export const metadata: Metadata = { title: "Report preview (development)", robots: { index: false, follow: false } };

// Like the real report route: a blocking page (the preview reads its params before rendering).
export const instant = false;

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

/** Development only: one fixture variant through the real report body. */
export default async function ReportPreview({ params }: { params: Promise<{ variant: string }> }) {
  if (previewDisabled()) notFound();
  const { variant } = await params;
  if (!isVariant(variant)) notFound();
  const view = VARIANTS[variant].build();
  return <ReportBody view={view} pdfHref={`/dev/report-preview/${variant}/pdf`} siteUrl={publicEnv.siteUrl} reportPath={`/r/preview-${variant}`} />;
}
