import { after } from "next/server";
import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { processScan } from "@/lib/scans/engine";
import { createSupabaseServer } from "@/lib/supabase/server";

export const maxDuration = 300;

/** Scan status + data for the result page. RLS scopes it to the caller's workspace. Polling also nudges a stalled scan. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async () => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) return err(400, "invalid_id", "Unknown scan.");
    const supabase = await createSupabaseServer();
    const { data: scan } = await supabase
      .from("scans")
      .select("id, business_id, kind, keyword, niche, prompt_template, engines, grid_size, radius_miles, center_lat, center_lng, mode, funding, status, credits_used, est_cost_usd, actual_cost_usd, summary, error, created_at, finished_at, lease_until")
      .eq("id", id.data)
      .maybeSingle();
    if (!scan) return err(404, "not_found", "Unknown scan.");

    const [{ data: points }, { data: samples }] = await Promise.all([
      supabase.from("scan_points").select("idx, row, col, lat, lng, label, rank, top, status, error").eq("scan_id", scan.id).order("idx"),
      scan.kind === "ai"
        ? supabase.from("ai_samples").select("point_idx, engine, engine_variant, prompt, answer_text, mentioned, mention_position, named_businesses, sources, cost_usd, status, error").eq("scan_id", scan.id).order("point_idx")
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const active = scan.status === "queued" || scan.status === "running";
    const leaseFree = !scan.lease_until || new Date(scan.lease_until).getTime() < Date.now();
    if (active && leaseFree) after(() => processScan(scan.id));

    const { lease_until: _lease, ...publicScan } = scan;
    void _lease;
    return json({ scan: publicScan, points: points ?? [], samples: samples ?? [] });
  });
}
