import { err, sessionRead, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import { publicEnv } from "@/lib/env";
import { pdfFileName, renderReportPdf } from "@/lib/pdf/report-pdf";
import { getReportView } from "@/lib/reports";

export const maxDuration = 60;

/** PDF of one report, for the workspace that owns it (the session's workspace). The PDF holds what the public page shows. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return withSession(async (ctx) => {
    const { slug } = await params;
    if (!/^[A-Za-z0-9_-]{12,64}$/.test(slug)) return err(404, "not_found", "Unknown report.");
    const { data: own } = await sessionRead<{ id: string }>("Report", ctx, (db) => db.from("reports").select("id").eq("share_slug", slug).eq("revoked", false).eq("workspace_id", ctx.workspace.id).maybeSingle());
    if (!own) return err(404, "not_found", "Unknown report.");
    const view = await getReportView(slug);
    if (!view) return err(404, "not_found", "Unknown report.");
    const pdf = await renderReportPdf(view, `${publicEnv.siteUrl}/r/${slug}`);
    await captureServer("pdf_downloaded", ctx.workspace.id, { kind: view.kind });
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${pdfFileName(view.business.name)}"`, "Cache-Control": "no-store" } });
  });
}
