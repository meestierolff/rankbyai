import { mentionedInText, normalizeDomain, normalizeName, type BusinessIdentity } from "@/lib/scans/match";

/**
 * What a cited page says about the business and its competitors (citation workflow, step 2). Pure,
 * over the HTML RankbyAI fetched. A page whose text is too short to hold a list (a script-rendered
 * shell, a block or consent page) is "could not read", never "does not name you": an empty page
 * would otherwise look like a missing citation.
 */
export const MIN_READABLE_CHARS = 1_500;

export interface PageFindings {
  status: "ok" | "failed";
  /** Why the page could not be read, when it could not. */
  reason?: string;
  title: string | null;
  /** null: the name is too short to find safely in running text, and no link or phone matched. */
  client_named: boolean | null;
  competitors_named: string[];
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function pageText(html: string): string {
  return decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim().slice(0, 400_000);
}

export function pageTitle(html: string): string | null {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const clean = t ? decode(t).replace(/\s+/g, " ").trim() : "";
  return clean ? clean.slice(0, 300) : null;
}

/** Names shorter than this (after normalising) are not searched in running text: "Zen" would match anything. */
const MIN_NAME = 6;

export function pageFindings(html: string, client: BusinessIdentity, competitors: readonly string[]): PageFindings {
  const title = pageTitle(html);
  const text = pageText(html);
  if (text.length < MIN_READABLE_CHARS) return { status: "failed", reason: "The page returned too little text to read (it may be built by scripts or behind a check).", title, client_named: null, competitors_named: [] };
  const lowerHtml = html.toLowerCase();
  const domain = normalizeDomain(client.website);
  // A link to the business's own site counts as naming it, even where the anchor text differs.
  const linked = !!domain && lowerHtml.includes(domain);
  const inText = mentionedInText(text, client);
  const searchable = normalizeName(client.name).length >= MIN_NAME;
  const client_named = linked || inText ? true : searchable ? false : null;
  const competitors_named = competitors.filter((name) => normalizeName(name).length >= MIN_NAME && mentionedInText(text, { name }));
  return { status: "ok", title, client_named, competitors_named };
}
