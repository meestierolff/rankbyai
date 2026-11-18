import { describe, expect, it } from "vitest";
import { creditsBlocker, defaultFunding, firstRunSteps, keysHint, planLabel, scanCredits, seatText, type FirstRunFacts } from "@/components/app/first-run";
import { CREDIT_COST } from "@/lib/pricing-constants";

/** The first-run rules of the signed-in app: what a new workspace sees, and which option a form opens on. */
const fresh: FirstRunFacts = { locked: false, businesses: 0, finishedScans: 0, activeScan: null, lastScanFailed: false, hasSearchKey: true, checkCost: "A 3×3 check costs about $0.14." };

describe("Get started checklist", () => {
  it("starts on adding a business", () => {
    const steps = firstRunSteps(fresh)!;
    expect(steps.map((s) => s.state)).toEqual(["current", "todo", "todo"]);
    expect(steps[0].href).toBe("/app/businesses");
  });

  it("sends a workspace without a DataForSEO login to the keys page first, because credits cannot pay for the listing search", () => {
    const steps = firstRunSteps({ ...fresh, hasSearchKey: false })!;
    expect(steps[0].href).toBe("/app/settings/keys");
    expect(steps[0].detail).toMatch(/cannot pay for this step/);
  });

  it("moves to the AI check once a business exists, and quotes the app's own estimate", () => {
    const steps = firstRunSteps({ ...fresh, businesses: 1 })!;
    expect(steps.map((s) => s.state)).toEqual(["done", "current", "todo"]);
    expect(steps[1].detail).toContain("$0.14");
  });

  it("points at the running scan while it runs", () => {
    const steps = firstRunSteps({ ...fresh, businesses: 1, activeScan: { id: "s1", kind: "ai" } })!;
    expect(steps[1].href).toBe("/app/ai-visibility/s1");
    expect(steps[2].href).toBe("/app/ai-visibility/s1");
  });

  it("says plainly when the last scan failed", () => {
    expect(firstRunSteps({ ...fresh, businesses: 1, lastScanFailed: true })![1].detail).toMatch(/^Your last scan did not finish/);
  });

  it("disappears after the first finished scan", () => {
    expect(firstRunSteps({ ...fresh, businesses: 1, finishedScans: 1 })).toBeNull();
  });
});

describe("funding default", () => {
  const cost = scanCredits("ai", 3);
  it("opens on own keys when the workspace has them", () => {
    expect(defaultFunding({ ownKeys: true, credits: 1000, cost, includedOpen: true })).toBe("byok");
  });
  it("opens on included scans when there are no own keys and credits can pay", () => {
    expect(defaultFunding({ ownKeys: false, credits: 1000, cost, includedOpen: true })).toBe("credits");
  });
  it("stays on own keys, with the reason, when credits cannot pay", () => {
    expect(defaultFunding({ ownKeys: false, credits: 0, cost, includedOpen: true })).toBe("byok");
    expect(creditsBlocker({ credits: 0, cost, includedOpen: true })).toMatch(/no included scan credits/);
    expect(creditsBlocker({ credits: 1000, cost, includedOpen: false })).toMatch(/not switched on/);
  });
  it("uses the same credit table as the server", () => {
    expect(scanCredits("ai", 5)).toBe(CREDIT_COST.ai_grid_5);
    expect(scanCredits("ai", 3)).toBe(CREDIT_COST.ai_grid_3);
    expect(scanCredits("maps", 9)).toBe(CREDIT_COST.maps_grid);
  });
});

describe("plan and hints", () => {
  it("never shows a dash for a lifetime workspace without a seat number", () => {
    expect(planLabel("lifetime", null)).toBe("Lifetime");
    expect(planLabel("lifetime", 3)).toBe("Lifetime · seat #3");
    expect(planLabel("locked", null)).toBe("Not purchased");
    expect(seatText(null)).toBeNull();
  });
  it("does not tell a workspace with credits that it needs keys to start", () => {
    expect(keysHint(0, 1000, true)).not.toMatch(/to start/);
    expect(keysHint(0, 0, true)).toMatch(/to start/);
    expect(keysHint(4, 1000, true)).toBe("Tested and encrypted");
  });
});
