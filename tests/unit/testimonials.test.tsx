import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Testimonials, publishableTestimonials } from "@/components/marketing/testimonials";
import { testimonials, type Testimonial } from "@/data/testimonials";

// Made up for this test only. It must never be copied into src/data/testimonials.ts.
const VALID: Testimonial = {
  name: "Test Person",
  role: "Owner",
  company: "Fixture Agency",
  quote: "A quote that exists only inside this unit test.",
  consentDate: "2026-11-24",
  url: "https://fixture-agency.example/",
};

describe("homepage testimonials", () => {
  it("ships an empty data file, so the section does not render at all", () => {
    expect(testimonials).toEqual([]);
    expect(renderToStaticMarkup(<Testimonials />)).toBe("");
    expect(renderToStaticMarkup(<Testimonials items={[]} />)).toBe("");
  });

  it("renders one valid quote with its attribution, and links a safe URL", () => {
    const html = renderToStaticMarkup(<Testimonials items={[VALID]} />);
    expect(html).toContain('id="testimonials"');
    expect(html).toContain("What agencies say");
    expect(html).toContain("<blockquote");
    expect(html).toContain(VALID.quote);
    expect(html).toContain("Test Person");
    expect(html).toContain("Owner, Fixture Agency");
    expect(html).toContain('href="https://fixture-agency.example/"');
  });

  it("skips a row without a name, quote or real consent date, and never fills one in", () => {
    const rows: Testimonial[] = [
      { ...VALID, consentDate: "" },
      { ...VALID, quote: "  " },
      { ...VALID, name: "" },
      { ...VALID, consentDate: "soon" },
      { ...VALID, consentDate: "2026-02-30" },
    ];
    expect(publishableTestimonials(rows)).toEqual([]);
    expect(renderToStaticMarkup(<Testimonials items={rows} />)).toBe("");
    // A skipped row next to a valid one: only the valid quote appears.
    const html = renderToStaticMarkup(<Testimonials items={[{ ...VALID, name: "Skipped Person", consentDate: "" }, VALID]} />);
    expect(html).toContain("Test Person");
    expect(html).not.toContain("Skipped Person");
  });

  it("renders the name as plain text when the URL is missing or not http(s)", () => {
    for (const url of [undefined, "javascript:alert(1)", "not a url"]) {
      const html = renderToStaticMarkup(<Testimonials items={[{ ...VALID, url }]} />);
      expect(html).toContain("Test Person");
      expect(html).not.toContain("<a ");
    }
  });

  it("the homepage places the section between How it works and Pricing", () => {
    const page = readFileSync("src/app/(marketing)/page.tsx", "utf8");
    const how = page.indexOf("<HowItWorks");
    const quotes = page.indexOf("<Testimonials />");
    const pricing = page.indexOf("<Pricing ");
    expect(how).toBeGreaterThan(-1);
    expect(quotes).toBeGreaterThan(how);
    expect(pricing).toBeGreaterThan(quotes);
  });
});
