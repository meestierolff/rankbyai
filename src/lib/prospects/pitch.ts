import "server-only";
import { pitchAsset } from "@/components/report/pitch";
import { getReportView } from "@/lib/reports";
import type { BatchRow } from "./batch";

/**
 * The email teaser of one prospect report, for the app (signed in) and the API (an API key). The
 * caller has already read the batch from the caller's own workspace; this finds the report of the
 * business in it and formats what that report already holds. No vendor call, no model call.
 */
export type PitchResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; message: string };

export const PITCH_NOTE = "RankbyAI does not send email. Copy the text into your own mail client and attach the image; the link opens the full report.";

export async function pitchForProspect(rows: BatchRow[], businessId: string, origin: string): Promise<PitchResult> {
  const row = rows.find((r) => r.business_id === businessId);
  if (!row) return { ok: false, status: 404, error: "not_found", message: "That business is not in this batch." };
  if (row.status !== "done" || !row.report_slug) return { ok: false, status: 409, error: "report_not_ready", message: "This report is not ready yet. Poll the batch until its status is done." };
  const view = await getReportView(row.report_slug);
  if (!view) return { ok: false, status: 404, error: "report_unavailable", message: "This report's link was revoked or its business was deleted." };
  const reportUrl = `${origin}/r/${row.report_slug}`;
  const asset = pitchAsset(view, reportUrl);
  return {
    ok: true,
    body: {
      business: view.business.name,
      business_id: businessId,
      report_url: reportUrl,
      image_url: `${reportUrl}/pitch-image`,
      email: { subject: asset.subject, text: asset.text, lines: asset.lines },
      comparison: asset.comparison,
      omitted: asset.omitted,
      note: PITCH_NOTE,
    },
  };
}
