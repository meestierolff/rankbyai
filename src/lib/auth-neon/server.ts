import "server-only";
import { createNeonAuth } from "@neon/auth/next/server";
import { MissingEnvError } from "@/lib/env";

/** Neon Auth (managed Better Auth): Google sign-in, sessions in signed cookies. */
export const isAuthConfigured = () => !!process.env.NEON_AUTH_BASE_URL && (process.env.NEON_AUTH_COOKIE_SECRET ?? "").length >= 32;

let instance: ReturnType<typeof createNeonAuth> | undefined;

export function neonAuth() {
  if (instance) return instance;
  const missing = [
    ...(process.env.NEON_AUTH_BASE_URL ? [] : ["NEON_AUTH_BASE_URL"]),
    ...((process.env.NEON_AUTH_COOKIE_SECRET ?? "").length >= 32 ? [] : ["NEON_AUTH_COOKIE_SECRET (at least 32 characters)"]),
  ];
  if (missing.length) throw new MissingEnvError("sign-in", missing);
  instance = createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
    logLevel: "warn",
  });
  return instance;
}
