import type { PageFacts } from "./crawl";

/**
 * On-page helpers for the audit: which pages are about the audited service ("money pages"), and
 * whether a text names that service. Matching is by word root, so "plumber" finds "Emergency
 * Plumbing" and "dentist" finds "Dental Care", and every significant word of the service must be
 * there, so "emergency plumber" does not match a plain "Plumbing" page.
 */

const STOP = new Set(["a", "an", "and", "the", "in", "near", "me", "for", "of", "to", "my", "best", "top", "local", "service", "services", "company", "companies", "nearby"]);
const SUFFIXES = ["istry", "ists", "ings", "ing", "ers", "ist", "ery", "er", "ry", "al", "ic", "es", "s"];

/** The root of one word: lower case, accents and one common suffix removed, at least 4 letters kept. */
export function root(word: string): string {
  const w = word.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  for (const s of SUFFIXES) if (w.endsWith(s) && w.length - s.length >= 4) return w.slice(0, -s.length);
  return w;
}

const tokens = (s: string) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Words for the kind of business rather than the service ("seo agency", "dental clinic"). A page
 * about SEO rarely says "agency", so these are not required when a more specific word remains.
 */
const BUSINESS_KIND = new Set(["agency", "agencies", "firm", "firms", "clinic", "clinics", "practice", "office", "studio", "shop", "store", "center", "centre", "specialist", "specialists", "expert", "experts", "professional", "professionals", "provider", "providers", "contractor", "contractors", "consultant", "consultants"]);

/** The roots a page must contain to be about the service; empty when the service has no significant words. */
export function serviceRoots(service: string): string[] {
  const words = tokens(service).filter((t) => t.length >= 3 && !STOP.has(t.toLowerCase()));
  const specific = words.filter((t) => !BUSINESS_KIND.has(t.toLowerCase()));
  return [...new Set((specific.length ? specific : words).map(root))];
}

/** Whether the texts together name every significant word of the service. */
export function namesService(service: string, texts: (string | null | undefined)[]): boolean {
  const wanted = serviceRoots(service);
  if (!wanted.length) return false;
  const have = tokens(texts.filter(Boolean).join(" ")).map(root);
  return wanted.every((w) => have.some((h) => h === w || (h.length >= 4 && w.length >= 4 && (h.startsWith(w) || w.startsWith(h)))));
}

/** The words of a URL's path ("/emergency-plumbing/" → "emergency plumbing"). */
export const pathWords = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/[/_.-]+/g, " ").trim();
  } catch {
    return "";
  }
};

export const pathOf = (url: string) => {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
};

export type PageSummary = Pick<PageFacts, "url" | "title" | "h1" | "intro" | "h2Sections">;

/** Whether the page's address, title or H1 is about the service. */
export const pageIsAbout = (service: string, p: Pick<PageFacts, "url" | "title" | "h1">) => namesService(service, [pathWords(p.url), p.title, ...p.h1]);

/** The homepage plus up to four pages about the service: the pages that have to win the search. */
export function moneyPages(service: string, home: PageSummary, pages: PageSummary[]): PageSummary[] {
  return [home, ...pages.filter((p) => pageIsAbout(service, p)).slice(0, 4)];
}

/**
 * What counts as a direct answer under a subheading: the first two sentences hold something
 * (at least `minWords`) and stay short (at most `maxWords`), so a model that takes one passage
 * gets the answer. The check passes when at least `passShare` of the sections open that way.
 */
export const DIRECT_ANSWER = { sentences: 2, minWords: 5, maxWords: 50, passShare: 0.6 } as const;

export const isDirectAnswer = (s: { words: number }) => s.words >= DIRECT_ANSWER.minWords && s.words <= DIRECT_ANSWER.maxWords;

/**
 * Whether an H2 is a content section at all. A one-word heading with nothing under it is a widget
 * or a label (a review badge's "Rated" and "4.6", a "Menu" toggle), not a section a reader or a
 * model would quote, so it is left out instead of counted as a missing answer. Measured on four
 * real sites on 20 Nov 2026: this removed the rating-badge headings and nothing else.
 */
export const isContentSection = (s: { heading: string; words: number }) => s.words > 0 || s.heading.trim().split(/\s+/).length >= 2;
