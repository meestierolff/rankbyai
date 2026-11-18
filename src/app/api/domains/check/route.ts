import { err, json, requireOwner, sessionRead, withSession } from "@/lib/api";
import { dbAdmin } from "@/lib/db/clients";
import { DOMAIN_COLUMNS, type WorkspaceDomainRow } from "@/lib/domains-server";
import { vercelDomainsEnv } from "@/lib/env";
import { domainState, getDomainConfig, getProjectDomain, verifyProjectDomain, VercelUnavailableError } from "@/lib/vercel-domains";

/** Wait this long between two checks of the same domain (Vercel rate-limits its domain endpoints). */
const MIN_INTERVAL_MS = 5_000;

/**
 * "Check again": read the domain's verification and DNS status from Vercel and store it. The
 * hostname comes from the session workspace's own row, never from the request.
 */
export async function POST() {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "Custom domains need lifetime access.");
    if (!vercelDomainsEnv.isConfigured()) return err(503, "not_configured", "Custom domains are not switched on yet.");
    const wsId = ctx.workspace.id;
    const { data: row } = await sessionRead<WorkspaceDomainRow>("Custom domain", ctx, (db) =>
      db.from("workspace_domains").select(DOMAIN_COLUMNS).eq("workspace_id", wsId).maybeSingle(),
    );
    if (!row) return err(404, "not_found", "There is no domain to check yet. Add a domain above.");
    if (row.checked_at && Date.now() - new Date(row.checked_at).getTime() < MIN_INTERVAL_MS) {
      return err(429, "too_soon", "Checked a moment ago. Wait a few seconds and try again.");
    }

    const now = new Date().toISOString();
    let update: Partial<WorkspaceDomainRow> & { updated_at: string };
    try {
      let project = await getProjectDomain(row.hostname);
      if (!project) {
        update = { status: "error", last_error: "This domain is no longer connected on our side. Remove it and add it again.", checked_at: now, updated_at: now };
      } else {
        if (!project.verified && (await verifyProjectDomain(row.hostname))) project = { ...project, verified: true, verification: [] };
        const config = await getDomainConfig(row.hostname);
        const state = domainState(row.hostname, project, config);
        update = {
          status: state.status,
          records: state.records,
          last_error: null,
          checked_at: now,
          updated_at: now,
          ...(state.status === "active" && !row.verified_at ? { verified_at: now } : {}),
        };
      }
    } catch (e) {
      if (e instanceof VercelUnavailableError) return err(502, "vercel_unavailable", "Could not reach the domain service. Try again in a minute.");
      throw e;
    }

    const { data, error } = await dbAdmin()
      .from("workspace_domains")
      .update(update)
      .eq("id", row.id)
      .eq("workspace_id", wsId)
      .select(DOMAIN_COLUMNS)
      .single();
    if (error) return err(500, "server_error", "The status could not be saved. Try again.");
    return json({ domain: data });
  });
}
