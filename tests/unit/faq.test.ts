import { describe, expect, it } from "vitest";
import { buildFaq } from "@/lib/faq";

const keysAnswer = (packsOpen: boolean) => buildFaq(null, { packsOpen }).find((f) => f.q === "Which API keys do I need?")!.a;

describe("FAQ: which API keys do I need", () => {
  it("never offers included scans for sale while packs are closed", () => {
    const a = keysAnswer(false);
    expect(a).toContain("coming soon");
    expect(a).toContain("every scan runs on your own keys");
    expect(a).not.toMatch(/buy included scans/i);
  });

  it("offers included scans once packs are open", () => {
    const a = keysAnswer(true);
    expect(a).toMatch(/buy included scans: 25 for \$19 or 100 for \$59/);
    expect(a).not.toContain("coming soon");
  });
});
