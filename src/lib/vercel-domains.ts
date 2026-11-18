import "server-only";
import { z } from "zod";
import type { DnsRecord, DomainStatus } from "@/lib/domains";
import { vercelDomainsEnv } from "@/lib/env";

/*
 * Vercel REST API for custom report domains. Endpoints and fields as documented on 18 Nov 2026:
 *
 *   POST   /v10/projects/{idOrName}/domains?teamId=           https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project
 *          body { name } → 200 { name, apexName, projectId, verified, verification[{ type, domain, value, reason }] }
 *          "If the domain already exists on the project, the request will fail with a 400 status code."
 *          409: "The domain is already assigned to another Vercel project" / "...to a project on this account" /
 *          "The domain is not allowed to be used". 403: "You don't have access to the domain you are adding".
 *   GET    /v9/projects/{idOrName}/domains/{domain}?teamId=   https://vercel.com/docs/rest-api/projects/get-a-project-domain
 *          → 200 same shape as above (verified, verification[]). The docs list 404 without a description;
 *          this code ASSUMES 404 means "not on the project".
 *   POST   /v9/projects/{idOrName}/domains/{domain}/verify    https://vercel.com/docs/rest-api/projects/verify-project-domain
 *          → 200 { verified }; 400 when the TXT challenge is not met yet.
 *   DELETE /v9/projects/{idOrName}/domains/{domain}?teamId=   https://vercel.com/docs/rest-api/projects/remove-a-domain-from-a-project
 *          → 200 {}.
 *   GET    /v6/domains/{domain}/config?projectIdOrName=&teamId=  https://vercel.com/docs/rest-api/domains/get-a-domain-s-configuration
 *          → 200 { configuredBy, acceptedChallenges, misconfigured, recommendedCNAME[{ rank, value }], recommendedIPv4[{ rank, value[] }] }
 *          "misconfigured: Whether or not the domain is configured AND we can automatically generate a TLS certificate."
 *          "recommendedCNAME: rank=1 is the preferred value to use."
 *
 * Token scope (https://vercel.com/docs/accounts/access-tokens, read 18 Nov 2026): a token can be
 * scoped to one project; "Team- and project-scoped tokens do not require the teamId query
 * parameter". ASSUMED, not documented: such a token still accepts a matching ?teamId=, which this
 * code always sends. The docs show 403 errors as { error: { ..., invalidToken | missingToken } }.
 *
 * The token is read from the environment for each call and only ever placed in the Authorization
 * header. Nothing here logs it, the request URL or a response body: logs carry the status and the
 * vendor's error code only.
 */

const API = "https://api.vercel.com";
const TIMEOUT_MS = 10_000;

const Verification = z.object({ type: z.string(), domain: z.string(), value: z.string(), reason: z.string().optional().default("") });
const ProjectDomainSchema = z.object({
  name: z.string(),
  apexName: z.string(),
  verified: z.boolean(),
  verification: z.array(Verification).optional().default([]),
});
const DomainConfigSchema = z.object({
  misconfigured: z.boolean(),
  configuredBy: z.string().nullable().optional(),
  recommendedCNAME: z.array(z.object({ rank: z.number(), value: z.string() })).optional().default([]),
});

export type ProjectDomain = z.infer<typeof ProjectDomainSchema>;
export type DomainConfig = z.infer<typeof DomainConfigSchema>;

/** Vercel could not be reached or answered something unexpected. The caller answers "try again". */
export class VercelUnavailableError extends Error {
  constructor(what: string, status: number | "network" | "shape") {
    super(`Vercel ${what} failed (${status})`);
    this.name = "VercelUnavailableError";
  }
}

interface Answer {
  status: number;
  body: unknown;
}

async function call(method: "GET" | "POST" | "DELETE", path: string, query: Record<string, string> = {}, body?: object): Promise<Answer> {
  const env = vercelDomainsEnv.get(); // MissingEnvError when not configured
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  url.searchParams.set("teamId", env.VERCEL_TEAM_ID);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${env.VERCEL_API_TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    console.error(`[domains] Vercel ${method} ${path.split("/")[2]}: no answer`);
    throw new VercelUnavailableError(method, "network");
  }
  const parsed = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (parsed as { error?: { code?: unknown } } | null)?.error?.code;
    console.warn(`[domains] Vercel ${method} answered ${res.status}${typeof code === "string" ? ` (${code.slice(0, 60)})` : ""}`);
  }
  return { status: res.status, body: parsed };
}

const projectPath = (suffix = "") => `/v9/projects/${encodeURIComponent(vercelDomainsEnv.get().VERCEL_PROJECT_ID)}/domains${suffix}`;

export type AddResult =
  | { kind: "added"; domain: ProjectDomain }
  /** 400 "already exists on the project" or 409 "assigned to another project": not ours to adopt or delete. */
  | { kind: "taken" }
  | { kind: "refused" };

/** Add the domain to the Vercel project. Throws VercelUnavailableError when Vercel cannot be used right now. */
export async function addProjectDomain(hostname: string): Promise<AddResult> {
  const project = encodeURIComponent(vercelDomainsEnv.get().VERCEL_PROJECT_ID);
  const res = await call("POST", `/v10/projects/${project}/domains`, {}, { name: hostname });
  if (res.status === 200) {
    const parsed = ProjectDomainSchema.safeParse(res.body);
    if (!parsed.success) throw new VercelUnavailableError("add", "shape");
    return { kind: "added", domain: parsed.data };
  }
  if (res.status === 409) return { kind: "taken" };
  if (res.status === 400) {
    // 400 covers both "already exists on the project" and "not valid". Ask which.
    return (await getProjectDomain(hostname)) ? { kind: "taken" } : { kind: "refused" };
  }
  if (res.status === 403 && /domain/i.test(String((res.body as { error?: { message?: unknown } } | null)?.error?.message ?? ""))) return { kind: "refused" };
  throw new VercelUnavailableError("add", res.status);
}

/** The domain as the project sees it, or null when it is not on the project. */
export async function getProjectDomain(hostname: string): Promise<ProjectDomain | null> {
  const res = await call("GET", projectPath(`/${encodeURIComponent(hostname)}`));
  if (res.status === 404) return null;
  if (res.status !== 200) throw new VercelUnavailableError("get", res.status);
  const parsed = ProjectDomainSchema.safeParse(res.body);
  if (!parsed.success) throw new VercelUnavailableError("get", "shape");
  return parsed.data;
}

/** Ask Vercel to check the TXT challenge again. True once the domain is verified for the project. */
export async function verifyProjectDomain(hostname: string): Promise<boolean> {
  const res = await call("POST", projectPath(`/${encodeURIComponent(hostname)}/verify`));
  if (res.status === 200) return (res.body as { verified?: unknown } | null)?.verified === true;
  if (res.status === 400) return false; // challenge not met yet
  throw new VercelUnavailableError("verify", res.status);
}

/** DNS configuration and the CNAME target Vercel recommends for this project. Null when Vercel does not say. */
export async function getDomainConfig(hostname: string): Promise<DomainConfig | null> {
  const res = await call("GET", `/v6/domains/${encodeURIComponent(hostname)}/config`, { projectIdOrName: vercelDomainsEnv.get().VERCEL_PROJECT_ID });
  if (res.status !== 200) return null;
  const parsed = DomainConfigSchema.safeParse(res.body);
  return parsed.success ? parsed.data : null;
}

/** Remove the domain from the project. True when it is gone (also when it was not there). */
export async function removeProjectDomain(hostname: string): Promise<boolean> {
  const res = await call("DELETE", projectPath(`/${encodeURIComponent(hostname)}`));
  return res.status === 200 || res.status === 404;
}

/** "reports" for reports.agency.com under agency.com; "@" for the apex itself. */
export function relativeName(host: string, apex: string): string {
  if (host === apex) return "@";
  return host.endsWith(`.${apex}`) ? host.slice(0, -(apex.length + 1)) : host;
}

/**
 * Status and the records to show, from Vercel's two answers. Pure.
 *   active     verified for the project AND Vercel sees the DNS record and can issue a certificate
 *   verifying  Vercel needs the TXT record first (the domain is known to another Vercel account)
 *   pending    waiting for the CNAME record (or Vercel's DNS check could not be read)
 * The CNAME target is the rank-1 recommendedCNAME Vercel returned; nothing is guessed.
 */
export function domainState(hostname: string, project: ProjectDomain, config: DomainConfig | null): { status: DomainStatus; records: DnsRecord[] } {
  const records: DnsRecord[] = [];
  const target = [...(config?.recommendedCNAME ?? [])].sort((a, b) => a.rank - b.rank)[0]?.value.replace(/\.$/, "");
  if (target) records.push({ type: "CNAME", name: relativeName(hostname, project.apexName), host: hostname, value: target });
  for (const v of project.verification) {
    records.push({ type: v.type, name: relativeName(v.domain, project.apexName), host: v.domain, value: v.value, ...(v.reason ? { reason: v.reason } : {}) });
  }
  const status: DomainStatus = !project.verified ? "verifying" : config && !config.misconfigured ? "active" : "pending";
  return { status, records };
}
