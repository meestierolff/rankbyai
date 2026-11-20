import "server-only";
import { fetch as pinnedFetch } from "undici";
import { pinnedAgent, resolvePublic } from "@/lib/audit/crawl";

const MAX_BYTES = 5 * 1024;
const TIMEOUT_MS = 5000;

/**
 * Reads a Client ID Metadata Document. The URL is chosen by whoever starts an authorization request,
 * so it is hostile input (SSRF): https on port 443 only, a host that resolves to public addresses
 * only (the connection is pinned to them), no redirects, JSON only, at most 5 KB, 5 seconds.
 * Returns the parsed JSON, or null on any failure.
 */
export async function fetchClientMetadataDocument(raw: string): Promise<unknown> {
  let url: URL;
  let addresses: string[];
  try {
    ({ url, addresses } = await resolvePublic(raw));
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const agent = pinnedAgent(addresses);
  try {
    const res = await pinnedFetch(url, {
      headers: { Accept: "application/json", "User-Agent": "RankbyAI-OAuth/1.0 (+https://rankbyai.live/support)" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      dispatcher: agent,
    });
    if (res.status !== 200 || !/application\/(.+\+)?json/i.test(res.headers.get("content-type") ?? "")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      size += value.length;
      if (size > MAX_BYTES) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return null;
  } finally {
    void agent.close().catch(() => {});
  }
}
