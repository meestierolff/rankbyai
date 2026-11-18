import "server-only";
import { unstable_rethrow } from "next/navigation";
import { memberRead } from "@/lib/db/member-read";
import { reportOrigin, type DnsRecord, type DomainStatus, type WorkspaceDomain } from "@/lib/domains";

/** A workspace's custom domain row (db/migrations/0008_custom_domains.sql). */
export interface WorkspaceDomainRow {
  id: string;
  hostname: string;
  status: DomainStatus;
  records: DnsRecord[];
  last_error: string | null;
  checked_at: string | null;
  verified_at: string | null;
  created_at: string;
}

export const DOMAIN_COLUMNS = "id, hostname, status, records, last_error, checked_at, verified_at, created_at";

/**
 * The signed-in workspace's custom domain (memberRead: signed-in read, then the server read for the
 * session's own workspace). The query filters by workspace_id itself, as memberRead requires.
 * Throws when the read fails on both paths.
 */
export async function readWorkspaceDomain(workspaceId: string): Promise<WorkspaceDomainRow | null> {
  const { data } = await memberRead<WorkspaceDomainRow>("Custom domain", workspaceId, (db) =>
    db.from("workspace_domains").select(DOMAIN_COLUMNS).eq("workspace_id", workspaceId).maybeSingle(),
  );
  return data ?? null;
}

/**
 * The domain share links should use, for a signed-in page or route. A failed read gives null, so
 * links fall back to the main site: those links always work, a custom domain only adds branding.
 */
export async function linkDomainFor(workspaceId: string): Promise<WorkspaceDomain | null> {
  try {
    const row = await readWorkspaceDomain(workspaceId);
    return row ? { hostname: row.hostname, status: row.status } : null;
  } catch (e) {
    unstable_rethrow(e);
    return null;
  }
}

/** The origin for this signed-in workspace's report links (CSV export, PDFs): its active domain, else the main site. */
export async function reportOriginFor(workspaceId: string): Promise<string> {
  return reportOrigin(await linkDomainFor(workspaceId));
}

export { reportOriginForAuthorisedWorkspace } from "./domains-origin";
