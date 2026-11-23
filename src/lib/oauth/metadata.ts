import "server-only";
import { endpoints, issuer, MCP_SCOPE, mcpResource, resourceMetadataUrl } from "./config";

/** Protected Resource Metadata for /api/mcp (RFC 9728). */
export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "RankbyAI",
    resource_documentation: `${issuer()}/docs/api#mcp`,
    // RFC 9728 §2: what clients may show next to the name on their own consent screens.
    resource_policy_uri: `${issuer()}/privacy`,
    resource_tos_uri: `${issuer()}/terms`,
  };
}

/**
 * Authorization Server Metadata (RFC 8414). Advertises only what is built and tested: the code flow
 * with PKCE S256, refresh tokens, dynamic client registration (public and secret-based clients),
 * Client ID Metadata Documents for public clients, revocation, and `iss` on authorization responses.
 * offline_access is listed because some clients add it to get a refresh token; refresh tokens are
 * issued with or without it.
 */
export function authorizationServerMetadata() {
  const e = endpoints();
  return {
    issuer: issuer(),
    authorization_endpoint: e.authorization,
    token_endpoint: e.token,
    registration_endpoint: e.registration,
    revocation_endpoint: e.revocation,
    scopes_supported: [MCP_SCOPE, "offline_access"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${issuer()}/docs/api#mcp`,
    op_policy_uri: `${issuer()}/privacy`,
    op_tos_uri: `${issuer()}/terms`,
  };
}

/** The 401 challenge on /api/mcp (RFC 6750 + RFC 9728), with the scope to ask for. */
export function bearerChallenge(error?: "invalid_token"): string {
  const parts = [`resource_metadata="${resourceMetadataUrl()}"`, `scope="${MCP_SCOPE}"`];
  if (error) parts.push(`error="${error}"`, `error_description="The access token is invalid, expired or revoked."`);
  return `Bearer ${parts.join(", ")}`;
}
