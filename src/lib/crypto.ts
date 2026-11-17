import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { MissingEnvError } from "@/lib/env";

/**
 * Key vault crypto. AES-256-GCM, random 12-byte IV, 16-byte auth tag.
 * The additional authenticated data binds a ciphertext to its workspace and provider,
 * so a row copied to another workspace or provider cannot be decrypted.
 * Rotation: bump CURRENT_KEY_VERSION and add KEY_ENCRYPTION_SECRET_V{n}; old rows keep their version.
 */
export const CURRENT_KEY_VERSION = 1;

function keyFor(version: number): Buffer {
  const name = version === 1 ? "KEY_ENCRYPTION_SECRET" : `KEY_ENCRYPTION_SECRET_V${version}`;
  const raw = process.env[name];
  if (!raw) throw new MissingEnvError("key-vault", [name]);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new MissingEnvError("key-vault", [`${name} (must be 32 bytes, base64)`]);
  return key;
}

export interface Sealed {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

export const aadFor = (workspaceId: string, provider: string) => `${workspaceId}:${provider}`;

export function encryptSecret(plaintext: string, aad: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(CURRENT_KEY_VERSION), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: CURRENT_KEY_VERSION };
}

export function decryptSecret(sealed: Sealed, aad: string): string {
  const decipher = createDecipheriv("aes-256-gcm", keyFor(sealed.keyVersion), sealed.iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(sealed.authTag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
}

/** Postgres bytea <-> Buffer over PostgREST (hex format). */
export const toBytea = (b: Buffer) => "\\x" + b.toString("hex");
export const fromBytea = (v: string) => Buffer.from(v.startsWith("\\x") ? v.slice(2) : v, "hex");

function pepper(): string {
  const p = process.env.HASH_PEPPER;
  if (!p || p.length < 16) throw new MissingEnvError("key-vault", ["HASH_PEPPER"]);
  return p;
}

/** sha256(key + pepper): how our own API keys are stored. */
export const hashApiKey = (key: string) => createHash("sha256").update(key + pepper()).digest("hex");

/** Keyed hash for identifiers we must compare but never store in the clear (emails, IPs). */
export const hashIdentifier = (value: string) => createHmac("sha256", pepper()).update(value.trim().toLowerCase()).digest("hex");

export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");
