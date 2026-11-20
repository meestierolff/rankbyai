import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewKit } from "@/components/app/audit-client";

describe("ReviewKit renders", () => {
  it("draws a QR code for the Maps page and offers it as an SVG download", () => {
    const html = renderToString(<ReviewKit name="South Austin Dentist" placeId="ChIJsU30zM1qkFQRbnOm1_LBoG0" />);
    expect(html).toContain('aria-label="QR code for the Google Maps page"');
    expect(html).toMatch(/<path d="M\d+ \d+h1v1h-1z/);
    expect(html).toContain("query_place_id=ChIJsU30zM1qkFQRbnOm1_LBoG0");
    expect(html).toContain('download="review-qr.svg"');
    expect(html).toContain("Ask every customer, not only the happy ones.");
  });
});
