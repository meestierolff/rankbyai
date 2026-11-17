import "server-only";
import { importJWK, SignJWT, type JWK } from "jose";
import { MissingEnvError } from "@/lib/env";

/**
 * Short-lived tokens for the Data API (Neon Data API in production, PostgREST locally).
 *
 * The gateway switches to the database role named in the token and RLS reads the user id from
 * "sub". Tokens are signed here, on the server, with a private key that never leaves the server;
 * the gateway only holds the public half (JWKS). A browser never receives one of these tokens.
 */
export type DbRole = "anonymous" | "authenticated" | "service_role";

type SigningKey = Awaited<ReturnType<typeof importJWK>>;
let cachedKey: { key: SigningKey; kid?: string; alg: string } | null = null;

async function signingKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.DATA_API_JWT_PRIVATE_JWK;
  if (!raw) throw new MissingEnvError("database", ["DATA_API_JWT_PRIVATE_JWK"]);
  let jwk: JWK;
  try {
    jwk = JSON.parse(raw) as JWK;
  } catch {
    throw new MissingEnvError("database", ["DATA_API_JWT_PRIVATE_JWK (must be a JSON Web Key)"]);
  }
  const alg = jwk.alg ?? "ES256";
  cachedKey = { key: await importJWK(jwk, alg), kid: jwk.kid, alg };
  return cachedKey;
}

const TTL_SECONDS = 300;
const cache = new Map<string, { token: string; exp: number }>();

export async function mintDbToken(role: DbRole, userId?: string): Promise<string> {
  if (role === "authenticated" && !userId) throw new Error("A user id is required for an authenticated token.");
  const cacheKey = `${role}:${userId ?? ""}`;
  const now = Math.floor(Date.now() / 1000);
  const hit = cache.get(cacheKey);
  if (hit && hit.exp - now > 60) return hit.token;

  const { key, kid, alg } = await signingKey();
  const exp = now + TTL_SECONDS;
  const jwt = new SignJWT({ role }).setProtectedHeader({ alg, ...(kid ? { kid } : {}) }).setIssuedAt(now).setExpirationTime(exp).setIssuer("rankbyai").setAudience("rankbyai-data-api");
  if (userId) jwt.setSubject(userId);
  const token = await jwt.sign(key);
  if (cache.size > 500) cache.clear();
  cache.set(cacheKey, { token, exp });
  return token;
}
