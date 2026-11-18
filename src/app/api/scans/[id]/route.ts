import { after } from "next/server";
import { z } from "zod";
import { err, json, sessionRead, withSession } from "@/lib/api";
import { processScan } from "@/lib/scans/engine";

export const maxDuration = 300;

/**
 * Points and samples have no workspace_id of their own. `scans!inner(workspace_id)` joins the scan
 * they belong to, so the workspace filter is part of the query itself; the joined column is only
 * there for that filter and is taken out again before the rows are sent.
 */
const IN_WORKSPACE = "scans!inner(workspace_id)";
const withoutJoin = (rows: unknown): Record<string, unknown>[] =>
  ((rows ?? []) as Record<string, unknown>[]).map(({ scans: _scans, ...row }) => {
    void _scans;
    return row;
  });

type ScanRow = Record<string, unknown> & { id: string; kind: "maps" | "ai"; status: string; lease_until: string | null };
interface ScanData { scan: ScanRow; points: unknown; samples: unknown }

/** Scan status + data for the result page, for the workspace of the session only. Polling also nudges a stalled scan. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown scan.");
    const workspaceId = ctx.workspace.id;
    // One read for the scan with its points and samples (this route is polled). Each of the three
    // queries carries the workspace filter itself, because the read may be repeated as the server.
    const { data } = await sessionRead<ScanData>("Scan", ctx, async (db) => {
      const scan = await db
        .from("scans")
        .select("id, business_id, kind, keyword, niche, prompt_template, engines, grid_size, radius_miles, center_lat, center_lng, mode, funding, status, credits_used, est_cost_usd, actual_cost_usd, summary, error, created_at, finished_at, lease_until")
        .eq("id", id.data)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      const row = scan.data as ScanRow | null;
      if (scan.error || !row) return { data: null, error: scan.error };
      const [points, samples] = await Promise.all([
        db.from("scan_points").select(`idx, row, col, lat, lng, label, rank, top, status, error, ${IN_WORKSPACE}`).eq("scan_id", row.id).eq("scans.workspace_id", workspaceId).order("idx"),
        row.kind === "ai"
          ? db
              .from("ai_samples")
              .select(`point_idx, engine, engine_variant, prompt, answer_text, mentioned, mention_position, named_businesses, sources, cost_usd, status, error, ${IN_WORKSPACE}`)
              .eq("scan_id", row.id)
              .eq("scans.workspace_id", workspaceId)
              .order("point_idx")
          : Promise.resolve({ data: [] as unknown[], error: null }),
      ]);
      // A scan without its points is not a result: one failed query fails the whole read.
      const error = points.error ?? samples.error;
      return error ? { data: null, error } : { data: { scan: row, points: points.data, samples: samples.data }, error: null };
    });
    if (!data) return err(404, "not_found", "Unknown scan.");
    const { scan } = data;

    const active = scan.status === "queued" || scan.status === "running";
    const leaseFree = !scan.lease_until || new Date(scan.lease_until).getTime() < Date.now();
    if (active && leaseFree) after(() => processScan(scan.id));

    const { lease_until: _lease, ...publicScan } = scan;
    void _lease;
    return json({ scan: publicScan, points: withoutJoin(data.points), samples: withoutJoin(data.samples) });
  });
}
