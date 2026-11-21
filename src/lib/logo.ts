import "server-only";

/**
 * The workspace logo for a rendered file (the report PDF, the pitch image). Brand fields are
 * owner-editable, so the URL is checked again here: only https (a signed storage URL) or an inline
 * PNG/JPEG data URI, only PNG or JPEG bytes, at most 2 MB, within 4 seconds. Anything else is no logo.
 */
export async function loadLogo(url: string | null): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  if (!url) return null;
  try {
    if (url.startsWith("data:")) {
      const m = url.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
      return m ? { data: Buffer.from(m[2], "base64"), format: m[1].toLowerCase() === "png" ? "png" : "jpg" } : null;
    }
    if (!/^https:\/\//i.test(url)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/image\/(png|jpe?g)/i.test(type)) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length && data.length < 2_000_000 ? { data, format: /png/i.test(type) ? "png" : "jpg" } : null;
  } catch {
    return null;
  }
}

/** The logo as a data URI an image renderer can embed without fetching anything itself. */
export async function logoDataUri(url: string | null): Promise<string | null> {
  const logo = await loadLogo(url);
  return logo ? `data:image/${logo.format === "png" ? "png" : "jpeg"};base64,${logo.data.toString("base64")}` : null;
}
