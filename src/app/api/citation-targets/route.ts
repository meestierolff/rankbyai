import { after } from "next/server";
import { err, json, withSession } from "@/lib/api";
import { FindTargets, findTargets } from "@/lib/api-v1/targets";
import { processTargets } from "@/lib/targets/run";

export const maxDuration = 300;

/**
 * Citation targets from the citation workflow page. Without `confirm: true` the response is the
 * estimate (HTTP 409 confirmation_required) with the competitors and words it would use; with it,
 * the search runs after the response is sent, on the user's own DataForSEO login.
 */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const parsed = FindTargets.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", parsed.error.issues[0]?.message ?? "Check the competitors and try again.");
    const r = await findTargets(ctx.workspace.id, ctx.workspace.plan, parsed.data);
    const shown = { competitors: r.competitors, client_domain: r.clientDomain ?? null, url_contains: r.tokens };
    if (!r.ok) return err(r.status, r.error, r.message, { ...(r.estimate ? { estimate: r.estimate, ...shown } : {}), ...(r.named ? { named_in_answers: r.named } : {}) });
    after(() => processTargets(r.listId));
    return json({ ok: true, list_id: r.listId, estimate: r.estimate, ...shown });
  });
}
