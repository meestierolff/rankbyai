/** Matching a business against names in AI answers and Maps results (brief 6.1, 6.5). */

const SUFFIXES = new Set(["llc", "inc", "ltd", "limited", "co", "corp", "company", "pllc", "pc", "plc", "lp", "llp", "the", "and"]);

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !SUFFIXES.has(t))
    .join(" ");
}

export function normalizeDomain(urlOrDomain: string | null | undefined): string | null {
  if (!urlOrDomain) return null;
  try {
    const host = urlOrDomain.includes("://") ? new URL(urlOrDomain).hostname : urlOrDomain.split("/")[0];
    return host.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export const normalizePhone = (phone: string | null | undefined): string | null => {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array<boolean>(a.length).fill(false);
  const bm = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(b.length - 1, i + range);
    for (let j = lo; j <= hi; j++) {
      if (!bm[j] && a[i] === b[j]) {
        am[i] = bm[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

export interface BusinessIdentity {
  name: string;
  website?: string | null;
  phone?: string | null;
  cid?: string | null;
  placeId?: string | null;
}

/** Same business by name: Jaro-Winkler ≥ 0.9 on normalised names, or one name's words all inside the other. */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (jaroWinkler(na, nb) >= 0.9) return true;
  const ta = na.split(" ");
  const tb = nb.split(" ");
  const [short, long] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return short.length >= 2 && short.every((t) => long.has(t));
}

/** 1-based position of the business in an ordered list of names, or null. */
export function positionInNames(names: string[], business: BusinessIdentity): number | null {
  const idx = names.findIndex((n) => namesMatch(n, business.name));
  return idx === -1 ? null : idx + 1;
}

/** The answer mentions the business even if the list parser missed it (name, domain or phone in the text). */
export function mentionedInText(text: string, business: BusinessIdentity): boolean {
  const lower = text.toLowerCase();
  const domain = normalizeDomain(business.website);
  if (domain && lower.includes(domain)) return true;
  const phone = normalizePhone(business.phone);
  if (phone && text.replace(/\D/g, "").includes(phone)) return true;
  const n = normalizeName(business.name);
  return n.length >= 6 && normalizeName(text).includes(n);
}

/** Find the business in Maps results: cid or place_id first, then name + domain. */
export function findInMaps<T extends { name: string; cid: string | null; placeId: string | null; domain: string | null; rank: number }>(items: T[], business: BusinessIdentity): T | null {
  if (business.cid) {
    const hit = items.find((i) => i.cid && i.cid === business.cid);
    if (hit) return hit;
  }
  if (business.placeId) {
    const hit = items.find((i) => i.placeId && i.placeId === business.placeId);
    if (hit) return hit;
  }
  const domain = normalizeDomain(business.website);
  const byName = items.filter((i) => namesMatch(i.name, business.name));
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) return byName.find((i) => domain && normalizeDomain(i.domain) === domain) ?? byName[0];
  return null;
}
