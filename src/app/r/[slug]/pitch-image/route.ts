import { io } from "next/cache";
import { pitchAsset } from "@/components/report/pitch";
import { pitchImage } from "@/components/report/pitch-card";
import { isDatabaseConfigured } from "@/lib/db/clients";
import { logoDataUri } from "@/lib/logo";
import { getReportView } from "@/lib/reports";

/**
 * The image of a report's email teaser (PNG, 1200×630): the business against the rivals ahead of
 * it at the same grid points. Like the link preview, anyone with the report link can open it, it
 * holds only what the report shows, and an unknown or revoked link is a 404. Never indexed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  await io();
  const { slug } = await params;
  const view = isDatabaseConfigured() ? await getReportView(slug) : null;
  if (!view) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  return pitchImage(view, pitchAsset(view, null).comparison, await logoDataUri(view.brand.logoUrl));
}
