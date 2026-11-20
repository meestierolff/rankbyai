import "server-only";
import { publicEnv } from "@/lib/env-public";

/**
 * OAuth 2.1 for the MCP server. RankbyAI is its own authorization server: the issuer is the site
 * URL, never a value taken from the request (the app also answers on custom report domains).
 *
 * Off until MCP_OAUTH=1 is set, so code can ship before migration 0012 has run: while it is off,
 * the metadata and OAuth endpoints answer 404 and /api/mcp answers 401 exactly as before (API keys only).
 */
export const oauthOpen = () => process.env.MCP_OAUTH === "1";

/** The one scope: use the RankbyAI tools for the workspace the user picked on the consent page. */
export const MCP_SCOPE = "mcp";
/** Requested by some clients to get a refresh token; refresh tokens are always issued, so it is accepted and dropped. */
export const OFFLINE_ACCESS = "offline_access";

export const ACCESS_TOKEN_TTL_S = 3600;
export const REFRESH_TOKEN_TTL_S = 30 * 86_400;
export const CODE_TTL_S = 600;
/** A rotated refresh token still works this long, so two concurrent refreshes by one client both succeed. */
export const REFRESH_REUSE_GRACE_S = 30;
/** How long a fetched Client ID Metadata Document is trusted before it is read again. */
export const CIMD_CACHE_S = 86_400;

export const issuer = () => publicEnv.siteUrl;
/** The protected resource: the canonical URL of the MCP endpoint, which tokens are bound to (RFC 8707). */
export const mcpResource = () => `${issuer()}/api/mcp`;
export const resourceMetadataUrl = () => `${issuer()}/.well-known/oauth-protected-resource/api/mcp`;

export const endpoints = () => ({
  authorization: `${issuer()}/oauth/authorize`,
  token: `${issuer()}/oauth/token`,
  registration: `${issuer()}/oauth/register`,
  revocation: `${issuer()}/oauth/revoke`,
});

/** Lower-case scheme and host, no trailing slash, no fragment: how a `resource` value is compared. */
export function canonicalResource(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.hash || u.username || u.password) return null;
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return null;
  }
}
