// OAuth token endpoint: authorization_code (PKCE S256) and refresh_token grants. See src/lib/oauth.
export { tokenPOST as POST, preflight as OPTIONS } from "@/lib/oauth/routes";
