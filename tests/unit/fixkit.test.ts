import { describe, expect, it } from "vitest";
import type { CheckResult } from "@/lib/audit/checks";
import { buildChecklist, faqJsonLd, grounded, llmsTxt, localBusinessJsonLd, schemaTypeFor, sourceMaterial } from "@/lib/audit/fixkit";
import type { StoredAuditInputs } from "@/lib/audit/run";
import type { BusinessInfo } from "@/lib/providers/dataforseo";

const profile = (over: Partial<BusinessInfo> = {}): BusinessInfo => ({
  name: "Northgate Family Dental", description: null, category: "Dental clinic", additionalCategories: [], cid: "1", placeId: null,
  address: "100 North Loop Blvd, Austin, TX 78751", addressParts: { street: "100 North Loop Blvd", city: "Austin", region: "Texas", zip: "78751", country: "US" },
  phone: "+1 512-555-0174", url: "https://northgate.example", domain: "northgate.example", totalPhotos: 12, rating: 4.4, reviews: 38, isClaimed: true, hasHours: true, attributes: [], lat: 30.31, lng: -97.72, ...over,
});

const check = (key: string, status: CheckResult["status"], title = key, fix = "Do it."): CheckResult => ({ key, category: "profile", status, priority: "P2", title, evidence: [], fix, impact: "" });

const inputs = (over: Partial<StoredAuditInputs> = {}): StoredAuditInputs => ({
  service: "dentist", months: 3, checks: [], competitors: [], profile: profile(), site: { url: "https://northgate.example", pagesRead: 3, hasLlmsTxt: false, pageTitles: [], homeText: "We have cared for Austin families since 1998.", headings: ["Family dentistry"] },
  services: [{ service: "Teeth Cleaning", url: "https://northgate.example/services/teeth-cleaning" }], ai: null, pagePlan: null, serviceMethod: "heuristic", mapsKeyword: null, ...over,
});

/** The properties Google's structured-data documentation requires or recommends for these types. */
function assertValidLocalBusiness(ld: Record<string, unknown>) {
  expect(ld["@context"]).toBe("https://schema.org");
  expect(typeof ld["@type"]).toBe("string");
  expect(typeof ld.name).toBe("string");
  expect(ld.address).toBeTruthy();
  if (typeof ld.address === "object") expect((ld.address as Record<string, unknown>)["@type"]).toBe("PostalAddress");
  // No empty values anywhere: a validator flags null and "" as errors.
  const walk = (v: unknown): void => {
    if (v && typeof v === "object") Object.values(v).forEach(walk);
    else expect(v === null || v === "" || v === undefined).toBe(false);
  };
  walk(ld);
}

describe("schema type", () => {
  it("maps Google categories to real schema.org subtypes and falls back to LocalBusiness", () => {
    expect(schemaTypeFor("Dental clinic")).toBe("Dentist");
    expect(schemaTypeFor("Emergency plumber")).toBe("Plumber");
    expect(schemaTypeFor("Air conditioning contractor")).toBe("HVACBusiness");
    expect(schemaTypeFor("Personal injury attorney")).toBe("Attorney");
    expect(schemaTypeFor("Italian restaurant")).toBe("Restaurant");
    expect(schemaTypeFor("Escape room center")).toBe("LocalBusiness");
    expect(schemaTypeFor(null)).toBe("LocalBusiness");
  });
});

describe("LocalBusiness JSON-LD", () => {
  it("uses name, address and phone from the Google profile", () => {
    const ld = localBusinessJsonLd({ name: "Northgate", website: "https://northgate.example", profile: profile(), fallback: { phone: null, address: null, category: null }, description: "A dental practice in Austin." });
    assertValidLocalBusiness(ld);
    expect(ld).toMatchObject({ "@type": "Dentist", name: "Northgate Family Dental", telephone: "+1 512-555-0174", description: "A dental practice in Austin.", address: { streetAddress: "100 North Loop Blvd", postalCode: "78751" } });
  });

  it("leaves out anything it has no real value for", () => {
    const ld = localBusinessJsonLd({ name: "Northgate", website: null, profile: profile({ addressParts: null, phone: null, url: null, lat: null, lng: null }), fallback: { phone: null, address: null, category: null }, description: null });
    assertValidLocalBusiness(ld);
    expect(Object.keys(ld).sort()).toEqual(["@context", "@type", "address", "name"]);
    expect(ld.address).toBe("100 North Loop Blvd, Austin, TX 78751");
  });

  it("never adds ratings or opening hours (we do not have verified values for them)", () => {
    const ld = localBusinessJsonLd({ name: "Northgate", website: null, profile: profile(), fallback: { phone: null, address: null, category: null }, description: null });
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|openingHours|review/i);
  });

  it("works without a profile, from the business record", () => {
    const ld = localBusinessJsonLd({ name: "Corner Plumbing", website: "https://corner.example", profile: null, fallback: { phone: "+44 20 7946 0000", address: "1 High St, London", category: "Plumber" }, description: null });
    assertValidLocalBusiness(ld);
    expect(ld).toMatchObject({ "@type": "Plumber", name: "Corner Plumbing", telephone: "+44 20 7946 0000", address: "1 High St, London" });
  });
});

describe("FAQPage JSON-LD", () => {
  it("has one Question with an accepted Answer per FAQ", () => {
    const ld = faqJsonLd([{ question: "Do you take new patients?", answer: "Yes." }, { question: "Where are you?", answer: "In Austin." }])!;
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("FAQPage");
    const main = ld.mainEntity as { "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } }[];
    expect(main).toHaveLength(2);
    for (const q of main) {
      expect(q["@type"]).toBe("Question");
      expect(q.name.length).toBeGreaterThan(0);
      expect(q.acceptedAnswer).toMatchObject({ "@type": "Answer" });
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(0);
    }
  });
  it("is omitted when there are no FAQs", () => expect(faqJsonLd([])).toBeNull());
});

describe("grounding", () => {
  const source = "Open since 1998. 3 dentists. Call +1 512-555-0174.";
  it("accepts text whose numbers are all in the source", () => {
    expect(grounded("We have 3 dentists and opened in 1998.", source)).toBe(true);
    expect(grounded("We welcome new patients.", source)).toBe(true);
  });
  it("rejects text with a number the source does not contain", () => {
    expect(grounded("Over 25 years of experience.", source)).toBe(false);
    expect(grounded("Rated 4.9 by 300 patients.", source)).toBe(false);
  });
  it("the source material holds only profile and website facts", () => {
    const text = sourceMaterial(inputs(), { name: "Northgate Family Dental", city: "Austin" });
    expect(text).toContain("since 1998");
    expect(text).toContain("SERVICES WITH A PAGE: Teeth Cleaning");
    expect(text).not.toMatch(/reviews|rating|38|4\.4/i); // review counts are not offered to the model
  });
});

describe("llms.txt draft", () => {
  it("lists contact details and only links found on the site", () => {
    const txt = llmsTxt({ name: "Northgate Family Dental", category: "Dentist", city: "Austin", description: null, phone: "+1 512-555-0174", address: "100 North Loop Blvd", website: "https://northgate.example",
      services: [{ service: "Teeth Cleaning", url: "https://northgate.example/services/teeth-cleaning" }], pages: [{ url: "https://northgate.example/about", title: "About us" }, { url: "https://northgate.example/x", title: null }] });
    expect(txt.startsWith("# Northgate Family Dental\n\n> Dentist in Austin\n")).toBe(true);
    expect(txt).toContain("- [Teeth Cleaning](https://northgate.example/services/teeth-cleaning)");
    expect(txt).toContain("- [About us](https://northgate.example/about)");
    expect(txt).not.toContain("/x)");
    expect(txt.endsWith("\n")).toBe(true);
  });
});

describe("checklist", () => {
  it("comes from failed checks, cited sources and the page plan, and from nothing else", () => {
    const list = buildChecklist(inputs({
      checks: [check("description", "fail", "The profile has no description"), check("hours", "pass"), check("faq_schema", "fail", "No FAQPage schema on the homepage"), check("photos", "not_checked")],
      ai: { scanDate: "2026-11-17", points: 9, engines: [], namedInstead: [], sharedSources: [{ domain: "yelp.com", engines: 2 }], competitorOnlySources: ["austinmonthly.com", "yelp.com"] },
      pagePlan: { services: ["Teeth Cleaning", "Invisalign"], areas: ["Hyde Park", "Rosedale"], radiusMiles: 10, pagesHave: 3 },
    }), "Northgate Family Dental");
    expect(list.filter((i) => i.group === "Google profile").map((i) => i.text)).toEqual(["The profile has no description. Do it."]);
    expect(list.filter((i) => i.group === "Website").map((i) => i.text)).toEqual(["No FAQPage schema on the homepage. Do it."]);
    expect(list.filter((i) => i.group === "Get listed").map((i) => i.url)).toEqual(["https://yelp.com", "https://austinmonthly.com"]);
    expect(list.filter((i) => i.group === "Pages to build").map((i) => i.text)).toEqual([
      "Teeth Cleaning in Hyde Park | Northgate Family Dental (/teeth-cleaning-hyde-park)", "Teeth Cleaning in Rosedale | Northgate Family Dental (/teeth-cleaning-rosedale)",
      "Invisalign in Hyde Park | Northgate Family Dental (/invisalign-hyde-park)", "Invisalign in Rosedale | Northgate Family Dental (/invisalign-rosedale)",
    ]);
  });
  it("is empty when nothing failed and there is nothing to list", () => {
    expect(buildChecklist(inputs({ checks: [check("hours", "pass")] }), "X")).toEqual([]);
  });
});
