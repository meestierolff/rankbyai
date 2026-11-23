import { gridSizesText, largerMapsGridsText, largestOneCreditMapsGrid } from "@/lib/cost/credits";
import { AI_GRID_SIZES, MAPS_GRID_SIZES } from "@/lib/pricing-constants";
import { MAX_POINT_IDX } from "@/lib/scans/skip";
import { COUNTRY_CODES } from "@/lib/countries";
import { PACK_MAX_PROMPTS, PACK_MAX_REPEATS, PACK_PROMPT_MAX } from "@/lib/packs/prompts";

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
const ANY_GRID = [...new Set([...AI_GRID_SIZES, ...MAPS_GRID_SIZES])].sort((x, y) => x - y);
const gridSides = (sizes: readonly number[]) => gridSizesText(sizes).replace(/(\d+)×\d+/g, "$1");
const largerGrids = largerMapsGridsText();
const skipPoints = {
  type: "array", maxItems: MAX_POINT_IDX, uniqueItems: true,
  items: { type: "integer", minimum: 0, maximum: MAX_POINT_IDX },
  description:
    "Grid points not to check, for areas you do not want tracked (water, a park, outside the service area). Each point is its idx: row × grid_size + col, row 0 in the north and col 0 in the west, so 0 is the north-west corner and the business is the centre point. " +
    "Skipped points are never looked up and cost nothing; the estimate and the credits count the active points only. Every number must be a point of the grid, each once, and at least one point must stay active (otherwise 400 invalid_spec). They come back in the scan's `skip_points` and as points with status `skipped`.",
};
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
    tags: [{ name: "Businesses" }, { name: "Scans" }, { name: "Audits" }, { name: "Prospects" }, { name: "Citations" }, { name: "Branding" }, { name: "Usage" }],
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
          requestBody: { required: true, content: json(obj({ name: { type: "string" }, city: { type: "string" }, country: { type: "string", enum: [...COUNTRY_CODES], default: "US" }, lat: { type: "number", minimum: -90, maximum: 90 }, lng: { type: "number", minimum: -180, maximum: 180 }, address: { type: "string" }, website: { type: "string", format: "uri" }, phone: { type: "string" }, primary_category: { type: "string" }, confirm }, ["name"])) },
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
          operationId: "updateBusiness", tags: ["Businesses"], summary: "Change the name, address, city, client, map point or language of a business",
          description: "Free. Fields you leave out stay as they are. `lat` and `lng` (together) correct the map point; schedules on the old point move with it. `language` sets the language of text written for the business. The Google Maps listing does not change. Other fields answer 400.",
          parameters: [idParam("business")],
          requestBody: { required: true, content: json(obj({
            name: { type: "string", description: "1 to 300 characters." },
            address: nullable("string", { description: "null or an empty string clears it." }),
            city: nullable("string", { description: "null or an empty string clears it." }),
            client_id: nullable("string", { format: "uuid", description: "A client of this workspace (clients are made in the app). null takes the business out of its client." }),
            lat: { type: "number", minimum: -90, maximum: 90, description: "New map point, sent together with lng." },
            lng: { type: "number", minimum: -180, maximum: 180, description: "New map point, sent together with lat." },
            language: nullable("string", { description: "Language code (e.g. de, nl, fr) for text written for the business. null = its country's language." }),
            ask_in_language: { type: "boolean", description: "true asks AI assistants in the business's language where RankbyAI has a written question for it (de, nl, fr, es, it, pt, sv, da, no, pl); false asks in English." },
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
          description: `\`kind: ai\` asks the AI engines who they recommend at each grid point (grid ${gridSides(AI_GRID_SIZES)}). \`kind: maps\` reads the Google Maps rank at each point (grid ${gridSides(MAPS_GRID_SIZES)}); with funding: credits a grid up to ${largestOneCreditMapsGrid()} uses 1 credit${largerGrids ? ` and ${largerGrids}` : ""}. \`skip_points\` leaves out points you do not want checked.`,
          requestBody: { required: true, content: json(obj({
            business_id: uuid, kind: { type: "string", enum: ["ai", "maps"] },
            keyword: { type: "string", description: "The service people search for, e.g. \"dentist\". `prompt` is accepted as an alias." },
            prompt_template: { type: "string", description: "AI scans only. Must contain {service} and {neighbourhood} or {city}." },
            grid_size: { type: "integer", enum: ANY_GRID, description: `AI scans: ${gridSides(AI_GRID_SIZES)}. Maps scans: ${gridSides(MAPS_GRID_SIZES)}.` }, radius_miles: { type: "number", default: 2, maximum: 50 },
            skip_points: skipPoints,
            center_lat: { type: "number", minimum: -90, maximum: 90, description: "Optional grid centre, sent together with center_lng. Default: the business's map point. At most 100 miles from it." },
            center_lng: { type: "number", minimum: -180, maximum: 180, description: "Optional grid centre, sent together with center_lat." },
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
      "/scans/change-note": {
        get: {
          operationId: "getChangeNote", tags: ["Scans"], summary: "Why it changed: what changed between two AI scans",
          description: "With `business_id`: the business's latest finished AI scan against the previous one that asked the same question on the same grid (the previous run of the same schedule first). Or give two AI scan ids `a` and `b`. Per engine: answers naming the business and its average position (changes only where both scans have data); businesses that appeared or disappeared from the answers; cited sources added or removed, with engines, example URLs and a question that cited them; possible reasons only where stored evidence exists. `markdown` is the same note to copy. A scan that has not finished gives `status: not_ready` and no changes. Reads stored scans only: free, and it never runs a scan.",
          parameters: [
            { name: "business_id", in: "query", description: "Latest finished AI scan of this business against the previous comparable one.", schema: uuid },
            { name: "a", in: "query", description: "Earlier AI scan (with b).", schema: uuid },
            { name: "b", in: "query", description: "Later AI scan (with a).", schema: uuid },
          ],
          responses: { "200": { description: "The note.", content: json(obj({ change_note: { type: "object", description: "status, business, window, scans, comparable, points, engines, names, sources, possible_reasons, disclaimer." }, markdown: { type: "string" } }, ["change_note", "markdown"])) }, ...errors },
        },
      },
      "/scans/consistency": {
        post: {
          operationId: "runConsistencyCheck", tags: ["Scans"], summary: "Run a consistency check (same AI grid twice, optionally in a second language)",
          description: "Asks the same AI grid twice (`repeat: 2`) and/or in a second language (`second_language`), one run after another, to tell a real difference from normal variation. The estimate is the number of runs × one grid's estimate: 2 runs for a repeat or a second language once, 4 for both; each line is one run's vendor line. Without `confirm: true` nothing is created. Everything the whole check needs (room for a running scan, credits for every run, today's cap) is checked before the first run starts. The runs never replace the business's latest scan. POST /scans stays the single-run endpoint.",
          requestBody: { required: true, content: json(obj({
            business_id: uuid, keyword: { type: "string", description: "The service, as in POST /scans." },
            grid_size: { type: "integer", enum: [...AI_GRID_SIZES] }, radius_miles: { type: "number", default: 2 },
            engines: { type: "array", items: { type: "string", enum: ["openai", "perplexity", "gemini"] } },
            prompt_template: { type: "string", maxLength: 400, description: "Optional wording of the first question." },
            skip_points: skipPoints,
            repeat: { type: "integer", enum: [1, 2], default: 2, description: "2 asks every question twice. 1 only together with second_language." },
            second_language: obj({
              language: { type: "string", enum: ["en", "de", "nl", "fr", "es", "it", "pt", "sv", "da", "no", "pl"], description: "A language RankbyAI has a written question in (en is the standard English question)." },
              prompt_template: { type: "string", maxLength: 400, description: "Or your own question in that language (with {service} and {neighbourhood} or {city})." },
              keyword: { type: "string", description: "The service as people say it in that language. Never translated for you." },
            }, ["keyword"]),
            center_lat: { type: "number" }, center_lng: { type: "number" }, funding, confirm,
          }, ["business_id", "keyword", "grid_size"])) },
          responses: estimateOr("202", "The runs were created and run one after another.", obj({ group_id: uuid, scan_ids: { type: "array", items: uuid }, runs: { type: "array", items: obj({ role: { type: "string", enum: ["A1", "A2", "B1", "B2"] }, scan_id: uuid }) }, status: { type: "string" }, estimate: ref("Estimate") })),
        },
        get: {
          operationId: "getConsistency", tags: ["Scans"], summary: "The runs of a consistency check and how stable the answers were",
          description: "With `group_id`: the runs and, once both runs of a pair finished, `same_question` (run 1 vs run 2), `second_question_repeat` and `across_questions`. Each gives `decisions` (mention decisions both runs answered, how many agreed, `stability_rate` in percent), the same per engine and per point, and `names`: other businesses named in both runs, only in one, and their overlap. Or two AI scans of your choice with `a` and `b` (same grid). Polling continues the next run of a group. Free.",
          parameters: [
            { name: "group_id", in: "query", description: "From POST /scans/consistency.", schema: uuid },
            { name: "a", in: "query", schema: uuid }, { name: "b", in: "query", schema: uuid },
          ],
          responses: { "200": { description: "The check.", content: json(obj({ consistency: { type: "object", description: "group_id, business, status, runs, same_question, second_question_repeat, across_questions, disclaimer." } }, ["consistency"])) }, ...errors },
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
          description: "Search mode: finds businesses for `niche` in `city` and builds a report for the first `max_reports` that are outside the Google Maps top 3. Named mode: give `businesses` instead of `city`; each is looked up on Google Maps by name and city and gets a report wherever it ranks, and names that are not found come back in `unresolved`. `niche` is the service the AI assistants are asked about. 2 credits per report, or your own keys.",
          requestBody: { required: true, content: json(obj({
            niche: { type: "string" }, city: { type: "string" }, country: { type: "string", enum: [...COUNTRY_CODES], default: "US" }, max_reports: { type: "integer", minimum: 1, maximum: 50, default: 10 },
            businesses: { type: "array", minItems: 1, maxItems: 20, items: obj({ name: { type: "string" }, city: { type: "string" }, country: { type: "string", enum: [...COUNTRY_CODES] }, website: { type: "string" } }, ["name", "city"]) },
            funding, confirm,
          }, ["niche"])) },
          responses: estimateOr("202", "The batch was started.", obj({ batch_id: uuid, status: { type: "string" }, reports: { type: "integer" }, businesses_found: { type: "integer" }, unresolved: { type: "array", items: obj({ name: { type: "string" }, city: { type: "string" }, reason: { type: "string" } }) }, estimate: ref("Estimate") })),
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
      "/prospects/{id}/pitch": {
        get: {
          operationId: "getPitchAsset", tags: ["Prospects"], summary: "Email teaser of one finished prospect report",
          description: "A short plain-text email that opens with the business's own AI and Google Maps numbers and the rivals ahead of it at the same grid points, an image of that comparison (PNG, opened by anyone with the report link, like the report), and the report link. Every number and name comes from the stored report; a line whose data is missing is left out and listed in `omitted`. Free. RankbyAI does not send email.",
          parameters: [idParam("batch"), { name: "business_id", in: "query", required: true, description: "business_id of a report in this batch, from GET /prospects/{id}.", schema: uuid }],
          responses: {
            "200": { description: "The teaser.", content: json(ref("PitchAsset")) },
            "409": { description: "The report is not ready yet.", content: json(ref("Error")) },
            ...errors,
          },
        },
      },
      "/packs": {
        get: {
          operationId: "listPromptPacks", tags: ["Citations"], summary: "List prompt packs",
          parameters: [...paging, { name: "business_id", in: "query", description: "Packs of this business.", schema: uuid }],
          responses: { "200": { description: "Packs, newest first, each with its latest run.", content: json(obj({ packs: { type: "array", items: { type: "object", description: "id, business_id, name, service, prompts, engines, location, grid_size, radius_miles, repeats, runs, latest_run." } }, ...page })) }, ...errors },
        },
        post: {
          operationId: "runPromptPack", tags: ["Citations"], summary: "Estimate or run a prompt pack (buyer prompts on ChatGPT, Perplexity and Gemini)",
          description: "Asks a pack of buyer prompts for one business and stores every answer, the businesses it named and the pages it cited. One AI scan per prompt and repeat, so the estimate is one AI scan's estimate × prompts × repeats; `alternatives` prices the same pack at the business's map point and on 3×3 and 5×5 grids, and `missing_keys` lists engines without a key. Runs on your own API keys only. Without `confirm: true` nothing is created. Send `pack_id` to run a saved pack again with its own prompts and settings. The scans never replace the business's latest scan. After the answers are in, RankbyAI reads the most-cited pages (no vendor cost) to see whether they name the business.",
          requestBody: { required: true, content: json(obj({
            business_id: uuid, pack_id: { ...uuid, description: "Run this saved pack again; the other fields are ignored." },
            name: { type: "string", maxLength: 120 }, service: { type: "string", description: "What people search for, e.g. dentist." },
            prompts: { type: "array", minItems: 1, maxItems: PACK_MAX_PROMPTS, items: { type: "string", maxLength: PACK_PROMPT_MAX }, description: "{service}, {city}, {neighbourhood} and {area} are filled in; any other text is asked as written." },
            engines: { type: "array", items: { type: "string", enum: ["openai", "perplexity", "gemini"] }, description: "Default: every engine you have a key for." },
            location: { type: "string", enum: ["pin", "grid"], default: "pin" }, grid_size: { type: "integer", enum: [3, 5], default: 3 }, radius_miles: { type: "number", default: 2 },
            repeats: { type: "integer", minimum: 1, maximum: PACK_MAX_REPEATS, default: 1 },
            scope: { type: "string", enum: ["local", "online"], default: "local", description: "online: prompts without a place, for something sold online. Asked once with no location settings; Gemini is grounded on Google Search instead of Google Maps. location must be pin." }, confirm,
          })) },
          responses: estimateOr("202", "The pack's scans were created and run.", obj({ pack_id: uuid, run_id: uuid, scan_ids: { type: "array", items: uuid }, status: { type: "string" }, estimate: ref("Estimate") })),
        },
      },
      "/packs/suggest": {
        get: {
          operationId: "suggestBuyerPrompts", tags: ["Citations"], summary: "Suggested buyer prompts for a business",
          description: "About ten prompts written from the business's stored fields (service, city, the area at its map point, its Google category) and up to two businesses its stored answers named often. Nothing is invented and nothing runs. In English. Free.",
          parameters: [
            { name: "business_id", in: "query", required: true, schema: uuid }, { name: "service", in: "query", description: "Default: the service of the latest AI scan, else the Google category.", schema: { type: "string" } },
            { name: "scope", in: "query", description: "online: prompts without a place, for something sold online.", schema: { type: "string", enum: ["local", "online"], default: "local" } },
          ],
          responses: { "200": { description: "The suggestions.", content: json(obj({ business_id: uuid, business: { type: "string" }, service: { type: "string" }, suggestions: { type: "array", items: obj({ text: { type: "string" }, kind: { type: "string" }, note: { type: "string" } }) }, note: { type: "string" } })) }, ...errors },
        },
      },
      "/packs/{id}": {
        get: {
          operationId: "getPromptPack", tags: ["Citations"], summary: "A prompt pack and one run's results",
          description: "Status and cost of a run (default: the latest), per prompt and engine the answers that named the business and its average position, the businesses named instead, the run's share of answers per business, and its ten most-cited pages. Counted from stored answers only. Polling continues the run. Free.",
          parameters: [idParam("prompt pack"), { name: "run_id", in: "query", description: "Another run of this pack.", schema: uuid }],
          responses: { "200": { description: "The pack and run.", content: json(obj({ pack: { type: "object" }, business: { type: "string" }, runs: { type: "array", items: { type: "object" } }, run: nullable("object"), results: nullable("object"), top_sources: { type: "array", items: { type: "object" } }, disclaimer: { type: "string" } })) }, ...errors },
        },
      },
      "/citations": {
        get: {
          operationId: "listCitedSources", tags: ["Citations"], summary: "Pages and sites the prompt pack answers cited",
          description: "Most cited first, by page (`group_by=url`) or site (`group_by=domain`): page type with a confidence (from the address and title only), answers that cited it and how many named the business, engines, first seen, last seen and disappeared on. `missing` says whether the business is left out and on which basis: `page` (RankbyAI read the page) or `answers` (only the answers that cited it). Scope with `run_id`, `pack_id` (its latest runs) or `business_id` (all its packs). `url` or `domain` returns that page's or site's history run by run. No authority or traffic figures. Free.",
          parameters: [
            ...paging,
            { name: "business_id", in: "query", schema: uuid }, { name: "pack_id", in: "query", schema: uuid }, { name: "run_id", in: "query", schema: uuid },
            { name: "group_by", in: "query", schema: { type: "string", enum: ["url", "domain"], default: "url" } },
            { name: "missing_only", in: "query", description: "Only pages that leave the business out (never Google Maps listings or its own site).", schema: { type: "boolean", default: false } },
            { name: "page_type", in: "query", schema: { type: "string", enum: ["listicle", "review", "directory", "official_site", "forum", "social", "maps_listing", "other"] } },
            { name: "url", in: "query", description: "One page's history.", schema: { type: "string" } }, { name: "domain", in: "query", description: "One site's history.", schema: { type: "string" } },
          ],
          responses: { "200": { description: "The inventory.", content: json(obj({ scope: { type: "object" }, group_by: { type: "string" }, total: { type: "integer" }, urls: { type: "array", items: { type: "object" } }, domains: { type: "array", items: { type: "object" } }, history: { type: "array", items: { type: "object" } }, note: { type: "string" }, ...page })) }, ...errors },
        },
      },
      "/citation-targets": {
        get: {
          operationId: "listCitationTargetSearches", tags: ["Citations"], summary: "List citation target searches",
          parameters: [...paging, { name: "business_id", in: "query", schema: uuid }],
          responses: { "200": { description: "Searches, newest first (without their pages).", content: json(obj({ searches: { type: "array", items: { type: "object" } }, ...page })) }, ...errors },
        },
        post: {
          operationId: "findCitationTargets", tags: ["Citations"], summary: "Estimate or run a citation target search (DataForSEO Backlinks, your own login)",
          description: "Pages that link to up to three competitors from a list page (the linking page's address contains `url_contains`: default best, top-, review, plus the city and near-me and known directories for a local business), which of them already link to the business, the pages AI answers cited in the business's prompt packs that leave it out, and DataForSEO's estimated monthly traffic per page. Without `competitors`, the businesses the answers named most often that a stored Google Maps scan gives a website for (never guessed). The estimate is an upper bound from DataForSEO's published per-call and per-row prices; the cost each response reports is recorded. Runs on your own DataForSEO login only. Without `confirm: true` nothing is created.",
          requestBody: { required: true, content: json(obj({
            business_id: uuid, pack_id: uuid,
            competitors: { type: "array", maxItems: 3, items: obj({ name: { type: "string" }, domain: { type: "string", description: "Website, e.g. localfalcon.com" } }, ["domain"]) },
            url_contains: { type: "array", maxItems: 7, items: { type: "string" } },
            rows_per_site: { type: "integer", minimum: 1, maximum: 1000, default: 200 }, traffic_pages: { type: "integer", minimum: 0, maximum: 1000, default: 400 },
            scope: { type: "string", enum: ["local", "online"] }, confirm,
          }, ["business_id"])) },
          responses: estimateOr("202", "The search was created and runs.", obj({ list_id: uuid, status: { type: "string" }, estimate: { type: "object" }, competitors: { type: "array", items: { type: "object" } }, client_domain: nullable("string"), url_contains: { type: "array", items: { type: "string" } } })),
        },
      },
      "/citation-targets/{id}": {
        get: {
          operationId: "getCitationTargets", tags: ["Citations"], summary: "The pages of a citation target search",
          description: "Per page: url, title, page_type, etv (DataForSEO's estimated monthly organic traffic; null when none), page_rank (DataForSEO's own 0–1000 rank, not Ahrefs DR), competitors_linked, client_linked, client_named_on_page, cited (how AI answers cited it), source and action (pitch, directory_claim, skip) with action_reason. Sorted: cited pages first, then by estimated traffic. Polling finishes a search. Free.",
          parameters: [idParam("citation target search"), ...paging, { name: "action", in: "query", schema: { type: "string", enum: ["pitch", "directory_claim", "skip"] } }, { name: "cited_only", in: "query", schema: { type: "boolean", default: false } }],
          responses: { "200": { description: "The search and its pages.", content: json(obj({ search: { type: "object" }, total: { type: "integer" }, targets: { type: "array", items: { type: "object" } }, note: { type: "string" }, ...page })) }, ...errors },
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
            report_default_view: { type: "string", enum: ["map", "grid"], description: "Whether report links open on the map or on the rank grid." },
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
            points: { type: "integer", description: "Scans: grid points that will be checked." },
            skipped: { type: "integer", description: "Scans: grid points left out with skip_points." },
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
          lat: nullable("number"), lng: nullable("number"), language: nullable("string", { description: "Language for text written for the business; null = its country's language." }), ask_in_language: { type: "boolean", description: "Whether AI assistants are asked in that language (where a written question exists) instead of English." }, website: nullable("string"), phone: nullable("string"), primary_category: nullable("string"),
          rating: nullable("number"), reviews_count: nullable("integer"), source: { type: "string", enum: ["search", "csv", "prospect", "manual"] }, created_at: dateTime,
        }, ["id", "name"]),
        Scan: obj({
          id: uuid, business_id: uuid, kind: { type: "string", enum: ["ai", "maps"] }, keyword: nullable("string"), niche: nullable("string"),
          engines: { type: "array", items: { type: "string", enum: ["openai", "perplexity", "gemini"] } }, grid_size: { type: "integer" },
          skip_points: { type: "array", items: { type: "integer" }, description: "idx of the grid points that were not checked." }, radius_miles: { type: "number" },
          mode: { type: "string", enum: ["standard", "priority", "live"] }, funding: { type: "string" }, status: scanStatus, credits_used: { type: "integer" },
          est_cost_usd: nullable("number"), actual_cost_usd: nullable("number"), summary: { type: "object", description: "Headline metrics once finished. Skipped points are left out of every metric: `points` counts the active points and `points_skipped` the skipped ones." }, error: nullable("string"),
          created_at: dateTime, finished_at: nullable("string", { format: "date-time" }),
          consistency_run: { ...nullable("object"), description: "Set for a run of a consistency check: `group_id` (for GET /scans/consistency) and `role` (A1 the question as asked, A2 the same again, B1 and B2 the second question). A2, B1 and B2 are repeats or second-language runs: never treat them as the business's latest scan.", properties: { group_id: uuid, role: { type: "string", enum: ["A1", "A2", "B1", "B2"] } } },
          prompt_pack_run: { ...nullable("object"), description: "Set for a scan of a prompt pack: `run_id`, `prompt` (0-based index in the pack) and `repeat` (from 1). It asked a buyer prompt, not the business's tracked question: never treat it as the business's latest scan. See GET /packs/{id}.", properties: { run_id: uuid, prompt: { type: "integer" }, repeat: { type: "integer" } } },
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
          status: { type: "string", enum: ["pending", "posted", "done", "failed", "skipped"], description: "skipped: left out with skip_points; never looked up." }, error: nullable("string"),
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
          crawlers: {
            type: "array",
            description: "Crawler findings only (check_key ai_crawlers or crawler_http): one entry per crawler. `confidence` is high when robots.txt says it in so many words, medium when Cloudflare's own response headers show Cloudflare refused a request that named the crawler, low for a refusal by a server or firewall that cannot be identified.",
            items: obj({
              agent: { type: "string" }, purpose: { type: "string", enum: ["search", "training", "user_fetch"], description: "search crawlers decide whether the business can be recommended; training crawlers do not, and the business may choose to block them." },
              serves: { type: "string" }, blocked_by: { type: "string", enum: ["robots_txt", "server"] },
              evidence: { type: "string", description: "The robots.txt lines quoted, or the status and headers of the refused request." },
              cause: { type: "string" }, confidence: { type: "string", enum: ["high", "medium", "low"] },
              where_to_look: { type: "array", items: { type: "string" }, description: "When the exact setting cannot be seen from outside: the places to look." },
              steps: { type: "array", items: { type: "string" } }, verify: { type: "string", description: "A command to check the fix." }, caveat: nullable("string"),
            }, ["agent", "purpose", "blocked_by", "evidence", "cause", "confidence", "steps", "verify"]),
          },
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
        PitchAsset: obj({
          business: { type: "string" }, business_id: uuid,
          report_url: { type: "string", format: "uri", description: "Live link of the full report." },
          image_url: { type: "string", format: "uri", description: "PNG, 1200×630: the business against the rivals ahead of it. Without a rival ahead it is the report's link preview." },
          email: obj({ subject: nullable("string"), text: { type: "string", description: "The lines joined with newlines, ready to paste." }, lines: { type: "array", items: { type: "string" } } }, ["text", "lines"]),
          comparison: { ...nullable("object"), description: "What the image shows.", properties: { metric: { type: "string", enum: ["ai_points", "maps_top3_points"] }, of: { type: "integer", description: "Grid points counted." }, you: obj({ name: { type: "string" }, value: { type: "integer" } }), rivals: { type: "array", items: obj({ name: { type: "string" }, value: { type: "integer" } }) } } },
          omitted: { type: "array", description: "Lines left out because the report has no data for them.", items: obj({ line: { type: "string", enum: ["ai", "rivals", "maps", "audit", "report_link"] }, reason: { type: "string" } }, ["line", "reason"]) },
          note: { type: "string" },
        }, ["business", "report_url", "image_url", "email", "omitted"]),
        Branding: obj({
          brand_name: nullable("string"), brand_color_hex: nullable("string"), brand_website: nullable("string"), reply_to_email: nullable("string"),
          hide_rankbyai_branding: { type: "boolean" }, report_default_view: { type: "string", enum: ["map", "grid"] }, has_logo: { type: "boolean", description: "Whether a logo is uploaded. The logo is managed in the app." },
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
