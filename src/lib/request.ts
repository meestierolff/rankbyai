import "server-only";

/**
 * Client IP for rate limiting. On Vercel the platform sets these headers and overwrites any
 * client-supplied value; the right-most x-forwarded-for entry is the one added by the closest proxy.
 */
export function clientIp(headers: Headers): string {
  const vercel = headers.get("x-vercel-forwarded-for") ?? headers.get("x-real-ip");
  if (vercel) return vercel.split(",")[0].trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}
