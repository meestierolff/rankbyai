const PLACEHOLDER_ORIGIN = "https://placeholder.invalid";

/**
 * Post-login redirect target. Returns a same-site path, never an origin.
 * The value is normalised with the same URL parser the redirect uses, so tricks that rely on
 * parser differences ("//host", "/\\host", tabs or newlines inside the path) fall back to the default.
 * Absolute http(s) URLs contribute only their path, query and hash.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next) return fallback;
  const stripped = String(next).replace(/[\u0000-\u001f\u007f\s]/g, "");
  if (!stripped || stripped.includes("\\")) return fallback;
  let path: string;
  try {
    if (/^https?:\/\//i.test(stripped)) {
      const abs = new URL(stripped);
      path = abs.pathname + abs.search + abs.hash; // the origin is deliberately discarded
    } else {
      path = stripped;
    }
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    const u = new URL(path, PLACEHOLDER_ORIGIN);
    if (u.origin !== PLACEHOLDER_ORIGIN) return fallback;
    const out = u.pathname + u.search + u.hash;
    return out.startsWith("/") && !out.startsWith("//") ? out : fallback;
  } catch {
    return fallback;
  }
}
