/**
 * OpenAPI 3.1 description of /api/v1. Kept next to the handlers (core.ts, rest.ts); the test suite
 * validates it against the OpenAPI schema and checks that every route in it answers.
 *
 * The reference pages render this document: every key under a path is an operation with a
 * `summary`, and request bodies list their properties inline.
 */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const idParam = (what: string) => ({ name: "id", in: "path", required: true, description: `Id of the ${what}. An id that is not a UUID answers 400.`, schema: { type: "string", format: "uuid" } });
const errors = {
  "400": { description: "The request is not valid.", content: json(ref("Error")) },
  "401": { description: "Missing or invalid API key.", content: json(ref("Error")) },
  "403": { description: "The workspace has no lifetime access.", content: json(ref("Error")) },
  "404": { description: "Not found in this workspace.", content: json(ref("Error")) },
  "429": { description: "More than 60 requests in a minute for this key. Retry-After says how many seconds to wait.", content: json(ref("Error")) },
};
const funding = { type: "string", enum: ["byok", "credits"], default: "byok", description: "byok = your own API keys; credits = included scans." };
const confirm = { type: "boolean", default: false, description: "Without it the response is the estimate only. Send true to run and be charged." };
const estimateOr = (okStatus: string, okDescription: string, okSchema: object) => ({
  "200": { description: "Estimate only: nothing ran. Repeat the request with confirm: true.", content: json(ref("ConfirmRequired")) },
  [okStatus]: { description: okDescription, content: json(okSchema) },
  ...errors,
});
const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, ...(required.length ? { required } : {}) });
const nullable = (type: string, extra: object = {}) => ({ type: [type, "null"], ...extra });
const uuid = { type: "string", format: "uuid" };
const dateTime = { type: "string", format: "date-time" };
const usd = (description?: string) => ({ type: "number", description: `${description ? `${description} ` : ""}US dollars, at most 6 decimal places.` });
const paging = [
  { name: "limit", in: "query", description: "How many to return.", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
  { name: "offset", in: "query", description: "How many to skip, for the next page.", schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 } },
];
const page = { limit: { type: "integer" }, offset: { type: "integer" } };
const scanStatus = { type: "string", enum: ["queued", "running", "done", "partial", "failed"] };
const auditStatus = { type: "string", enum: ["queued", "running", "done", "failed"] };

export function openApiSpec(siteUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "RankbyAI API",
      version: "1.1.0",
      summary: "AI visibility grids, Google Maps grids, audits, prospect reports and white-label branding.",
      description:
        "Authenticate with an API key from the app (API & MCP) as a Bearer token. Limit: 60 requests a minute per key; every authenticated response carries X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset (a Unix time in seconds), and a 429 also carries Retry-After. " +
        "Every request that calls a vendor returns an estimate first and runs only with `confirm: true`. US-dollar amounts are rounded to at most 6 decimal places. " +
        "HEAD is served on every GET endpoint and returns the headers without a body. The API is for servers and agents: its endpoints send no CORS headers, so a browser on another origin cannot call them. This document (/api/v1/openapi.json) holds no account data and is the one address any origin may read. " +
        "AI answers vary between runs, places and time; API results can differ from what people see in the consumer apps.",
    },
    servers: [{ url: `${siteUrl}/api/v1` }],
    security: [{ apiKey: [] }],
    tags: [{ name: "Businesses" }, { name: "Scans" }, { name: "Audits" }, { name: "Prospects" }, { name: "Branding" }, { name: "Usage" }],
    paths: {
      "/businesses": {
        get: {
          operationId: "listBusinesses", tags: ["Businesses"], summary: "List tracked businesses",
          parameters: paging,
          responses: { "200": { description: "Businesses, newest first.", content: json(obj({ businesses: { type: "array", items: ref("Business") }, ...page })) }, ...errors },
        },
        post: {
          operationId: "addBusiness", tags: ["Businesses"], summary: "Add a business",
          description: "With `lat` and `lng` the business is stored as given, at no cost. With `name` and `city` it is looked up on Google Maps: one paid lookup on your DataForSEO key, which needs `confirm: true`.",
          requestBody: { required: true, content: json(obj({ name: { type: "string" }, city: { type: "string" }, country: { type: "string", enum: ["US", "GB", "CA", "AU", "IE", "NZ"], default: "US" }, lat: { type: "number", minimum: -90, maximum: 90 }, lng: { type: "number", minimum: -180, maximum: 180 }, address: { type: "string" }, website: { type: "string", format: "uri" }, phone: { type: "string" }, primary_category: { type: "string" }, confirm }, ["name"])) },
          responses: {
            "200": { description: "Either the estimate (confirm_required) or a business that already existed.", content: json({ oneOf: [ref("ConfirmRequired"), obj({ business: ref("Business"), existing: { type: "boolean" } })] }) },
            "201": { description: "Business created.", content: json(obj({ business: ref("Business"), existing: { type: "boolean" } })) },
            ...errors,
          },
        },
      },
      "/businesses/{id}": {
        get: { operationId: "getBusiness", tags: ["Businesses"], summary: "Get a business and its recent scans", parameters: [idParam("business")], responses: { "200": { description: "The business.", content: json(obj({ business: ref("Business"), recent_scans: { type: "array", items: obj({ id: uuid, kind: { type: "string", enum: ["ai", "maps"] }, grid_size: { type: "integer" }, status: scanStatus, keyword: nullable("string"), niche: nullable("string"), created_at: dateTime }) } })) }, ...errors } },
        patch: {
          operationId: "updateBusiness", tags: ["Businesses"], summary: "Change the name, address, city or client of a business",
          description: "Free. Fields you leave out stay as they are. Coordinates and the Google Maps listing do not change. Fields other than these four answer 400.",
          parameters: [idParam("business")],
          requestBody: { required: true, content: json(obj({
            name: { type: "string", description: "1 to 300 characters." },
            address: nullable("string", { description: "null or an empty string clears it." }),
            city: nullable("string", { description: "null or an empty string clears it." }),
            client_id: nullable("string", { format: "uuid", description: "A client of this workspace (clients are made in the app). null takes the business out of its client." }),
          })) },
          responses: { "200": { description: "The business after the change.", content: json(obj({ business: ref("Business") })) }, ...errors },
        },
        delete: {
          operationId: "deleteBusiness", tags: ["Businesses"], summary: "Delete a business and everything recorded for it",
          description: "Free, needs no confirm, and cannot be undone. The business's scans, audits, Fix Kits, schedules and reports are deleted with it, and its share links stop working. This is what deleting a business in the app does.",
          parameters: [idParam("business")],
          responses: { "200": { description: "Deleted.", content: json(obj({ deleted: { type: "boolean", const: true }, id: uuid }, ["deleted", "id"])) }, ...errors },
        },
      },
      "/scans": {
        get: {
          operationId: "listScans", tags: ["Scans"], summary: "List scans",
          parameters: [...paging, { name: "business_id", in: "query", description: "Scans of this business.", schema: uuid }, { name: "kind", in: "query", schema: { type: "string", enum: ["ai", "maps"] } }, { name: "status", in: "query", schema: scanStatus }],
          responses: { "200": { description: "Scans, newest first.", content: json(obj({ scans: { type: "array", items: ref("Scan") }, ...page })) }, ...errors },
        },
        post: {
          operationId: "createScan", tags: ["Scans"], summary: "Estimate or run a scan",
          description: "`kind: ai` asks the AI engines who they recommend at each grid point (grid 1, 3 or 5). `kind: maps` reads the Google Maps rank at each point (grid 3, 5, 7 or 9).",
          requestBody: { required: true, content: json(obj({
            business_id: uuid, kind: { type: "string", enum: ["ai", "maps"] },
            keyword: { type: "string", description: "The service people search for, e.g. \"dentist\". `prompt` is accepted as an alias." },
            prompt_template: { type: "string", description: "AI scans only. Must contain {service} and {neighbourhood} or {city}." },
            grid_size: { type: "integer", enum: [1, 3, 5, 7, 9], description: "AI scans: 1, 3 or 5. Maps scans: 3, 5, 7 or 9." }, radius_miles: { type: "number", default: 2, maximum: 50 },
            engines: { type: "array", items: { type: "string", enum: ["openai", "perplexity", "gemini"] }, description: "AI scans. Default: every engine you have a key for." },
            mode: { type: "string", enum: ["standard", "priority", "live"], default: "priority", description: "Maps scans: queue speed." },
            funding, confirm,
          }, ["business_id", "kind", "keyword", "grid_size"])) },
          responses: estimateOr("202", "The scan was started.", obj({ scan_id: uuid, status: { type: "string" }, estimate: ref("Estimate") })),
        },
      },
      "/scans/compare": {
        get: {
          operationId: "compareScans", tags: ["Scans"], summary: "Compare two finished scans of the same business",
          parameters: [{ name: "a", in: "query", required: true, description: "The earlier scan.", schema: uuid }, { name: "b", in: "query", required: true, description: "The later scan.", schema: uuid }],
          responses: { "200": { description: "Per-point and headline changes.", content: json(obj({ kind: { type: "string", enum: ["ai", "maps"] }, a: uuid, b: uuid, headline: { type: "string" }, comparison: { type: "object" } })) }, "409": { description: "A scan has not finished.", content: json(ref("Error")) }, ...errors },
        },
      },
      "/scans/{id}": {
        get: { operationId: "getScan", tags: ["Scans"], summary: "Scan status, summary and cost", parameters: [idParam("scan")], responses: { "200": { description: "The scan.", content: json(obj({ scan: ref("Scan") })) }, ...errors } },
      },
      "/scans/{id}/points": {
        get: { operationId: "getScanPoints", tags: ["Scans"], summary: "Every grid point, with the AI answers for AI scans", parameters: [idParam("scan")], responses: { "200": { description: "Points (and samples for AI scans).", content: json(ref("ScanPoints")) }, ...errors } },
      },
      "/audits": {
        get: {
          operationId: "listAudits", tags: ["Audits"], summary: "List audits",
          parameters: [...paging, { name: "business_id", in: "query", description: "Audits of this business.", schema: uuid }, { name: "status", in: "query", schema: auditStatus }],
          responses: { "200": { description: "Audits, newest first. Findings are on GET /audits/{id}.", content: json(obj({ audits: { type: "array", items: ref("Audit") }, ...page })) }, ...errors },
        },
        post: {
          operationId: "createAudit", tags: ["Audits"], summary: "Estimate or run a Local AI Audit",
          requestBody: { required: true, content: json(obj({ business_id: uuid, service: { type: "string", description: "The main service, e.g. \"dentist\"." }, months: { type: "integer", minimum: 1, maximum: 12, default: 3, description: "Months to close the review gap." }, funding, confirm }, ["business_id", "service"])) },
          responses: estimateOr("202", "The audit was started.", obj({ audit_id: uuid, status: { type: "string" }, estimate: ref("Estimate") })),
        },
      },
      "/audits/{id}": {
        get: { operationId: "getAudit", tags: ["Audits"], summary: "Audit score, findings with evidence, and checks that could not run", parameters: [idParam("audit")], responses: { "200": { description: "The audit.", content: json(obj({ audit: ref("Audit"), findings: { type: "array", items: ref("Finding") }, not_checked: { type: "array", items: obj({ check: { type: "string" }, title: { type: "string" }, reason: nullable("string") }) } })) }, ...errors } },
      },
      "/audits/{id}/fix-kit": {
        get: {
          operationId: "getFixKit", tags: ["Audits"], summary: "The audit's Fix Kit",
          description: "Returns the stored Fix Kit. The first request builds it with one model call; on your own keys that needs `?confirm=true`.",
          parameters: [idParam("audit"), { name: "confirm", in: "query", schema: { type: "boolean" } }],
          responses: { "200": { description: "The Fix Kit, or the estimate when it has not been built yet.", content: json({ oneOf: [ref("ConfirmRequired"), obj({ fix_kit: ref("FixKit"), note: { type: "string" } })] }) }, "409": { description: "The audit has not finished.", content: json(ref("Error")) }, ...errors },
        },
      },
      "/prospects": {
        get: {
          operationId: "listProspectBatches", tags: ["Prospects"], summary: "List prospect batches",
          parameters: [...paging, { name: "status", in: "query", schema: scanStatus }],
          responses: { "200": { description: "Batches, newest first. The reports of a batch are on GET /prospects/{id}.", content: json(obj({ batches: { type: "array", items: ref("ProspectBatch") }, ...page })) }, ...errors },
        },
        post: {
          operationId: "createProspectBatch", tags: ["Prospects"], summary: "Estimate or start a prospect batch",
          description: "Finds businesses for a niche and a city and builds a report for the first `max_reports` that are outside the Google Maps top 3. 2 credits per report, or your own keys.",
          requestBody: { required: true, content: json(obj({ niche: { type: "string" }, city: { type: "string" }, country: { type: "string", enum: ["US", "GB", "CA", "AU", "IE", "NZ"], default: "US" }, max_reports: { type: "integer", minimum: 1, maximum: 50, default: 10 }, funding, confirm }, ["niche", "city"])) },
          responses: estimateOr("202", "The batch was started.", obj({ batch_id: uuid, status: { type: "string" }, reports: { type: "integer" }, businesses_found: { type: "integer" }, estimate: ref("Estimate") })),
        },
      },
      "/prospects/{id}": {
        get: {
          operationId: "getProspectBatch", tags: ["Prospects"], summary: "Batch progress and the reports that are ready",
          description: "Each finished report has `report_url`: the live share link of that report, which anyone with the link can open. The PDF of a report is downloaded in the app (Prospects, signed in); this API does not serve PDF files.",
          parameters: [idParam("batch")],
          responses: { "200": { description: "The batch.", content: json(obj({ batch: ref("ProspectBatch"), reports: { type: "array", items: ref("ProspectReport") } })) }, ...errors },
        },
      },
      "/branding": {
        get: { operationId: "getBranding", tags: ["Branding"], summary: "White-label branding shown on share links and PDF reports", responses: { "200": { description: "The branding.", content: json(obj({ branding: ref("Branding") })) }, ...errors } },
        patch: {
          operationId: "updateBranding", tags: ["Branding"], summary: "Change white-label branding",
          description: "Free. Needs lifetime access. Fields you leave out stay as they are; null or an empty string clears a text field. The logo is uploaded in the app.",
          requestBody: { required: true, content: json(obj({
            brand_name: nullable("string", { description: "Agency name, up to 80 characters." }),
            brand_color_hex: nullable("string", { description: "Accent colour as #RRGGBB." }),
            brand_website: nullable("string", { format: "uri", description: "Full web address starting with http:// or https://." }),
            reply_to_email: nullable("string", { format: "email", description: "Address replies go to." }),
            hide_rankbyai_branding: { type: "boolean", description: "true removes RankbyAI's name from reports." },
          })) },
          responses: { "200": { description: "The branding after the change.", content: json(obj({ branding: ref("Branding") })) }, ...errors },
        },
      },
      "/usage": {
        get: { operationId: "getUsage", tags: ["Usage"], summary: "This month's spend on your own keys per provider, and included-scan credits left", responses: { "200": { description: "Usage.", content: json(ref("Usage")) }, ...errors } },
      },
    },
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: "An API key created in the app: rbai_live_ followed by 32 characters." } },
      schemas: {
        Error: obj({ error: { type: "string", description: "Stable machine-readable code." }, message: { type: "string" } }, ["error", "message"]),
        Estimate: {
          ...obj({
            totalUsd: usd("Expected cost of the request."),
            highUsd: usd("Scans: upper bound, when Gemini grounding falls outside its monthly free allowance."),
            credits: { type: "integer", description: "Included-scan credits the request uses with funding: credits." },
            basis: { type: "string", enum: ["published prices", "measured median"], description: "Scans: what the amounts are based on." },
            lines: { type: "array", items: obj({ provider: { type: "string", description: "The vendor billed for this line, where one vendor applies: dataforseo, openai, perplexity or gemini." }, label: { type: "string" }, usd: usd() }, ["label", "usd"]) },
            runsMapsCheck: { type: "boolean", description: "Audits: a Google Maps lookup is included because no Maps scan exists yet." },
            runsAiCheck: { type: "boolean", description: "Audits: an AI check is included because no AI scan exists yet." },
            reports: { type: "integer", description: "Prospect batches: number of reports." },
            perReportUsd: usd("Prospect batches: cost of one report."),
            note: { type: "string" },
            total_usd: { ...usd("Old name of totalUsd on the business-lookup and Fix Kit estimates. It will be removed in the next release: read totalUsd."), deprecated: true },
          }, ["totalUsd", "lines"]),
          description: "What a request would cost. Every estimate has totalUsd and lines; the other fields depend on the request.",
        },
        ConfirmRequired: obj({ confirm_required: { type: "boolean", const: true }, estimate: ref("Estimate"), message: { type: "string" } }, ["confirm_required", "estimate"]),
        Business: obj({
          id: uuid, client_id: nullable("string", { format: "uuid", description: "The client this business is filed under in the app." }), name: { type: "string" }, address: nullable("string"), city: nullable("string"), region: nullable("string"), country: nullable("string"),
          lat: nullable("number"), lng: nullable("number"), website: nullable("string"), phone: nullable("string"), primary_category: nullable("string"),
          rating: nullable("number"), reviews_count: nullable("integer"), source: { type: "string", enum: ["search", "csv", "prospect", "manual"] }, created_at: dateTime,
        }, ["id", "name"]),
        Scan: obj({
          id: uuid, business_id: uuid, kind: { type: "string", enum: ["ai", "maps"] }, keyword: nullable("string"), niche: nullable("string"),
          engines: { type: "array", items: { type: "string", enum: ["openai", "perplexity", "gemini"] } }, grid_size: { type: "integer" }, radius_miles: { type: "number" },
          mode: { type: "string", enum: ["standard", "priority", "live"] }, funding: { type: "string" }, status: scanStatus, credits_used: { type: "integer" },
          est_cost_usd: nullable("number"), actual_cost_usd: nullable("number"), summary: { type: "object", description: "Headline metrics once finished." }, error: nullable("string"),
          created_at: dateTime, finished_at: nullable("string", { format: "date-time" }),
        }, ["id", "kind", "status"]),
        ScanPoints: obj({
          scan_id: uuid, kind: { type: "string", enum: ["ai", "maps"] }, grid_size: { type: "integer" }, status: scanStatus,
          points: { type: "array", items: ref("ScanPoint") },
          samples: { type: "array", items: ref("AiSample"), description: "AI scans: one entry per grid point and engine." },
          note: { type: "string" },
        }, ["scan_id", "kind", "points"]),
        ScanPoint: obj({
          idx: { type: "integer", description: "Number of the point within the grid; `row` and `col` give its position." }, row: { type: "integer" }, col: { type: "integer" }, lat: { type: "number" }, lng: { type: "number" }, label: nullable("string", { description: "AI scans: the neighbourhood or place name used for this point." }),
          rank: nullable("integer", { description: "Maps scans: the business's rank at this point; null when it is not in the results read there." }), top: { type: ["array", "null"], items: { type: "object" }, description: "Maps scans: up to 20 leading results at this point, each with rank, name, domain, rating and reviews." },
          status: { type: "string", enum: ["pending", "posted", "done", "failed"] }, error: nullable("string"),
        }, ["idx", "row", "col", "lat", "lng", "status"]),
        AiSample: obj({
          point_idx: { type: "integer", description: "The idx of the grid point." }, engine: { type: "string", enum: ["openai", "perplexity", "gemini"] }, prompt: { type: "string" }, answer_text: nullable("string"),
          mentioned: nullable("boolean", { description: "Whether the answer names the business." }), mention_position: nullable("integer"),
          named_businesses: { type: "array", items: {}, description: "The businesses the answer names, in order." }, sources: { type: "array", items: {}, description: "The sources the answer cites." },
          status: { type: "string", enum: ["pending", "done", "failed", "skipped"] }, error: nullable("string"),
        }, ["point_idx", "engine", "status"]),
        Audit: obj({
          id: uuid, business_id: uuid, status: auditStatus, score: nullable("integer", { minimum: 0, maximum: 100 }), category_scores: { type: "object" },
          checks_ran: { type: "integer" }, checks_total: { type: "integer" }, funding: { type: "string" }, est_cost_usd: nullable("number"), cost_usd: nullable("number"), error: nullable("string"),
          service: nullable("string"), months: nullable("integer"), created_at: dateTime, finished_at: nullable("string", { format: "date-time" }),
        }, ["id", "status"]),
        Finding: obj({
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] }, category: { type: "string" }, title: { type: "string" },
          evidence: { type: "array", items: obj({ label: { type: "string" }, value: { type: "string" }, source_url: { type: "string" } }) }, fix: { type: "string" }, impact_note: nullable("string"), check_key: { type: "string" },
        }, ["priority", "title", "evidence"]),
        FixKit: obj({
          id: uuid, audit_id: nullable("string", { format: "uuid" }), description: nullable("string", { description: "A factual business description to paste into the Google profile." }),
          faqs: { type: "array", items: { type: "object" }, description: "Questions and answers taken from the business's own pages." },
          jsonld_localbusiness: { type: ["object", "null"], description: "LocalBusiness JSON-LD." }, jsonld_faq: { type: ["object", "null"], description: "FAQPage JSON-LD." },
          llms_txt: nullable("string", { description: "An llms.txt draft." }), checklist: { type: "array", items: {} }, created_at: dateTime,
        }, ["id"]),
        ProspectBatch: obj({
          id: uuid, mode: { type: "string", enum: ["search", "csv"] }, niche: nullable("string"), city: nullable("string"), country: nullable("string"), funding: { type: "string", enum: ["byok", "credits"] },
          total: { type: "integer", description: "Reports in the batch." }, done: { type: "integer" }, failed: { type: "integer" }, status: scanStatus, created_at: dateTime, finished_at: nullable("string", { format: "date-time" }),
        }, ["id", "status", "total", "done", "failed"]),
        ProspectReport: obj({
          business: { type: "string", description: "Name of the business." }, website: nullable("string"), phone: nullable("string"), status: { type: "string", enum: ["queued", "scanning", "auditing", "done", "failed"] }, error: nullable("string"),
          maps_top3_share_pct: nullable("number"), ai_mention_rate_pct: nullable("number"), top_competitor: nullable("string"), opener: nullable("string", { description: "A factual one-sentence opener." }),
          report_url: nullable("string", { format: "uri", description: "Live share link of the report, once it is ready." }), business_id: nullable("string", { format: "uuid" }),
        }, ["business", "status"]),
        Branding: obj({
          brand_name: nullable("string"), brand_color_hex: nullable("string"), brand_website: nullable("string"), reply_to_email: nullable("string"),
          hide_rankbyai_branding: { type: "boolean" }, has_logo: { type: "boolean", description: "Whether a logo is uploaded. The logo is managed in the app." },
        }, ["hide_rankbyai_branding", "has_logo"]),
        Usage: obj({
          period_start: { ...dateTime, description: "Start of the calendar month, UTC." },
          own_keys: obj({ total_usd: usd("What your API vendors billed you this month."), by_provider: { type: "array", items: obj({ provider: { type: "string" }, usd: usd(), calls: { type: "integer" } }, ["provider", "usd", "calls"]) } }, ["total_usd", "by_provider"]),
          included_scans: obj({ credits_left: { type: "integer" } }, ["credits_left"]),
          note: { type: "string" },
        }, ["period_start", "own_keys", "included_scans"]),
      },
    },
  };
}
