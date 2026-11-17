/**
 * OpenAPI 3.1 description of /api/v1. Kept next to the handlers (core.ts, rest.ts); the test suite
 * validates it against the OpenAPI schema and checks that every route in it answers.
 */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const idParam = (what: string) => ({ name: "id", in: "path", required: true, description: `Id of the ${what}.`, schema: { type: "string", format: "uuid" } });
const errors = {
  "400": { description: "The request is not valid.", content: json(ref("Error")) },
  "401": { description: "Missing or invalid API key.", content: json(ref("Error")) },
  "403": { description: "The workspace has no lifetime access.", content: json(ref("Error")) },
  "404": { description: "Not found in this workspace.", content: json(ref("Error")) },
  "429": { description: "More than 60 requests in a minute for this key.", content: json(ref("Error")) },
};
const funding = { type: "string", enum: ["byok", "credits"], default: "byok", description: "byok = your own API keys; credits = included scans." };
const confirm = { type: "boolean", default: false, description: "Without it the response is the estimate only. Send true to run and be charged." };
const estimateOr = (okStatus: string, okDescription: string, okSchema: object) => ({
  "200": { description: "Estimate only: nothing ran. Repeat the request with confirm: true.", content: json(ref("ConfirmRequired")) },
  [okStatus]: { description: okDescription, content: json(okSchema) },
  ...errors,
});
const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, ...(required.length ? { required } : {}) });

export function openApiSpec(siteUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "RankbyAI API",
      version: "1.0.0",
      summary: "AI visibility grids, Google Maps grids, audits and prospect reports.",
      description:
        "Authenticate with an API key from the app (API & MCP) as a Bearer token. Limit: 60 requests a minute per key. Every request that calls a vendor returns an estimate first and runs only with `confirm: true`. AI answers vary between runs, places and time; API results can differ from what people see in the consumer apps.",
    },
    servers: [{ url: `${siteUrl}/api/v1` }],
    security: [{ apiKey: [] }],
    tags: [{ name: "Businesses" }, { name: "Scans" }, { name: "Audits" }, { name: "Prospects" }, { name: "Usage" }],
    paths: {
      "/businesses": {
        get: {
          operationId: "listBusinesses", tags: ["Businesses"], summary: "List tracked businesses",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          ],
          responses: { "200": { description: "Businesses, newest first.", content: json(obj({ businesses: { type: "array", items: ref("Business") }, limit: { type: "integer" }, offset: { type: "integer" } })) }, ...errors },
        },
        post: {
          operationId: "addBusiness", tags: ["Businesses"], summary: "Add a business",
          description: "With `lat` and `lng` the business is stored as given, at no cost. With `name` and `city` it is looked up on Google Maps: one paid lookup on your DataForSEO key, which needs `confirm: true`.",
          requestBody: { required: true, content: json(obj({ name: { type: "string" }, city: { type: "string" }, country: { type: "string", enum: ["US", "GB", "CA", "AU", "IE", "NZ"], default: "US" }, lat: { type: "number" }, lng: { type: "number" }, address: { type: "string" }, website: { type: "string", format: "uri" }, phone: { type: "string" }, primary_category: { type: "string" }, confirm }, ["name"])) },
          responses: {
            "200": { description: "Either the estimate (confirm_required) or a business that already existed.", content: json({ oneOf: [ref("ConfirmRequired"), obj({ business: ref("Business"), existing: { type: "boolean" } })] }) },
            "201": { description: "Business created.", content: json(obj({ business: ref("Business"), existing: { type: "boolean" } })) },
            ...errors,
          },
        },
      },
      "/businesses/{id}": {
        get: { operationId: "getBusiness", tags: ["Businesses"], summary: "Get a business and its recent scans", parameters: [idParam("business")], responses: { "200": { description: "The business.", content: json(obj({ business: ref("Business"), recent_scans: { type: "array", items: { type: "object" } } })) }, ...errors } },
      },
      "/scans": {
        post: {
          operationId: "createScan", tags: ["Scans"], summary: "Estimate or run a scan",
          description: "`kind: ai` asks the AI engines who they recommend at each grid point (grid 1, 3 or 5). `kind: maps` reads the Google Maps rank at each point (grid 3, 5, 7 or 9).",
          requestBody: { required: true, content: json(obj({
            business_id: { type: "string", format: "uuid" }, kind: { type: "string", enum: ["ai", "maps"] },
            keyword: { type: "string", description: "The service people search for, e.g. \"dentist\". `prompt` is accepted as an alias." },
            prompt_template: { type: "string", description: "AI scans only. Must contain {service} and {neighbourhood} or {city}." },
            grid_size: { type: "integer", enum: [1, 3, 5, 7, 9] }, radius_miles: { type: "number", default: 2, maximum: 50 },
            engines: { type: "array", items: { type: "string", enum: ["openai", "perplexity", "gemini"] }, description: "AI scans. Default: every engine you have a key for." },
            mode: { type: "string", enum: ["standard", "priority", "live"], default: "priority", description: "Maps scans: queue speed." },
            funding, confirm,
          }, ["business_id", "kind", "keyword", "grid_size"])) },
          responses: estimateOr("202", "The scan was started.", obj({ scan_id: { type: "string", format: "uuid" }, status: { type: "string" }, estimate: ref("Estimate") })),
        },
      },
      "/scans/compare": {
        get: {
          operationId: "compareScans", tags: ["Scans"], summary: "Compare two finished scans of the same business",
          parameters: [{ name: "a", in: "query", required: true, description: "The earlier scan.", schema: { type: "string", format: "uuid" } }, { name: "b", in: "query", required: true, description: "The later scan.", schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Per-point and headline changes.", content: json(obj({ kind: { type: "string" }, headline: { type: "string" }, comparison: { type: "object" } })) }, "409": { description: "A scan has not finished.", content: json(ref("Error")) }, ...errors },
        },
      },
      "/scans/{id}": {
        get: { operationId: "getScan", tags: ["Scans"], summary: "Scan status, summary and cost", parameters: [idParam("scan")], responses: { "200": { description: "The scan.", content: json(obj({ scan: ref("Scan") })) }, ...errors } },
      },
      "/scans/{id}/points": {
        get: { operationId: "getScanPoints", tags: ["Scans"], summary: "Every grid point, with the AI answers for AI scans", parameters: [idParam("scan")], responses: { "200": { description: "Points (and samples for AI scans).", content: json(obj({ scan_id: { type: "string" }, kind: { type: "string" }, grid_size: { type: "integer" }, status: { type: "string" }, points: { type: "array", items: { type: "object" } }, samples: { type: "array", items: { type: "object" } } })) }, ...errors } },
      },
      "/audits": {
        post: {
          operationId: "createAudit", tags: ["Audits"], summary: "Estimate or run a Local AI Audit",
          requestBody: { required: true, content: json(obj({ business_id: { type: "string", format: "uuid" }, service: { type: "string", description: "The main service, e.g. \"dentist\"." }, months: { type: "integer", minimum: 1, maximum: 12, default: 3, description: "Months to close the review gap." }, funding, confirm }, ["business_id", "service"])) },
          responses: estimateOr("202", "The audit was started.", obj({ audit_id: { type: "string", format: "uuid" }, status: { type: "string" }, estimate: { type: "object" } })),
        },
      },
      "/audits/{id}": {
        get: { operationId: "getAudit", tags: ["Audits"], summary: "Audit score, findings with evidence, and checks that could not run", parameters: [idParam("audit")], responses: { "200": { description: "The audit.", content: json(obj({ audit: { type: "object" }, findings: { type: "array", items: ref("Finding") }, not_checked: { type: "array", items: { type: "object" } } })) }, ...errors } },
      },
      "/audits/{id}/fix-kit": {
        get: {
          operationId: "getFixKit", tags: ["Audits"], summary: "The audit's Fix Kit",
          description: "Returns the stored Fix Kit. The first request builds it with one model call; on your own keys that needs `?confirm=true`.",
          parameters: [idParam("audit"), { name: "confirm", in: "query", schema: { type: "boolean" } }],
          responses: { "200": { description: "The Fix Kit, or the estimate when it has not been built yet.", content: json({ oneOf: [ref("ConfirmRequired"), obj({ fix_kit: { type: "object" }, note: { type: "string" } })] }) }, "409": { description: "The audit has not finished.", content: json(ref("Error")) }, ...errors },
        },
      },
      "/prospects": {
        post: {
          operationId: "createProspectBatch", tags: ["Prospects"], summary: "Estimate or start a prospect batch",
          description: "Finds businesses for a niche and a city and builds a report for the first `max_reports` that are outside the Google Maps top 3. 2 credits per report, or your own keys.",
          requestBody: { required: true, content: json(obj({ niche: { type: "string" }, city: { type: "string" }, country: { type: "string", enum: ["US", "GB", "CA", "AU", "IE", "NZ"], default: "US" }, max_reports: { type: "integer", minimum: 1, maximum: 50, default: 10 }, funding, confirm }, ["niche", "city"])) },
          responses: estimateOr("202", "The batch was started.", obj({ batch_id: { type: "string", format: "uuid" }, status: { type: "string" }, reports: { type: "integer" }, businesses_found: { type: "integer" } })),
        },
      },
      "/prospects/{id}": {
        get: { operationId: "getProspectBatch", tags: ["Prospects"], summary: "Batch progress and the reports that are ready", parameters: [idParam("batch")], responses: { "200": { description: "The batch.", content: json(obj({ batch: { type: "object" }, reports: { type: "array", items: { type: "object" } } })) }, ...errors } },
      },
      "/usage": {
        get: { operationId: "getUsage", tags: ["Usage"], summary: "This month's spend on your own keys per provider, and included-scan credits left", responses: { "200": { description: "Usage.", content: json(obj({ period_start: { type: "string", format: "date-time" }, own_keys: { type: "object" }, included_scans: { type: "object" }, note: { type: "string" } })) }, ...errors } },
      },
    },
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: "An API key created in the app: rbai_live_ followed by 32 characters." } },
      schemas: {
        Error: obj({ error: { type: "string", description: "Stable machine-readable code." }, message: { type: "string" } }, ["error", "message"]),
        Estimate: obj({ totalUsd: { type: "number" }, credits: { type: "integer" }, lines: { type: "array", items: obj({ label: { type: "string" }, usd: { type: "number" } }) } }),
        ConfirmRequired: obj({ confirm_required: { type: "boolean", const: true }, estimate: { type: "object" }, message: { type: "string" } }, ["confirm_required", "estimate"]),
        Business: obj({
          id: { type: "string", format: "uuid" }, name: { type: "string" }, address: { type: ["string", "null"] }, city: { type: ["string", "null"] }, region: { type: ["string", "null"] }, country: { type: ["string", "null"] },
          lat: { type: ["number", "null"] }, lng: { type: ["number", "null"] }, website: { type: ["string", "null"] }, phone: { type: ["string", "null"] }, primary_category: { type: ["string", "null"] },
          rating: { type: ["number", "null"] }, reviews_count: { type: ["integer", "null"] }, source: { type: "string" }, created_at: { type: "string", format: "date-time" },
        }, ["id", "name"]),
        Scan: obj({
          id: { type: "string", format: "uuid" }, business_id: { type: "string", format: "uuid" }, kind: { type: "string", enum: ["ai", "maps"] }, grid_size: { type: "integer" },
          status: { type: "string", enum: ["queued", "running", "done", "partial", "failed"] }, summary: { type: "object", description: "Headline metrics once finished." },
          est_cost_usd: { type: ["number", "null"] }, actual_cost_usd: { type: ["number", "null"] }, created_at: { type: "string", format: "date-time" }, finished_at: { type: ["string", "null"], format: "date-time" },
        }, ["id", "kind", "status"]),
        Finding: obj({
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] }, category: { type: "string" }, title: { type: "string" },
          evidence: { type: "array", items: obj({ label: { type: "string" }, value: { type: "string" }, source_url: { type: "string" } }) }, fix: { type: "string" }, impact_note: { type: ["string", "null"] }, check_key: { type: "string" },
        }, ["priority", "title", "evidence"]),
      },
    },
  };
}
