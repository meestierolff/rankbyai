import { after } from "next/server";
import { err, json, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import { RunPack, runPack } from "@/lib/api-v1/packs";
import { processPackRun } from "@/lib/packs/run";

export const maxDuration = 300;

/**
 * Prompt pack from the citation workflow page. Without `confirm: true` the response is the
 * estimate only (HTTP 409 confirmation_required, with missing_keys); with it, the pack's scans are
 * created and worked through after the response is sent.
 */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const parsed = RunPack.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", parsed.error.issues[0]?.message ?? "Check the prompts and settings and try again.");
    const r = await runPack(ctx.workspace.id, ctx.workspace.plan, parsed.data);
    if (!r.ok) {
      return err(r.status, r.error, r.message, { ...("estimate" in r && r.estimate ? { estimate: r.estimate } : {}), ...("missingKeys" in r && r.missingKeys ? { missing_keys: r.missingKeys } : {}) });
    }
    after(() => processPackRun(r.runId));
    await captureServer("pack_started", ctx.workspace.id, { est_usd: r.estimate.totalUsd, scans: r.scanIds.length }).catch(() => undefined);
    return json({ ok: true, pack_id: r.packId, run_id: r.runId, estimate: r.estimate });
  });
}
