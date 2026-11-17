import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next";

describe("safeNextPath (post-login redirect target)", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/app/billing")).toBe("/app/billing");
    expect(safeNextPath("/app/ai-visibility?scan=1#top")).toBe("/app/ai-visibility?scan=1#top");
  });

  it("reduces an absolute URL to its path (a sign-in callback may pass one)", () => {
    expect(safeNextPath("http://localhost:3100/app/billing")).toBe("/app/billing");
    expect(safeNextPath("https://evil.example/app/billing?x=1")).toBe("/app/billing?x=1");
  });

  it("rejects everything that could leave the site", () => {
    const attacks = [
      "//evil.example", "/\\evil.example", "\\\\evil.example", "/\t/evil.example", "/\n/evil.example", " //evil.example",
      "https://evil.example//other.example", "http://x//evil.example", "javascript:alert(1)", "data:text/html,x",
      "evil.example", "app/billing", "", "https:evil.example", "/%09/evil.example".replace("%09", "\t"),
    ];
    for (const a of attacks) {
      const out = safeNextPath(a);
      expect(out.startsWith("/") && !out.startsWith("//") && !out.includes("\\"), JSON.stringify(a)).toBe(true);
      expect(new URL(out, "https://rankbyai.live").origin, JSON.stringify(a)).toBe("https://rankbyai.live");
    }
    expect(safeNextPath("//evil.example")).toBe("/app");
    expect(safeNextPath("/\t/evil.example")).toBe("/app");
    expect(safeNextPath("javascript:alert(1)")).toBe("/app");
  });
});
