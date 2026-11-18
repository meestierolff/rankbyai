import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GridPicker, pickerLabel } from "@/components/app/grid-picker";

/** The point picker of the scan form, rendered as the server sends it (before any script runs). */
const render = (n: number, skip: number[], center: { lat: number; lng: number } | null = null) =>
  renderToStaticMarkup(createElement(GridPicker, { n, skip, onChange: () => {}, center, radiusMiles: 2 }));

describe("grid point picker", () => {
  it("renders every point of a 15×15 grid as a real toggle button with its state", () => {
    const html = render(15, [0, 1, 2, 112]);
    expect(html.match(/<button[^>]*aria-pressed=/g)).toHaveLength(225);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);
    expect(html).toContain('aria-label="Point A1, skipped"');
    expect(html).toContain('aria-label="Point A4, checked"');
    expect(html).toContain('aria-label="Point H8 (business), skipped"'); // idx 112 is the centre of 15×15
    expect(html).toContain("4 of 225 points skipped");
  });

  it("is one tab stop (arrow keys move inside), starting on the business point", () => {
    const html = render(13, []);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(13 * 13 - 1);
    expect(html).toMatch(/<button[^>]*tabindex="0"[^>]*aria-label="Point G7 \(business\), checked"|<button[^>]*aria-label="Point G7 \(business\), checked"[^>]*tabindex="0"/);
  });

  it("names the group, explains what skipping does and offers Skip none", () => {
    const html = render(5, []);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Points of the 5×5 grid, north at the top"');
    expect(html).toContain("Skipped points are not looked up and cost nothing.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Skip none<\/button>/); // nothing to reset yet
    expect(render(5, [3])).toMatch(/<button(?![^>]*disabled="")[^>]*>Skip none<\/button>/);
    expect(html).toContain("0 of 25 points skipped");
  });

  it("offers the map view only when the business location is known", () => {
    expect(render(7, [])).not.toContain('aria-label="Show points on"');
    expect(render(7, [], { lat: 30.3, lng: -97.7 })).toContain('aria-label="Show points on"');
  });

  it("labels points the way the results name them", () => {
    expect(pickerLabel(3, 0, false)).toBe("Point A1, checked");
    expect(pickerLabel(3, 4, true)).toBe("Point B2 (business), skipped");
    expect(pickerLabel(15, 224, true)).toBe("Point O15, skipped");
  });
});
