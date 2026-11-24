import { INDEX_PATH } from "./paths";

export const COUNTRIES = { us: "United States", uk: "United Kingdom", au: "Australia", nz: "New Zealand" } as const;
export type Country = keyof typeof COUNTRIES;
export type Agency = { position: number; name: string; domain: string };
export type IndexCity = { country: Country; city: string; slug: string; query: string; status: string; reason: string; agencies: Agency[]; sources: string[]; sourceDetails?: { title: string; url: string; domain: string }[]; sourceDomains?: string[]; parseNotes?: string; model?: string; collectedUtc?: string; collectedAmsterdam?: string };
export const cityPath = (city: IndexCity) => `${INDEX_PATH}/${city.country}/${city.slug}`;
/** Ignore non-web schemes even if an upstream source contains one. Empty domains stay empty. */
export function webUrl(value: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) && url.hostname.includes(".") ? url.href : undefined;
  } catch { return undefined; }
}
