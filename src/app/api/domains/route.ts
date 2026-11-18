import { err, json, requireOwner, sessionRead, withSession } from "@/lib/api";
import { dbAdmin } from "@/lib/db/clients";
import { checkCustomHostname, primaryHostOf } from "@/lib/domains";
import { DOMAIN_COLUMNS, type WorkspaceDomainRow } from "@/lib/domains-server";
import { vercelDomainsEnv } from "@/lib/env";
import { addProjectDomain, domainState, getDomainConfig, removeProjectDomain, VercelUnavailableError } from "@/lib/vercel-domains";

/**
 * The workspace's custom report domain (one per workspace).
 *   GET     the stored row and whether the feature is switched on (no call to Vercel)
 *   POST    add a domain: owner, lifetime, feature switched on
 *   DELETE  remove it from the Vercel project, then from the workspace
 * The hostname for DELETE (and for /api/domains/check) is always read from the session workspace's
 * own row, never taken from the request, so nobody can detach a domain that is not theirs.
 */

const NOT_ON = "Custom domains are not switched on yet.";
const TRY_AGAIN = "Could not reach the domain service. Try again in a minute.";

export async function GET() {
  return withSession(async (ctx) => {
    const { data } = await sessionRead<WorkspaceDomainRow>("Custom domain", ctx, (db) =>
      db.from("workspace_domains").select(DOMAIN_COLUMNS).eq("workspace_id", ctx.workspace.id).maybeSingle(),
    );
    return json({ configured: vercelDomainsEnv.isConfigured(), domain: data ?? null });
  });
}

export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "Custom domains need lifetime access.");
    if (!vercelDomainsEnv.isConfigured()) return err(503, "not_configured", NOT_ON);

    const raw = (await request.json().catch(() => null)) as { hostname?: unknown } | null;
    const check = checkCustomHostname(typeof raw?.hostname === "string" ? raw.hostname : "", primaryHostOf());
    if (!check.ok) return err(400, "invalid_hostname", check.message);
    const hostname = check.hostname;
    const wsId = ctx.workspace.id;
    const admin = dbAdmin();

    // Reserve the hostname first: the unique constraints settle two workspaces (or two clicks) racing.
    const { data: inserted, error: insertError } = await admin
      .from("workspace_domains")
      .insert({ workspace_id: wsId, hostname, status: "pending" })
      .select("id")
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        const onHostname = `${insertError.details ?? ""} ${insertError.message ?? ""}`.includes("hostname");
        return onHostname
          ? err(409, "domain_taken", "This domain is already connected to another workspace.")
          : err(409, "domain_exists", "Your workspace already has a domain. Remove it, then add the new one.");
      }
      return err(500, "server_error", "The domain could not be saved. Try again.");
    }
    const rowId = (inserted as { id: string }).id;
    const release = () => admin.from("workspace_domains").delete().eq("id", rowId).eq("workspace_id", wsId);

    let added;
    try {
      added = await addProjectDomain(hostname);
    } catch (e) {
      await release();
      if (e instanceof VercelUnavailableError) return err(502, "vercel_unavailable", TRY_AGAIN);
      throw e;
    }
    if (added.kind !== "added") {
      await release();
      return added.kind === "taken"
        ? err(409, "domain_in_use", "This domain is already in use on another site. Remove it there, then try again.")
        : err(400, "domain_refused", "This domain could not be added. Check the spelling and try again.");
    }

    // A main domain (agency.co.uk) slips past the local check when its ending is not in our list.
    // Vercel's apexName settles it. This request added the domain, so it may remove it again.
    if (added.domain.apexName === hostname) {
      await removeProjectDomain(hostname).catch(() => false);
      await release();
      return err(400, "apex_domain", "Use a subdomain such as reports.youragency.com. Your main domain keeps pointing at your own website.");
    }

    const config = await getDomainConfig(hostname).catch(() => null);
    const state = domainState(hostname, added.domain, config);
    const now = new Date().toISOString();
    const { data: row, error: updateError } = await admin
      .from("workspace_domains")
      .update({ status: state.status, records: state.records, last_error: null, checked_at: now, updated_at: now, ...(state.status === "active" ? { verified_at: now } : {}) })
      .eq("id", rowId)
      .eq("workspace_id", wsId)
      .select(DOMAIN_COLUMNS)
      .single();
    if (updateError) return err(500, "server_error", "The domain was added, but its status could not be saved. Use Check again.");
    return json({ domain: row }, 201);
  });
}

export async function DELETE() {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    const wsId = ctx.workspace.id;
    const { data } = await sessionRead<{ id: string; hostname: string }>("Custom domain", ctx, (db) =>
      db.from("workspace_domains").select("id, hostname").eq("workspace_id", wsId).maybeSingle(),
    );
    if (!data) return json({ ok: true });
    if (!vercelDomainsEnv.isConfigured()) return err(503, "not_configured", `${NOT_ON} The domain cannot be removed until they are.`);
    let removed = false;
    try {
      removed = await removeProjectDomain(data.hostname);
    } catch (e) {
      if (!(e instanceof VercelUnavailableError)) throw e;
    }
    // Keep the row when Vercel still has the domain, so the owner can try again and nothing is left behind.
    if (!removed) return err(502, "vercel_unavailable", TRY_AGAIN);
    const { error } = await dbAdmin().from("workspace_domains").delete().eq("id", data.id).eq("workspace_id", wsId);
    if (error) return err(500, "server_error", "The domain was disconnected, but the setting could not be cleared. Try again.");
    return json({ ok: true });
  });
}
