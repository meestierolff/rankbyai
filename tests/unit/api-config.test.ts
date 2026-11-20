import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { MCP_PAID_TOOLS, MCP_TOOLS } from "@/lib/api-v1/mcp-tools";
import { openApiSpec } from "@/lib/api-v1/openapi";

describe("documentation redirects", () => {
  it("sends /api/reference and /docs permanently to /docs/api", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects.slice(0, 2)).toEqual([
      { source: "/api/reference", destination: "/docs/api", permanent: true },
      { source: "/docs", destination: "/docs/api", permanent: true },
    ]);
    // Exact paths: the docs page itself and the in-app reference are not caught.
    for (const r of redirects) expect(r.source).not.toMatch(/[:*(]/);
  });

  it("every other redirect is a close variant of a search page: 301, exact path, to a real page, never over one", async () => {
    const { SEO_PAGES } = await import("@/lib/seo-pages");
    const { STATIC_PAGES } = await import("@/lib/site-pages");
    const pages = new Set([...STATIC_PAGES.map((p) => p.path), "/free-check", "/login", "/signup", "/app"]);
    const variants = (await nextConfig.redirects!()).slice(2);
    expect(variants.length).toBeGreaterThan(0);
    for (const r of variants) {
      expect(r, r.source).toMatchObject({ statusCode: 301 });
      expect(SEO_PAGES.some((p) => p.path === r.destination), r.destination).toBe(true);
      expect(pages.has(r.source), r.source).toBe(false);
    }
  });
});

describe("OpenAPI document and MCP tool list", () => {
  const spec = openApiSpec("https://rankbyai.live");
  type Op = { summary?: string; operationId?: string; requestBody?: { content: { "application/json": { schema: { properties?: object; $ref?: string } } } } };

  it("every path entry is an operation the reference page can render", () => {
    const ids: string[] = [];
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(ops) as [string, Op][]) {
        expect(["get", "post", "patch", "delete"], `${method} ${path}`).toContain(method);
        expect(op.summary, `${method} ${path}`).toBeTruthy();
        ids.push(op.operationId!);
        if (op.requestBody) expect(op.requestBody.content["application/json"].schema.properties, `${method} ${path}`).toBeTypeOf("object");
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("describes the real estimate, usage, prospect batch, Fix Kit and scan point shapes", () => {
    const s = spec.components.schemas as unknown as Record<string, { properties: Record<string, { deprecated?: boolean; $ref?: string }>; required?: string[] }>;
    for (const name of ["Estimate", "Usage", "ProspectBatch", "ProspectReport", "FixKit", "ScanPoints", "ScanPoint", "AiSample", "Audit", "Branding"]) expect(s[name], name).toBeDefined();
    expect(Object.keys(s.Estimate.properties)).toEqual(expect.arrayContaining(["totalUsd", "highUsd", "credits", "basis", "lines", "runsMapsCheck", "runsAiCheck", "reports", "perReportUsd", "note"]));
    expect(s.Estimate.required).toEqual(["totalUsd", "lines"]);
    expect(s.Estimate.properties.total_usd.deprecated).toBe(true);
    expect(s.ConfirmRequired.properties.estimate.$ref).toBe("#/components/schemas/Estimate");
    expect(Object.keys(s.Usage.properties)).toEqual(["period_start", "own_keys", "included_scans", "note"]);
    // Every $ref in the document points at a schema that exists.
    const refs = [...JSON.stringify(spec).matchAll(/"#\/components\/schemas\/([A-Za-z]+)"/g)].map((m) => m[1]);
    for (const r of refs) expect(s[r], r).toBeDefined();
  });

  it("has no duplicate tool names, and every paid tool is a tool", () => {
    expect(new Set(MCP_TOOLS).size).toBe(MCP_TOOLS.length);
    for (const t of MCP_PAID_TOOLS) expect(MCP_TOOLS).toContain(t);
    expect(MCP_TOOLS).toEqual(expect.arrayContaining(["update_business", "delete_business", "list_scans", "list_audits", "list_prospect_batches", "get_branding", "update_branding"]));
  });
});
