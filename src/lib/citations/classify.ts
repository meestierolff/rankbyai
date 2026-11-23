/**
 * Cited pages: one address per page, and what kind of page it probably is (citation workflow,
 * step 2). Pure. The kind comes from the address and the title only, with a confidence; it is a
 * reading aid, never a metric. No authority, rank or traffic figure is made up here.
 */

/** Query parameters that only say where a click came from. AI engines add some (utm_source=chatgpt.com). */
const TRACKING = /^(utm_[a-z_]+|gclid|gbraid|wbraid|fbclid|msclkid|mc_cid|mc_eid|ref|ref_src|srsltid|_hsenc|_hsmi|yclid|igshid)$/i;

export interface NormalizedUrl {
  /** The page's identity: host without "www.", path without a trailing slash, no tracking parameters or fragment. */
  key: string;
  /** The same address as a link (https or http as cited, tracking parameters removed). */
  url: string;
  /** Host without "www.". */
  domain: string;
}

export function normalizeUrl(raw: string): NormalizedUrl | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".")) return null;
  const domain = host.replace(/^www\./, "");
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.hash = "";
  u.hostname = host;
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : "";
  const query = u.searchParams.toString();
  const key = `${domain}${path}${query ? `?${query}` : ""}`;
  const url = `${u.protocol}//${host}${u.port ? `:${u.port}` : ""}${path || "/"}${query ? `?${query}` : ""}`;
  return { key, url, domain };
}

/** host is the domain or one of its subdomains. */
export const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/**
 * Local directories and review platforms: a business is listed there by claiming or submitting a
 * profile, not by an editor's choice. Matched on the domain and its subdomains.
 */
export const DIRECTORY_DOMAINS: readonly string[] = [
  // Global and US
  "yelp.com", "yellowpages.com", "bbb.org", "angi.com", "angieslist.com", "homeadvisor.com", "thumbtack.com", "houzz.com",
  "nextdoor.com", "tripadvisor.com", "foursquare.com", "mapquest.com", "manta.com", "superpages.com", "citysearch.com",
  "chamberofcommerce.com", "healthgrades.com", "zocdoc.com", "vitals.com", "ratemds.com", "webmd.com", "avvo.com",
  "justia.com", "findlaw.com", "lawyers.com", "martindale.com", "opentable.com", "porch.com", "bark.com", "trustpilot.com",
  "birdeye.com", "brownbook.net", "hotfrog.com", "cylex.us.com", "merchantcircle.com", "local.com", "expertise.com",
  "buildzoom.com", "care.com", "realself.com", "dentistry.com", "1-800-dentist.com", "loc8nearme.com",
  // UK and Ireland
  "yell.com", "checkatrade.com", "trustatrader.com", "ratedpeople.com", "mybuilder.com", "freeindex.co.uk", "thomsonlocal.com",
  "scoot.co.uk", "192.com", "cylex-uk.co.uk", "goldenpages.ie", "nhs.uk",
  // Australia, New Zealand, Canada
  "truelocal.com.au", "yellowpages.com.au", "hotfrog.com.au", "localsearch.com.au", "hipages.com.au", "healthengine.com.au",
  "whitecoat.com.au", "nocowboys.co.nz", "finda.co.nz", "yellow.co.nz", "builderscrack.co.nz", "yellowpages.ca", "canpages.ca",
  "411.ca", "homestars.com", "ratemds.ca",
  // Europe
  "gelbeseiten.de", "dasoertliche.de", "dastelefonbuch.de", "11880.com", "golocal.de", "jameda.de", "doctolib.de", "doctolib.fr",
  "pagesjaunes.fr", "paginasamarillas.es", "doctoralia.es", "paginegialle.it", "miodottore.it", "detelefoongids.nl",
  "telefoonboek.nl", "zorgkaartnederland.nl", "eniro.se", "hitta.se", "krak.dk", "gulesider.no", "pkt.pl", "znanylekarz.pl",
];

const FORUM_DOMAINS: readonly string[] = ["reddit.com", "quora.com", "stackexchange.com", "city-data.com", "mumsnet.com", "whirlpool.net.au", "boards.ie"];
const SOCIAL_DOMAINS: readonly string[] = ["facebook.com", "instagram.com", "x.com", "twitter.com", "linkedin.com", "youtube.com", "tiktok.com", "pinterest.com", "threads.net"];

export type PageType = "listicle" | "review" | "directory" | "official_site" | "forum" | "social" | "maps_listing" | "other";
export type Confidence = "high" | "medium" | "low";

export interface PageClass {
  type: PageType;
  confidence: Confidence;
  /** Whose site it is, for official_site: the business itself, or a named competitor. */
  owner?: "client" | "competitor";
  /** The competitor's name, for a competitor's own site. */
  competitor?: string;
  /** The rule that decided it, for the user. */
  why: string;
}

export interface ClassifyContext {
  /** The business's own site (domain, no www). */
  clientDomain?: string | null;
  /** Competitors' own sites: domain (no www) → name. */
  competitorDomains?: Readonly<Record<string, string>>;
}

const LIST_TITLE = /\b(\d{1,3}\s+best|best\s+\d{1,3}|best\b.{0,60}\b(in|near|for|of)\b|top\s*\d{1,3}\b|top[-\s]rated)/i;
const LIST_PATH = /(^|[/_-])(best|top-?\d{1,3}|top-rated|top_rated)([/_.-]|$)/i;
const REVIEW = /(^|[/_\s-])reviews?([/_\s.-]|$)/i;

function isMapsListing(host: string, path: string, query: string): boolean {
  if (host === "maps.app.goo.gl" || (host === "goo.gl" && path.startsWith("/maps"))) return true;
  if (/^maps\.google\./.test(host)) return true;
  if (/^(www\.)?google\.[a-z.]+$/.test(host) && (path.startsWith("/maps") || /(^|&)cid=/.test(query))) return true;
  return false;
}

export function classifyPage(page: { url: string; title?: string | null }, ctx: ClassifyContext = {}): PageClass {
  let u: URL;
  try {
    u = new URL(page.url);
  } catch {
    return { type: "other", confidence: "low", why: "The address could not be read." };
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = decodeURIComponent(u.pathname).toLowerCase();
  const title = (page.title ?? "").trim();

  if (isMapsListing(host, path, u.search.slice(1))) return { type: "maps_listing", confidence: "high", why: "A Google Maps place link (Gemini grounds its answers on Google Maps)." };
  const client = ctx.clientDomain?.toLowerCase().replace(/^www\./, "");
  if (client && onDomain(host, client)) return { type: "official_site", owner: "client", confidence: "high", why: "The business's own website." };
  for (const [domain, name] of Object.entries(ctx.competitorDomains ?? {})) {
    if (onDomain(host, domain.toLowerCase().replace(/^www\./, ""))) return { type: "official_site", owner: "competitor", competitor: name, confidence: "high", why: `${name}'s own website.` };
  }
  if (DIRECTORY_DOMAINS.some((d) => onDomain(host, d))) return { type: "directory", confidence: "high", why: "A known local directory or review platform." };
  if (FORUM_DOMAINS.some((d) => onDomain(host, d)) || /^(forums?|community|discuss)\./.test(host)) return { type: "forum", confidence: "high", why: "A forum or Q&A site." };
  if (SOCIAL_DOMAINS.some((d) => onDomain(host, d))) return { type: "social", confidence: "high", why: "A social network." };
  if (LIST_TITLE.test(title)) return { type: "listicle", confidence: "high", why: "The title reads as a ranked list (\"best\", \"top 10\")." };
  if (LIST_PATH.test(path)) return { type: "listicle", confidence: "medium", why: "The address reads as a ranked list (\"best\", \"top-10\"); the title was not checked." };
  if (REVIEW.test(path) || REVIEW.test(title)) return { type: "review", confidence: "medium", why: "The address or title mentions reviews." };
  return { type: "other", confidence: "low", why: "No rule matched." };
}
