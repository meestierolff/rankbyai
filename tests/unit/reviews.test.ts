import { describe, expect, it } from "vitest";
import { googleReviewLink, mapsPlaceUrl, REVIEW_ASK, REVIEW_RULES } from "@/lib/reviews";

describe("review request kit", () => {
  it("builds the documented Maps URL from a place ID", () => {
    expect(mapsPlaceUrl("Tom's Plumbing & Heating", "ChIJsU30zM1qkFQRbnOm1_LBoG0")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Tom's%20Plumbing%20%26%20Heating&query_place_id=ChIJsU30zM1qkFQRbnOm1_LBoG0",
    );
  });

  it("accepts review links copied from a Google profile, and nothing else", () => {
    for (const ok of ["https://g.page/r/CbX9abc/review", "https://maps.app.goo.gl/abc123", "https://search.google.com/local/writereview?placeid=x", "https://www.google.co.uk/maps/place/x", "https://www.google.com.au/maps"]) {
      expect(googleReviewLink(` ${ok} `), ok).not.toBeNull();
    }
    for (const bad of ["http://g.page/r/x/review", "https://evil.example/g.page", "https://google.com.evil.example/", "https://google.ev.il/", "javascript:alert(1)", "not a url"]) {
      expect(googleReviewLink(bad), bad).toBeNull();
    }
  });

  it("the words follow Google's rules: no reward, no selective asking, no pressure", () => {
    expect(REVIEW_ASK).toContain("honest");
    expect(REVIEW_ASK).not.toMatch(/discount|free|5.star|five.star/i);
    expect(REVIEW_RULES.join(" ")).toMatch(/every customer/);
    expect(REVIEW_RULES.join(" ")).toMatch(/nothing in return/);
  });
});
