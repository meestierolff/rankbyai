import "server-only";
import { err } from "@/lib/api";
import type { SessionContext } from "@/lib/auth";
import { dbAdmin } from "@/lib/db/clients";
import { isMockMode } from "@/lib/mock";

/**
 * Lookups in prospect mode cost money before any report exists. On the user's own DataForSEO key
 * they are only rate limited. On our keys ("included scans") they also need a credit balance that
 * could pay for at least one report, and a much tighter daily limit, so the lookups cannot be used
 * as a free search service.
 */
export async function guardLookup(ctx: SessionContext, kind: "discover" | "resolve", funding: "byok" | "credits", neededCredits = 2): Promise<Response | null> {
  if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "Prospect mode needs lifetime access.");
  const admin = dbAdmin();
  const house = funding === "credits";
  const { data: allowed, error } = await admin.rpc("rate_limit_hit", {
    p_key: `prospect_${kind}:${house ? "house" : "byok"}:${ctx.workspace.id}`,
    p_window_seconds: house ? 86_400 : 3600,
    p_limit: house ? (kind === "discover" ? 10 : 3) : 60,
  });
  if (error) return err(503, "rate_limit_unavailable", "Try again in a moment.");
  if (allowed !== true) return err(429, "rate_limited", house ? "You have used today's lookups on included scans. Try again tomorrow, or use your own DataForSEO key." : "Too many lookups this hour. Try again later.");
  if (house && !isMockMode()) {
    const { data: balance } = await admin.rpc("credit_balance", { p_workspace_id: ctx.workspace.id });
    if ((balance ?? 0) < neededCredits) return err(402, "insufficient_credits", `Lookups on included scans need at least ${neededCredits} scan credits in your balance (a prospect report costs 2).`);
  }
  return null;
}
