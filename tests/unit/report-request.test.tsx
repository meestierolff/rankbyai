import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VARIANTS } from "@/app/dev/report-preview/fixtures";
import { ReportBody } from "@/components/report/report-body";
import { requestMailto } from "@/components/report/request";
import type { ReportView } from "@/components/report/types";
import { COUNTRIES } from "@/lib/countries";

const SITE = "https://rankbyai.live";
const URL_ = `${SITE}/r/abc123`;
const base: ReportView["business"] = { name: "Acme Dental", city: "Austin", region: "TX", category: "Dentist", country: null, lat: null, lng: null, language: null };

/** The parts of a mailto href, decoded. */
function parse(href: string) {
  const [to, query] = href.slice("mailto:".length).split("?");
  const params = Object.fromEntries(query.split("&").map((kv) => kv.split("=").map(decodeURIComponent)));
  return { to, subject: params.subject as string, body: params.body as string, raw: href };
}
const TIMING = /\b(hours?|same day|today|tomorrow|within|days?|weeks?|soon|asap)\b/i;

describe("request a country or language (mailto)", () => {
  it("names the country and the report for a business in Germany", () => {
    const m = parse(requestMailto({ ...base, country: "DE", language: "German" }, URL_));
    expect(m.raw.startsWith("mailto:mees@rankbyai.live?")).toBe(true);
    expect(m.to).toBe("mees@rankbyai.live");
    expect(m.subject).toBe("Country/language request: Acme Dental");
    expect(m.body).toContain("Country on the report: Germany (DE)");
    expect(m.body).toContain("Language on the report: German");
    expect(m.body).toContain("Report: https://rankbyai.live/r/abc123");
    expect(m.body).toContain("City/region: Austin, TX");
    // Spaces are %20, never "+", so mail clients show the subject as written.
    expect(m.raw).not.toContain("+");
  });

  it("names the United States for a US business with English", () => {
    const m = parse(requestMailto({ ...base, country: "US", language: "English" }, URL_));
    expect(m.body).toContain("Country on the report: United States (US)");
    expect(m.body).toContain("Language on the report: English");
  });

  it("with no country set, still opens the mail and does not guess one", () => {
    const m = parse(requestMailto({ ...base, city: null, region: null }, URL_));
    expect(m.raw.startsWith("mailto:mees@rankbyai.live")).toBe(true);
    expect(m.body).toContain("Country on the report: not set on this report");
    expect(m.body).toContain("/r/abc123");
    for (const c of COUNTRIES) expect(m.body).not.toContain(c.name);
    expect(m.body).not.toContain("Language on the report");
    expect(m.body).not.toContain("City/region");
  });

  it("makes no timing promise", () => {
    for (const country of ["DE", null]) {
      const m = parse(requestMailto({ ...base, country }, URL_));
      expect(m.subject).not.toMatch(TIMING);
      expect(m.body).not.toMatch(TIMING);
    }
  });
});

describe("request link on the report page", () => {
  const LINK = "data-request-country";
  const page = (view: ReportView, reportPath?: string) => renderToStaticMarkup(<ReportBody view={view} pdfHref="/r/abc123/pdf" siteUrl={SITE} reportPath={reportPath} />);

  it("shows on a first-party RankbyAI report, as a print-hidden mailto", () => {
    const html = page(VARIANTS.full.build(), "/r/abc123");
    expect(html).toContain(LINK);
    expect(html).toContain("Request a country or language");
    expect(html).toMatch(/data-request-country[^>]*print:hidden/);
    expect(html).toContain('href="mailto:mees@rankbyai.live?subject=');
    expect(html).toContain(encodeURIComponent("Country on the report: United States (US)"));
    expect(html).not.toMatch(/10 hours|same day/i);
  });

  it("is absent on an agency-branded, an unbranded, or an address-less report", () => {
    const agency = VARIANTS.full.build();
    expect(page({ ...agency, brand: { ...agency.brand, name: "Brightline Local" } }, "/r/abc123")).not.toContain(LINK);
    expect(page({ ...agency, brand: { ...agency.brand, name: null, hideRankbyai: true } }, "/r/abc123")).not.toContain(LINK);
    expect(page(VARIANTS["white-label"].build(), "/r/abc123")).not.toContain(LINK);
    // The free check and other callers pass no report address.
    expect(page(VARIANTS.free.build())).not.toContain(LINK);
  });
});
