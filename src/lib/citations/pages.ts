import "server-only";
import { fetchPage } from "@/lib/audit/crawl";
import { isMockMode } from "@/lib/mock";
import type { BusinessIdentity } from "@/lib/scans/match";
import { pageFindings, type PageFindings } from "./page-text";

/**
 * Reading cited pages (citation workflow, step 2). Each page is fetched once with the audit's
 * fetcher (public addresses only, redirects re-checked hop by hop, 10 s and 2 MB per page, a
 * User-Agent that names RankbyAI). No vendor is paid for this.
 */
export interface PageRead extends PageFindings {
  http_status: number | null;
}

export async function readCitedPage(url: string, client: BusinessIdentity, competitors: readonly string[]): Promise<PageRead> {
  // Tests and local runs without vendors never reach out to third-party sites.
  if (isMockMode()) return { status: "failed", reason: "Not read in mock mode.", http_status: null, title: null, client_named: null, competitors_named: [] };
  const page = await fetchPage(url).catch(() => null);
  if (!page) return { status: "failed", reason: "The page did not answer.", http_status: null, title: null, client_named: null, competitors_named: [] };
  if (page.status >= 400 || !page.html) return { status: "failed", reason: `The page answered ${page.status}.`, http_status: page.status, title: null, client_named: null, competitors_named: [] };
  return { ...pageFindings(page.html, client, competitors), http_status: page.status };
}

export async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await worker(items[i++]);
  }));
}
