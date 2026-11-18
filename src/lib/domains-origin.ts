import "server-only";
import { dbAdmin } from "@/lib/db/clients";
import { reportOrigin, type WorkspaceDomain } from "@/lib/domains";

/**
 * Report links for a caller that is already authorised for `workspaceId` some other way (an API key
 * route): reads as the server, filtered by that workspace id. Falls back to the main site.
 * Kept apart from domains-server, which imports the session code, so the REST API stays free of it.
 */
export async function reportOriginForAuthorisedWorkspace(workspaceId: string): Promise<string> {
  const { data, error } = await dbAdmin().from("workspace_domains").select("hostname, status").eq("workspace_id", workspaceId).maybeSingle();
  return reportOrigin(error ? null : ((data as WorkspaceDomain | null) ?? null));
}
