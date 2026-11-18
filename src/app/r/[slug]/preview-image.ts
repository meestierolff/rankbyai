import { io } from "next/cache";
import { reportOgImage } from "@/components/report/og-card";
import { isDatabaseConfigured } from "@/lib/db/clients";
import { getReportView } from "@/lib/reports";

/**
 * Link preview of a report (Slack, LinkedIn, X), shared by opengraph-image and twitter-image.
 * An unknown or revoked link gets a 404, never an image with data. Reports are never indexed.
 */
export async function reportPreviewImage(params: Promise<{ slug: string }>): Promise<Response> {
  await io();
  const { slug } = await params;
  const view = isDatabaseConfigured() ? await getReportView(slug) : null;
  if (!view) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  return reportOgImage(view);
}
