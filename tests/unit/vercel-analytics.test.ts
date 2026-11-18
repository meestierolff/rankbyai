import { describe, expect, it } from "vitest";
import { redactAnalyticsUrl, redactReportSlugs } from "@/components/analytics/vercel-analytics";

describe("Vercel Analytics never receives a report's access key or a query string", () => {
  it("replaces the slug of a report and its sub-pages", () => {
    expect(redactAnalyticsUrl("https://rankbyai.live/r/m8fcf0RgiJW4aRPA")).toBe("https://rankbyai.live/r/[slug]");
    expect(redactAnalyticsUrl("https://reports.agency.com/r/m8fcf0RgiJW4aRPA/pdf")).toBe("https://reports.agency.com/r/[slug]/pdf");
  });
  it("drops query strings and fragments everywhere", () => {
    expect(redactAnalyticsUrl("https://rankbyai.live/login?next=%2Fapp%2Fbilling#x")).toBe("https://rankbyai.live/login");
    expect(redactAnalyticsUrl("https://rankbyai.live/pricing")).toBe("https://rankbyai.live/pricing");
  });
});

describe("PostHog properties never carry a report slug", () => {
  it("replaces every report slug inside any string", () => {
    expect(redactReportSlugs("https://rankbyai.live/r/m8fcf0RgiJW4aRPA?x=1")).toBe("https://rankbyai.live/r/[slug]?x=1");
    expect(redactReportSlugs("/r/m8fcf0RgiJW4aRPA/pdf")).toBe("/r/[slug]/pdf");
    expect(redactReportSlugs("/pricing")).toBe("/pricing");
  });
});
