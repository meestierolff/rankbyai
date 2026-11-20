import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashApiKey } from "@/lib/crypto";
import { MissingEnvError } from "@/lib/env";

/**
 * Opaque OAuth secrets. Each has a recognisable prefix (so /api/mcp can tell an access token from an
 * API key, and leaked values are easy to spot) and 256 bits of randomness. Only hashes are stored.
 */
export const PREFIX = {
  access: "rbai_at_",
  refresh: "rbai_rt_",
  code: "rbai_ac_",
  clientId: "rbai_oc_",
  clientSecret: "rbai_cs_",
} as const;

const random = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const newSecret = (kind: keyof typeof PREFIX) => PREFIX[kind] + random(kind === "clientId" ? 16 : 32);

/** sha256(value + pepper), the same scheme as api_keys.key_hash. */
export const hashSecret = (value: string) => hashApiKey(value);

/** Constant-time comparison of two strings of possibly different length. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** PKCE S256: BASE64URL(SHA256(code_verifier)) must equal the stored code_challenge. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  // RFC 7636: 43 to 128 characters from the unreserved set.
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return safeEqual(createHash("sha256").update(verifier).digest("base64url"), challenge);
}

// ───────────────────────── signed consent tickets ─────────────────────────

function ticketKey(): Buffer {
  const pepper = process.env.HASH_PEPPER;
  if (!pepper || pepper.length < 16) throw new MissingEnvError("oauth", ["HASH_PEPPER"]);
  return createHash("sha256").update(`oauth-consent-ticket:${pepper}`).digest();
}

/** A short-lived, tamper-proof copy of a validated authorization request, carried by the consent page. */
export function signTicket(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", ticketKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readTicket<T>(ticket: string): T | null {
  const [body, sig, extra] = ticket.split(".");
  if (!body || !sig || extra !== undefined || ticket.length > 8000) return null;
  const expected = createHmac("sha256", ticketKey()).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
