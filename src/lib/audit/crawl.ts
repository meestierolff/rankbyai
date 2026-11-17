import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as pinnedFetch } from "undici";

/**
 * Fetches a business website for the audit (brief 7.4): the homepage plus up to 20 internal URLs,
 * with a respectful User-Agent, a 10 s timeout and a 2 MB cap per page.
 *
 * The URL comes from a Google listing or from the user, so every request is treated as hostile
 * input (SSRF): only http/https on default ports, the host must resolve to public addresses only,
 * and redirects are followed by hand so each hop is checked the same way.
 */
const UA = "RankbyAI-Audit/1.0 (+https://rankbyai.live/disclaimer)";
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff")) return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return x.startsWith("64:ff9b:") || x.startsWith("2001:db8:");
  }
  return true; // not an IP at all
}

/** Throws unless the URL is a plain public web address. Returns the parsed URL. */
export async function assertPublicUrl(raw: string, resolve: (host: string) => Promise<string[]> = defaultResolve): Promise<URL> {
  return (await resolvePublic(raw, resolve)).url;
}

/** Same check, also returning the addresses that were validated so the connection can be pinned to them. */
export async function resolvePublic(raw: string, resolve: (host: string) => Promise<string[]> = defaultResolve): Promise<{ url: URL; addresses: string[] }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("only http and https are allowed");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) throw new Error("non-standard ports are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("internal host names are not allowed");
  const addresses = isIP(host) ? [host] : await resolve(host);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("the host resolves to a private or reserved address");
  return { url, addresses };
}

async function defaultResolve(host: string): Promise<string[]> {
  try {
    return (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    return [];
  }
}

export interface FetchedPage {
  url: string;
  status: number;
  html: string;
}

/** GET one page with manual, re-validated redirects. Returns null on any failure (the check becomes "not checked"). */
export async function fetchPage(raw: string, accept = "text/html"): Promise<FetchedPage | null> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let url: URL;
    let addresses: string[];
    try {
      ({ url, addresses } = await resolvePublic(current));
    } catch {
      return null;
    }
    // Pin the connection to the addresses we just validated. Without this, a hostile DNS server could
    // answer "public" for the check and "internal" for the connection (DNS rebinding).
    const agent = new Agent({
      connect: {
        lookup: (_host, opts, cb) => {
          const list = addresses.map((address) => ({ address, family: isIP(address) }));
          // Node asks for all addresses (autoSelectFamily) or for a single one, depending on the version.
          const reply = cb as unknown as (err: Error | null, a: unknown, family?: number) => void;
          if ((opts as { all?: boolean }).all) reply(null, list);
          else reply(null, list[0].address, list[0].family);
        },
      },
    });
    let res: Awaited<ReturnType<typeof pinnedFetch>>;
    try {
      res = await pinnedFetch(url, { headers: { "User-Agent": UA, Accept: `${accept},*/*;q=0.5` }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), dispatcher: agent });
    } catch {
      void agent.close().catch(() => {});
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      current = new URL(loc, url).toString();
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/(text\/|application\/(xhtml|xml|json))/i.test(type)) return { url: url.toString(), status: res.status, html: "" };
    const reader = res.body?.getReader();
    if (!reader) return { url: url.toString(), status: res.status, html: "" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    void reader.cancel().catch(() => {});
    return { url: url.toString(), status: res.status, html: Buffer.concat(chunks).subarray(0, MAX_BYTES).toString("utf8") };
  }
  return null;
}

// ───────────────────────── HTML facts ─────────────────────────

export interface PageFacts {
  url: string;
  title: string | null;
  h1: string[];
  headings: string[];
  phones: string[];
  hasTelLink: boolean;
  hasMapEmbed: boolean;
  hasFaqSection: boolean;
  jsonLdTypes: string[];
  localBusiness: { type: string; name: string | null; telephone: string | null; address: string | null } | null;
  hasFaqSchema: boolean;
  links: string[];
  navLabels: string[];
  text: string;
}

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

const LOCAL_TYPES = /LocalBusiness|Dentist|Plumber|Restaurant|Store|MedicalBusiness|LegalService|HomeAndConstructionBusiness|AutoRepair|HealthAndBeautyBusiness|ProfessionalService|Physician|Attorney|RealEstateAgent|Electrician|HVACBusiness|RoofingContractor|Locksmith|VeterinaryCare|BeautySalon|HairSalon|DaySpa|GeneralContractor|AccountingService|InsuranceAgency|TravelAgency|FoodEstablishment|LodgingBusiness|SportsActivityLocation|EmergencyService|AnimalShelter|ChildCare|DryCleaningOrLaundry|FinancialService|InternetCafe|Library|MovingCompany|PestControl|SelfStorage|TouristInformationCenter/;

function collectLd(node: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(node)) node.forEach((n) => collectLd(n, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o["@type"]) out.push(o);
    if (o["@graph"]) collectLd(o["@graph"], out);
  }
}

export function extractFacts(url: string, html: string): PageFacts {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const tags = (tag: string) => [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => strip(m[1])).filter(Boolean);
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = strip(body).slice(0, 20_000);

  const ld: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectLd(JSON.parse(m[1].trim()), ld);
    } catch {
      // malformed JSON-LD is simply not counted
    }
  }
  const typesOf = (o: Record<string, unknown>) => (Array.isArray(o["@type"]) ? (o["@type"] as string[]) : [String(o["@type"])]);
  const jsonLdTypes = [...new Set(ld.flatMap(typesOf))];
  const lb = ld.find((o) => typesOf(o).some((t) => LOCAL_TYPES.test(t)));
  const addr = lb?.address as Record<string, unknown> | string | undefined;

  const telLinks = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => decodeURIComponent(m[1]));
  const phonePattern = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;
  const phones = [...new Set([...telLinks, ...(text.match(phonePattern) ?? [])].map((p) => p.trim()).filter((p) => p.replace(/\D/g, "").length >= 9 && p.replace(/\D/g, "").length <= 13))].slice(0, 10);

  const anchors = [...html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const origin = new URL(url).origin;
  const links = [...new Set(anchors.map((m) => {
    try {
      const u = new URL(m[1], url);
      return u.origin === origin && !/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|css|js)$/i.test(u.pathname) ? u.origin + u.pathname.replace(/\/$/, "") : null;
    } catch {
      return null;
    }
  }).filter((x): x is string => !!x))].slice(0, 200);
  const nav = html.match(/<nav[\s\S]*?<\/nav>/gi)?.join(" ") ?? "";
  const navLabels = [...new Set([...nav.matchAll(/<a\s[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => strip(m[1])).filter((l) => l.length > 2 && l.length < 60))].slice(0, 60);
  const headings = [...tags("h2"), ...tags("h3")].slice(0, 80);

  return {
    url,
    title: title ? strip(title) : null,
    h1: tags("h1").slice(0, 5),
    headings,
    phones,
    hasTelLink: telLinks.length > 0,
    hasMapEmbed: /<iframe[^>]+src=["'][^"']*(google\.[a-z.]+\/maps|maps\.google\.|openstreetmap\.org|mapbox\.com|bing\.com\/maps)/i.test(html),
    hasFaqSection: jsonLdTypes.includes("FAQPage") || /\b(faqs?|frequently asked questions?)\b/i.test([...tags("h1"), ...headings].join(" | ")),
    jsonLdTypes,
    localBusiness: lb
      ? {
          type: typesOf(lb).find((t) => LOCAL_TYPES.test(t)) ?? "LocalBusiness",
          name: typeof lb.name === "string" ? lb.name : null,
          telephone: typeof lb.telephone === "string" ? lb.telephone : null,
          address: typeof addr === "string" ? addr : addr ? [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(", ") : null,
        }
      : null,
    hasFaqSchema: jsonLdTypes.includes("FAQPage"),
    links,
    navLabels,
    text,
  };
}

export interface SiteCrawl {
  home: PageFacts | null;
  pages: PageFacts[];
  hasLlmsTxt: boolean | null;
  fetched: number;
}

/**
 * Homepage + up to `maxPages` internal pages (from the sitemap, else from homepage links). Sequential and gentle.
 * `deadline` (epoch ms) is a wall-clock budget: a slow site ends the crawl early and the pages read so far are kept.
 */
export async function crawlSite(website: string, maxPages = 20, deadline = Date.now() + 75_000): Promise<SiteCrawl> {
  const start = website.startsWith("http") ? website : `https://${website}`;
  const homePage = await fetchPage(start);
  if (!homePage || !homePage.html) return { home: null, pages: [], hasLlmsTxt: null, fetched: 0 };
  const home = extractFacts(homePage.url, homePage.html);
  const origin = new URL(homePage.url).origin;

  let candidates: string[] = [];
  const sitemap = await fetchPage(`${origin}/sitemap.xml`, "application/xml");
  if (sitemap?.status === 200 && sitemap.html) {
    candidates = [...sitemap.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).filter((u) => u.startsWith(origin) && !/\.xml(\?|$)/i.test(u));
  }
  if (candidates.length === 0) candidates = home.links;
  const seen = new Set([homePage.url.replace(/\/$/, ""), origin]);
  const pages: PageFacts[] = [];
  for (const u of candidates) {
    if (pages.length >= maxPages || Date.now() > deadline) break;
    const key = u.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const p = await fetchPage(u);
    if (p?.status === 200 && p.html) pages.push(extractFacts(p.url, p.html));
  }
  // Past the deadline the llms.txt check is skipped and reported as "not checked", never as "missing".
  const llms = Date.now() > deadline ? null : await fetchPage(`${origin}/llms.txt`, "text/plain");
  const hasLlmsTxt = llms ? llms.status === 200 && llms.html.trim().length > 0 && !/<html/i.test(llms.html.slice(0, 500)) : null;
  return { home, pages, hasLlmsTxt, fetched: 1 + pages.length };
}
