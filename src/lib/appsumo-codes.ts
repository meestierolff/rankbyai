import "server-only";
import { createHash } from "node:crypto";

/** Codes are case-insensitive. 24 random bytes are encoded as 48 hex characters. */
export function normalizeAppSumoCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^RBAI-[A-F0-9]{48}$/.test(code) ? code : null;
}

export const hashAppSumoCode = (code: string): string => createHash("sha256").update(code).digest("hex");
