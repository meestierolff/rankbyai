import "server-only";

/**
 * HTTP helpers for the OAuth endpoints. Metadata, registration, token and revocation are called by
 * MCP clients, some of them from a browser (MCP Inspector, web IDEs), so they send CORS headers.
 * None of them uses cookies, so a wildcard origin gives nothing away.
 */
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export const notFound = () => Response.json({ error: "not_found" }, { status: 404, headers: { ...CORS, ...NO_STORE } });

export const jsonOk = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...CORS, ...NO_STORE, ...extra } });

/** Public metadata documents: cacheable for a few minutes. */
export const metadataOk = (body: unknown) =>
  Response.json(body, { headers: { ...CORS, "Cache-Control": "public, max-age=300" } });

/** An OAuth error response (RFC 6749 section 5.2). */
export const oauthError = (status: number, error: string, description: string, extra: Record<string, string> = {}) =>
  jsonOk({ error, error_description: description }, status, extra);

/**
 * Token and revocation requests are application/x-www-form-urlencoded (RFC 6749); some clients send
 * JSON. Returns the parameters as strings, or null when the body cannot be read or is too large.
 */
export async function readParams(request: Request): Promise<Record<string, string> | null> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  const text = await request.text().catch(() => null);
  if (text === null || text.length > 16_384) return null;
  if (type.includes("application/json")) {
    try {
      const obj = JSON.parse(text) as unknown;
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
      return Object.fromEntries(Object.entries(obj as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][]);
    } catch {
      return null;
    }
  }
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params) {
    if (k in out) return null; // RFC 6749 3.2: parameters MUST NOT be repeated
    out[k] = v;
  }
  return out;
}

/** Client credentials from an HTTP Basic header (client_secret_basic), form-decoded per RFC 6749 2.3.1. */
export function basicCredentials(request: Request): { id: string; secret: string } | null {
  const h = request.headers.get("authorization") ?? "";
  if (!/^Basic\s+/i.test(h)) return null;
  try {
    const decoded = Buffer.from(h.replace(/^Basic\s+/i, "").trim(), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i < 0) return null;
    return { id: decodeURIComponent(decoded.slice(0, i)), secret: decodeURIComponent(decoded.slice(i + 1)) };
  } catch {
    return null;
  }
}
