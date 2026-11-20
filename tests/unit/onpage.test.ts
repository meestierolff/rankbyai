import { describe, expect, it } from "vitest";
import { extractFacts } from "@/lib/audit/crawl";
import { namesService, root, serviceRoots } from "@/lib/audit/onpage";

describe("does a text name the service?", () => {
  it("matches by word root, the way people write service pages", () => {
    expect(root("plumber")).toBe(root("plumbing"));
    expect(root("dentist")).toBe(root("dental"));
    expect(root("dentistry")).toBe(root("dentists"));
    expect(namesService("electrician", ["Electrical repairs in Leeds"])).toBe(true);
    expect(namesService("chiropractor", ["Chiropractic care"])).toBe(true);
    expect(namesService("teeth whitening", ["Whiten your teeth"])).toBe(true);
  });

  it("needs every specific word, but not the word for the kind of business", () => {
    expect(namesService("emergency plumber", ["Plumbing services"])).toBe(false);
    expect(namesService("emergency plumber", ["24/7 emergency plumbing"])).toBe(true);
    expect(serviceRoots("seo agency")).toEqual(["seo"]);
    expect(namesService("seo agency", ["SEO services for small businesses"])).toBe(true);
    expect(serviceRoots("dental clinic")).toEqual([root("dental")]);
    expect(serviceRoots("agency")).toEqual(["agency"]); // nothing more specific: the word itself counts
  });

  it("ignores filler like 'best ... near me'", () => {
    expect(serviceRoots("best dentist near me")).toEqual([root("dentist")]);
    expect(namesService("near me", ["anything"])).toBe(false);
  });
});

describe("page facts for the money-page checks", () => {
  it("decodes HTML entities in headings and text", () => {
    const f = extractFacts("https://x.example/", "<h1>Tom&#x27;s Plumbing &amp; Heating</h1><h2>What&#39;s included?</h2><p>Everything &mdash; parts &amp; labour.</p>");
    expect(f.h1).toEqual(["Tom's Plumbing & Heating"]);
    expect(f.h2Sections[0].heading).toBe("What's included?");
  });

  it("reads the opening from the H1 on, without the menu or the footer", () => {
    const f = extractFacts("https://x.example/", `<nav><a href="/">Home</a><h2>Menu</h2></nav><header><h1>Plumber in Leeds</h1></header><p>Fast, local plumbing in Leeds. Call any time.</p>
      <h2>Prices</h2><ul><li>Call-out from a fixed fee</li></ul><h3>Extras</h3><footer><h2>Contact</h2></footer>`);
    expect(f.intro.startsWith("Plumber in Leeds Fast, local plumbing in Leeds.")).toBe(true);
    expect(f.h2Sections).toEqual([{ heading: "Prices", opening: "Call-out from a fixed fee", words: 5 }]);
  });
});
