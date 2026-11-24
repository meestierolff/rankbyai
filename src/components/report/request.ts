import { SUPPORT_EMAIL } from "@/lib/copy";
import { countryName, normalizeCountry } from "@/lib/countries";
import type { ReportView } from "./types";

/**
 * "Request a country or language" on a public report: a mailto to RankbyAI support, prefilled
 * from the report. No form, no server route. Nothing is guessed: a country that was never set is
 * said to be unset, and the mail makes no promise about when the check is done.
 *
 * Encoded with encodeURIComponent (RFC 6068): URLSearchParams would turn spaces into "+", which
 * mail clients show literally.
 */
export function requestMailto(business: ReportView["business"], reportUrl: string): string {
  const name = business.name?.trim() || null;
  const code = normalizeCountry(business.country);
  const country = code ? countryName(code) : null;
  const place = [business.city, business.region].map((s) => s?.trim()).filter(Boolean).join(", ");
  const lines = [
    "Hello,",
    "",
    "I would like RankbyAI to check a country or language for this report.",
    "",
    `Business: ${name ?? "(no name on the report)"}`,
    `Report: ${reportUrl}`,
    country ? `Country on the report: ${country} (${code})` : "Country on the report: not set on this report",
    ...(business.language ? [`Language on the report: ${business.language}`] : []),
    ...(place ? [`City/region: ${place}`] : []),
    "",
    "Country or language to check:",
    "",
  ];
  const subject = name ? `Country/language request: ${name}` : "Country/language request";
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\r\n"))}`;
}
