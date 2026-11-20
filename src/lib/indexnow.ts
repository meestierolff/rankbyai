import "server-only";
import { publicEnv } from "@/lib/env";

/**
 * IndexNow: tells Bing (and the other engines that share IndexNow) that a page is new or changed,
 * so it is crawled within hours instead of days. Bing's index is what ChatGPT search and Copilot
 * draw on, so a regional page reaches them sooner.
 *
 * The key is public by design: engines confirm it by fetching /{key}.txt from this site
 * (public/b8fa8481ec2ebacdd9740bd23284e3a1.txt). Only this site's own URLs are ever sent.
 */
export const INDEXNOW_KEY = "b8fa8481ec2ebacdd9740bd23284e3a1";
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** The JSON body IndexNow expects for a list of this site's URLs. */
export function indexNowBody(siteUrl: string, urls: string[]) {
  const host = new URL(siteUrl).host;
  const own = [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
  return { host, key: INDEXNOW_KEY, keyLocation: `${siteUrl.replace(/\/$/, "")}/${INDEXNOW_KEY}.txt`, urlList: own.slice(0, 10_000) };
}

/**
 * Submits URLs on the production site only: previews and local runs never ping. Never throws; the
 * result is for logging. 200 and 202 both mean accepted.
 */
export async function pingIndexNow(urls: string[]): Promise<{ sent: number; status: number | null }> {
  if (process.env.VERCEL_ENV !== "production" || !urls.length) return { sent: 0, status: null };
  const body = indexNowBody(publicEnv.siteUrl, urls);
  if (!body.urlList.length) return { sent: 0, status: null };
  try {
    const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
    return { sent: body.urlList.length, status: res.status };
  } catch {
    return { sent: 0, status: null };
  }
}
