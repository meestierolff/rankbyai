import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { ApiCaller } from "@/lib/api-keys";
import { captureServer } from "@/lib/analytics-server";
import { largerMapsGridsText, largestOneCreditMapsGrid } from "@/lib/cost/credits";
import { AI_GRID_SIZES, MAPS_GRID_SIZES } from "@/lib/pricing-constants";
import { MAX_POINT_IDX } from "@/lib/scans/skip";
import * as core from "./core";
import * as packs from "./packs";
import { PACK_MAX_PROMPTS, PACK_MAX_REPEATS, PACK_PROMPT_MAX } from "@/lib/packs/prompts";
import { COUNTRY_CODES, DEFAULT_COUNTRY, languageName, languageNameFor } from "@/lib/countries";
import { SECOND_LANGUAGES } from "@/lib/scans/consistency-run";
import { auditFixPrompt } from "@/lib/audit/prompt";
import { MCP_TOOL_HINTS, type McpTool } from "./mcp-tools";
import { reportOriginForAuthorisedWorkspace } from "@/lib/domains-origin";

/**
 * MCP tools (brief 7.8). Each tool calls the same operation as its REST endpoint.
 * Every tool that spends money takes `confirm`: without it the tool returns the estimate and does
 * nothing else, so an agent has to show the cost before it can run anything.
 *
 * Results carry the same JSON twice: as `structuredContent` (an object) and as text, for clients
 * that read text only. Tools whose successful result has one fixed shape also publish an
 * `outputSchema`; tools that answer with either an estimate or a started job do not.
 */
const GUIDE =
  "RankbyAI measures whether AI assistants (ChatGPT, Perplexity, Gemini) and Google Maps recommend a local business, point by point on a map grid around it. " +
  "Typical flow: add_business → estimate_scan → run_ai_scan and run_maps_scan with confirm → get_scan until status is done → run_audit → get_audit → get_fix_kit. " +
  "To check whether a difference is real or normal variation, run_consistency_check asks the same grid twice (and optionally in a second language); get_consistency shows what stayed the same. " +
  "After a re-check, get_change_note explains what changed between the latest scan and the previous one (mentions, names, cited sources), with possible reasons only where stored evidence exists. " +
  "For a finished prospect report, get_pitch_asset returns a short email teaser and an image for the user to copy; RankbyAI never sends email. " +
  "Citation workflow (which pages the AI answers lean on): get_buyer_prompts → let the user edit the prompts → run_prompt_pack without confirm (estimate) → run_prompt_pack with confirm → get_prompt_pack until the run is done → list_cited_sources (missing_only: true for pages that leave the business out). " +
  "list_scans, list_audits, list_prospect_batches and list_prompt_packs find earlier work; update_business and delete_business manage the tracked businesses; get_branding and update_branding manage the white-label fields on reports. " +
  "Always show the user the estimate before calling a tool with confirm: true. AI answers vary between runs, places and time; report them as observations, not guarantees. " +
  "When advising on an audit, use the prompt fix_plan (or follow the same order): P0 first (the business's identity, and whether search engines and AI crawlers may read the site), then P1 (gaps against the map pack), then P2 (pages, schema, FAQ), then P3. " +
  "Guardrails: never suggest adding keywords or a city to the Google Business Profile name unless it is the registered name, buying or gating reviews, fake listings or second locations that are not real staffed places, fake clicks or visits, link schemes, or blocking search or AI search crawlers; use only facts from the audit, the website or the user.";

const funding = z.enum(["byok", "credits"]).default("byok").describe("byok = the user's own API keys; credits = included scans");
const confirm = z.boolean().default(false).describe("false returns the cost estimate only. true runs it and spends money: ask the user first.");
const country = z.enum(COUNTRY_CODES).default(DEFAULT_COUNTRY).describe("Country of the business: ISO 3166-1 alpha-2 code, e.g. US, GB, DE, NL");
const paging = {
  limit: z.number().int().min(1).max(core.PAGE_LIMIT_MAX).default(50).describe("How many to return (1 to 200)"),
  offset: z.number().int().min(0).max(core.PAGE_OFFSET_MAX).default(0).describe("How many to skip, for the next page"),
};
const id = (what: string) => z.string().describe(`Id (a UUID) of the ${what}`);
/** "1, 3 or 5" */
const numberList = (xs: readonly number[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}` : xs.join(""));

// Output shapes. Objects are open (extra fields are allowed) so a new column never breaks a client.
const open = z.looseObject;
const text = z.string().nullish();
const num = z.number().nullish();
const page = { limit: z.number(), offset: z.number() };
const businessOut = open({ id: z.string(), name: z.string(), client_id: text, address: text, city: text, region: text, country: text, lat: num, lng: num, website: text, phone: text, primary_category: text, source: z.string(), created_at: z.string() });
const scanOut = open({ id: z.string(), business_id: z.string(), kind: z.enum(["ai", "maps"]), keyword: text, grid_size: z.number(), status: z.enum(["queued", "running", "done", "partial", "failed"]), funding: z.string(), est_cost_usd: num, actual_cost_usd: num, summary: open({}), created_at: z.string(), finished_at: text });
const auditOut = open({ id: z.string(), business_id: z.string(), status: z.enum(["queued", "running", "done", "failed"]), score: num, checks_ran: z.number(), checks_total: z.number(), funding: z.string(), est_cost_usd: num, cost_usd: num, service: text, months: num, created_at: z.string(), finished_at: text });
const batchOut = open({ id: z.string(), mode: z.string(), niche: text, city: text, funding: z.string(), total: z.number(), done: z.number(), failed: z.number(), status: z.enum(["queued", "running", "done", "partial", "failed"]), created_at: z.string(), finished_at: text });
const estimateOut = open({ totalUsd: z.number(), highUsd: z.number().optional(), credits: z.number().optional(), basis: z.string().optional(), lines: z.array(open({ provider: z.string().optional(), label: z.string(), usd: z.number() })) });
const brandingOut = open({ branding: open({ brand_name: text, brand_color_hex: text, brand_website: text, reply_to_email: text, hide_rankbyai_branding: z.boolean(), report_default_view: z.enum(["map", "grid"]).optional(), has_logo: z.boolean() }) });

/** A tool's annotations: its title and the hints in MCP_TOOL_HINTS. */
const hints = (name: McpTool, title: string) => ({ title, ...MCP_TOOL_HINTS[name] });

export function buildMcpServer(caller: ApiCaller, defer: core.Defer, siteUrl: string): McpServer {
  // Stateless and POST only: there is no stream to announce a changed tool list on, so listChanged is off.
  const server = new McpServer({ name: "rankbyai", version: "1.2.0" }, { instructions: GUIDE, capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } } });

  const reply = async (tool: string, run: () => Promise<core.ApiResult>) => {
    const r = await run();
    await captureServer("mcp_tool_called", caller.workspaceId, { tool }).catch(() => undefined);
    return { content: [{ type: "text" as const, text: JSON.stringify(r.body) }], structuredContent: r.body, isError: r.status >= 400 };
  };

  // ───────────────────────── businesses ─────────────────────────

  server.registerTool("list_businesses", {
    title: "List businesses",
    annotations: hints("list_businesses", "List businesses"),
    description: "List the businesses this workspace tracks, newest first. Use the returned id with the other tools. Free.",
    inputSchema: z.object(paging),
    outputSchema: open({ businesses: z.array(businessOut), ...page }),
  }, (a) => reply("list_businesses", () => core.listBusinesses(caller, a)));

  server.registerTool("add_business", {
    title: "Add a business",
    annotations: hints("add_business", "Add a business"),
    description: "Start tracking a local business. Give name and city to find its Google Maps listing (one paid lookup of about $0.002 on the user's DataForSEO key: needs confirm), or give lat and lng to store it as is (free). The Maps listing matters: scans are centred on it and ranks are matched against it.",
    inputSchema: z.object({
      name: z.string().min(1).max(300), city: z.string().max(120).optional(), country,
      lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
      address: z.string().max(400).optional().describe("Street address. Stored as given when lat and lng are sent."),
      website: z.string().max(500).optional().describe("Must start with http:// or https://"), phone: z.string().max(40).optional(), primary_category: z.string().max(120).optional(), confirm,
    }),
  }, (a) => reply("add_business", () => core.addBusiness(caller, a)));

  server.registerTool("update_business", {
    title: "Update a business",
    annotations: hints("update_business", "Update a business"),
    description: "Change the name, address, city, client, map point or language of a tracked business. Fields you leave out stay as they are; null clears address, city, client_id or language. lat and lng correct the map point (for a pin in the wrong place); schedules on the old point move with it. language sets the language of text written for the business (Fix Kit). The Google Maps listing does not change. Free.",
    inputSchema: z.object({
      business_id: id("business"), name: z.string().min(1).max(300).optional(), address: z.string().max(400).nullable().optional(), city: z.string().max(120).nullable().optional(),
      client_id: z.string().nullable().optional().describe("Id (a UUID) of a client of this workspace; clients are made in the app. null takes the business out of its client."),
      lat: z.number().min(-90).max(90).optional().describe("New map point latitude (send with lng)"),
      lng: z.number().min(-180).max(180).optional().describe("New map point longitude (send with lat)"),
      language: z.string().nullable().optional().describe("Language code for text written for the business, e.g. de, nl, fr; null = the country's language"),
      ask_in_language: z.boolean().optional().describe("true asks the AI assistants in the business's language (German, Dutch, French, Spanish, Italian, Portuguese, Swedish, Danish, Norwegian, Polish); false asks in English. Changing it makes the next AI scan not comparable point by point with earlier ones."),
    }),
    outputSchema: open({ business: businessOut }),
  }, ({ business_id, ...fields }) => reply("update_business", () => core.updateBusiness(caller, business_id, fields)));

  server.registerTool("delete_business", {
    title: "Delete a business",
    annotations: hints("delete_business", "Delete a business"),
    description: "Delete a tracked business together with its scans, audits, Fix Kits, schedules and reports; its share links stop working. This cannot be undone: ask the user first. Free.",
    inputSchema: z.object({ business_id: id("business") }),
    outputSchema: open({ deleted: z.boolean(), id: z.string() }),
  }, (a) => reply("delete_business", () => core.deleteBusiness(caller, a.business_id)));

  // ───────────────────────── scans ─────────────────────────

  const scanInput = {
    business_id: z.string().describe("Id from list_businesses or add_business"),
    keyword: z.string().min(2).max(120).describe("The service customers search for, e.g. \"dentist\" or \"emergency plumber\""),
    radius_miles: z.number().positive().max(50).default(2).describe("Half the width of the grid. 2 miles suits a city business; use 5 to 10 for service-area businesses."),
    center_lat: z.number().min(-90).max(90).optional().describe("Optional grid centre (with center_lng), for a service-area business or a pin in the wrong place. Default: the business's map point. At most 100 miles from it."),
    center_lng: z.number().min(-180).max(180).optional().describe("Optional grid centre (with center_lat)."),
    funding,
  };
  const aiGrid = z.literal(AI_GRID_SIZES).default(3).describe("3 = 3×3 grid (9 points). 5×5 costs about three times as much.");
  const largerGrids = largerMapsGridsText();
  const mapsGrid = z.literal(MAPS_GRID_SIZES).default(7).describe(
    `7 = 7×7 grid (49 points). The price is per point checked. On included scans a grid up to ${largestOneCreditMapsGrid()} uses 1 credit${largerGrids ? `; ${largerGrids}` : ""}.`,
  );
  const anyGridSizes = [...new Set([...AI_GRID_SIZES, ...MAPS_GRID_SIZES])].sort((x, y) => x - y) as [number, ...number[]];
  const anyGrid = z.literal(anyGridSizes).default(3).describe(
    `Points per side. AI scans: ${numberList(AI_GRID_SIZES)}. Maps scans: ${numberList(MAPS_GRID_SIZES)}.`,
  );
  const skipPoints = z.array(z.number().int().min(0).max(MAX_POINT_IDX)).max(MAX_POINT_IDX).optional().describe(
    "Grid points NOT to check, for areas the user does not want tracked (water, a park, outside the service area). Each point is its idx: row × grid_size + col, row 0 in the north and col 0 in the west, so 0 is the north-west corner and the business is the centre point. Skipped points are never looked up and cost nothing; at least one point must stay active. get_scan with include_points lists them with status skipped.",
  );
  const engines = z.array(z.enum(["openai", "perplexity", "gemini"])).min(1).max(3).optional().describe("Default: every engine a key is available for");
  const mode = z.enum(["standard", "priority", "live"]).default("priority").describe("Maps queue: standard is cheapest (about 5 minutes), priority about 1 minute, live a few seconds");

  server.registerTool("estimate_scan", {
    title: "Estimate a scan",
    annotations: hints("estimate_scan", "Estimate a scan"),
    description: "Return what an AI or Maps scan would cost, without running it. Free. Show the result to the user before run_ai_scan or run_maps_scan.",
    inputSchema: z.object({ ...scanInput, kind: z.enum(["ai", "maps"]), grid_size: anyGrid, skip_points: skipPoints, engines, mode }),
    outputSchema: open({ confirm_required: z.boolean(), estimate: estimateOut, message: z.string() }),
  }, (a) => reply("estimate_scan", () => core.createScanOp(caller, { ...a, confirm: false }, defer)));

  server.registerTool("run_ai_scan", {
    title: "Run an AI visibility scan",
    annotations: hints("run_ai_scan", "Run an AI visibility scan"),
    description: "Ask each AI engine \"who are the best {keyword} near me?\" at every point of a grid around the business and record whether it names the business, in which position, who it names instead and which sources it cites. Costs money: without confirm it returns the estimate only. Poll get_scan for the result. skip_points leaves out points the user does not want asked about. A low mention rate with strong Maps ranks points at missing sources and thin on-page content; run_audit shows which.",
    inputSchema: z.object({
      ...scanInput, grid_size: aiGrid, skip_points: skipPoints, engines,
      prompt_template: z.string().max(400).optional().describe("Optional wording of the question asked at each point. Must contain {service} and {neighbourhood} or {city}. Leave it out for the standard question."),
      confirm,
    }),
  }, (a) => reply("run_ai_scan", () => core.createScanOp(caller, { ...a, kind: "ai" }, defer)));

  server.registerTool("run_maps_scan", {
    title: "Run a Google Maps rank scan",
    annotations: hints("run_maps_scan", "Run a Google Maps rank scan"),
    description: "Read the business's Google Maps rank for the keyword at every point of a grid around it (official data API, top 20 per point). Costs money: without confirm it returns the estimate only. Poll get_scan for the result. skip_points leaves out points the user does not want tracked (water, a park, outside the service area); they cost nothing. Ranks usually fall with distance from the business; a business that is top 3 only near its own door has a proximity-only footprint.",
    inputSchema: z.object({ ...scanInput, grid_size: mapsGrid, skip_points: skipPoints, mode, confirm }),
  }, (a) => reply("run_maps_scan", () => core.createScanOp(caller, { ...a, kind: "maps" }, defer)));

  server.registerTool("list_scans", {
    title: "List scans",
    annotations: hints("list_scans", "List scans"),
    description: "List the workspace's scans, newest first, with status, summary metrics and cost. Narrow the list with business_id, kind or status. Use get_scan for the grid points of one scan. Free.",
    inputSchema: z.object({ ...paging, business_id: id("business").optional(), kind: z.enum(["ai", "maps"]).optional(), status: z.enum(["queued", "running", "done", "partial", "failed"]).optional() }),
    outputSchema: open({ scans: z.array(scanOut), ...page }),
  }, (a) => reply("list_scans", () => core.listScans(caller, a)));

  server.registerTool("get_scan", {
    title: "Get a scan",
    annotations: hints("get_scan", "Get a scan"),
    description: "Status, summary metrics and cost of a scan. Set include_points to also get every grid point (and, for AI scans, each engine's answer with the businesses it named and its sources). Status goes queued → running → done, partial (some points or engines failed) or failed. Free.",
    inputSchema: z.object({ scan_id: id("scan"), include_points: z.boolean().default(false) }),
  }, (a) => reply("get_scan", async () => {
    const scan = await core.getScan(caller, a.scan_id, defer);
    if (scan.status >= 400 || !a.include_points) return scan;
    const points = await core.getScanPoints(caller, a.scan_id);
    return points.status >= 400 ? scan : { status: 200, body: { ...scan.body, ...points.body } };
  }));

  server.registerTool("compare_scans", {
    title: "Compare two scans",
    annotations: hints("compare_scans", "Compare two scans"),
    description: "Compare two finished scans of the same business and kind (a = earlier, b = later): per-point changes and headline metric changes. Use it to show whether fixes worked. Free.",
    inputSchema: z.object({ a: id("earlier scan"), b: id("later scan") }),
    outputSchema: open({ kind: z.enum(["ai", "maps"]), a: z.string(), b: z.string(), headline: z.string(), comparison: open({}) }),
  }, (a) => reply("compare_scans", () => core.compareScans(caller, a)));

  server.registerTool("get_change_note", {
    title: "Why it changed",
    annotations: hints("get_change_note", "Why it changed"),
    description: "A weekly-style note on what changed between two AI scans of a business: points and answers naming it per engine and its average position (changes only where both scans have data), businesses that appeared or disappeared from the answers, cited sources added or removed (with the engines, example URLs and a question that cited them), and possible reasons only where stored evidence exists (a source that came or went in answers naming the business, a crawler finding from an audit, a Google Maps move). Give business_id for its latest finished scan against the previous comparable one, or a and b. Also returns the note as Markdown to copy. Never say a reason is certain: models do not explain their choices. Reads stored scans only; it never runs one. Free.",
    inputSchema: z.object({
      business_id: id("business").optional().describe("Latest finished AI scan of this business against the previous comparable one (same service, question, grid, engines and place)"),
      a: id("earlier AI scan").optional(), b: id("later AI scan").optional(),
    }),
    outputSchema: open({
      change_note: open({
        status: z.enum(["ready", "not_ready"]), message: z.string().optional(), business: z.string(),
        window: open({ from: z.string(), to: z.string() }), scans: open({ before: z.string(), after: z.string() }),
        comparable: open({ notes: z.array(z.string()) }),
        engines: z.array(open({ engine: z.string(), mention_rate_change: num, avg_position_change: num })),
        names: open({ appeared: z.array(open({ name: z.string() })), disappeared: z.array(open({ name: z.string() })) }),
        sources: open({ added: z.array(open({ domain: z.string() })), removed: z.array(open({ domain: z.string() })) }),
        possible_reasons: z.array(open({ text: z.string(), evidence: z.string() })),
        disclaimer: z.string(),
      }),
      markdown: z.string(),
    }),
  }, (a) => reply("get_change_note", () => core.getChangeNote(caller, a)));

  server.registerTool("run_consistency_check", {
    title: "Run a consistency check",
    annotations: hints("run_consistency_check", "Run a consistency check"),
    description: "Ask the same AI grid twice (repeat: 2) and/or in a second language (second_language: a language with a written question, or your own prompt_template, plus the service as people say it in that language), one run after another, to tell a real difference from normal variation. One run is not a stable ranking. Costs money: the estimate is the number of runs × one grid's estimate (2 runs for repeat or a second language once, 4 for both). Without confirm it returns the estimate only. Then poll get_consistency with the group_id. The runs are tagged so they never replace the business's latest scan.",
    inputSchema: z.object({
      ...scanInput, grid_size: aiGrid, skip_points: skipPoints, engines,
      prompt_template: z.string().max(400).optional().describe("Optional wording of the first question (same rules as run_ai_scan)."),
      repeat: z.union([z.literal(1), z.literal(2)]).default(2).describe("2 asks every question twice (measures normal variation). 1 only with second_language."),
      second_language: z.object({
        language: z.enum(SECOND_LANGUAGES).optional().describe("A language RankbyAI has a written question in (en is the standard English question)"),
        prompt_template: z.string().max(400).optional().describe("Or your own question in that language; must contain {service} and {neighbourhood} or {city}"),
        keyword: z.string().min(2).max(120).describe("The service as people say it in that language, e.g. Zahnarzt. Never translated for you."),
      }).optional(),
      confirm,
    }),
  }, (a) => reply("run_consistency_check", () => core.createConsistencyOp(caller, a, defer)));

  server.registerTool("get_consistency", {
    title: "Get a consistency check",
    annotations: hints("get_consistency", "Get a consistency check"),
    description: "The runs of a consistency check (group_id from run_consistency_check) and, once they finished: same_question (run 1 vs run 2), second_question_repeat and across_questions (the two languages). Each has the share of mention decisions that agreed (stability_rate), per engine and per point, and the businesses named in both runs or only in one. A language difference only means something when it is larger than the difference between two runs of the same question: say so. Or compare two AI scans you choose (a and b, same grid). Polling also continues the next run. Free.",
    inputSchema: z.object({ group_id: id("consistency check").optional(), a: id("first AI scan").optional(), b: id("second AI scan").optional() }),
    outputSchema: open({ consistency: open({ group_id: text, business: z.string(), status: z.enum(["running", "done"]), runs: z.array(open({ role: z.string(), scan_id: z.string(), status: z.string(), question: z.string() })), disclaimer: z.string() }) }),
  }, (a) => reply("get_consistency", () => core.getConsistency(caller, a, defer)));

  // ───────────────────────── audits ─────────────────────────

  server.registerTool("run_audit", {
    title: "Run a Local AI Audit",
    annotations: hints("run_audit", "Run a Local AI Audit"),
    description: "Score the business 0–100 against the three competitors that hold the map pack around it: identity (name, address, phone consistency), Google profile, website and schema, reviews, AI presence and competitive gaps. Findings are ranked P0 (broken identity) to P3 and each carries its evidence. Checks that cannot run are reported as not checked, never guessed. Costs money: without confirm it returns the estimate only. Poll get_audit.",
    inputSchema: z.object({ business_id: id("business"), service: z.string().min(2).max(80).describe("The main service, e.g. \"dentist\""), months: z.number().int().min(1).max(12).default(3).describe("Months to close the review gap"), funding, confirm }),
  }, (a) => reply("run_audit", () => core.createAuditOp(caller, a, defer)));

  server.registerTool("list_audits", {
    title: "List audits",
    annotations: hints("list_audits", "List audits"),
    description: "List the workspace's audits, newest first, with status, score and cost. Narrow the list with business_id or status. Use get_audit for the findings of one audit. Free.",
    inputSchema: z.object({ ...paging, business_id: id("business").optional(), status: z.enum(["queued", "running", "done", "failed"]).optional() }),
    outputSchema: open({ audits: z.array(auditOut), ...page }),
  }, (a) => reply("list_audits", () => core.listAudits(caller, a)));

  server.registerTool("get_audit", {
    title: "Get an audit",
    annotations: hints("get_audit", "Get an audit"),
    description: "Audit status, score, category scores, how many checks ran, the findings with evidence and fix, and the checks that could not run with the reason. Crawler findings (robots.txt and what the server answers requests that name a crawler) also carry `crawlers`: per crawler the likely cause, how sure it is, and step-by-step fixes to pass on; never present a medium or low confidence cause as certain. Work P0 findings first: they are identity problems that undermine everything else. Free.",
    inputSchema: z.object({ audit_id: id("audit") }),
    outputSchema: open({
      audit: auditOut,
      findings: z.array(open({
        priority: z.enum(["P0", "P1", "P2", "P3"]), category: z.string(), title: z.string(), evidence: z.array(open({})), fix: z.string(), impact_note: text, check_key: z.string(),
        crawlers: z.array(open({ agent: z.string(), purpose: z.enum(["search", "training", "user_fetch"]), blocked_by: z.enum(["robots_txt", "server"]), evidence: z.string(), cause: z.string(), confidence: z.enum(["high", "medium", "low"]), where_to_look: z.array(z.string()), steps: z.array(z.string()), verify: z.string() })).optional()
          .describe("Crawler findings only (ai_crawlers, crawler_http): per crawler, whether it is a search or training crawler, the evidence, the likely cause with a confidence, where to look, the steps and a command to check the fix"),
      })),
      not_checked: z.array(open({ check: z.string(), title: z.string(), reason: text })),
    }),
  }, (a) => reply("get_audit", () => core.getAudit(caller, a.audit_id)));

  server.registerTool("get_fix_kit", {
    title: "Get the Fix Kit",
    annotations: hints("get_fix_kit", "Get the Fix Kit"),
    description: "Copy-ready fixes for a finished audit: a factual business description, FAQs from the business's own pages, LocalBusiness and FAQPage JSON-LD, an llms.txt draft and a checklist. The first call builds it with one model call (on the user's own keys that needs confirm). RankbyAI does not edit listings or websites: the user pastes these in.",
    inputSchema: z.object({ audit_id: id("audit"), confirm }),
  }, (a) => reply("get_fix_kit", () => core.getFixKit(caller, a.audit_id, { confirm: a.confirm })));

  // ───────────────────────── prospects ─────────────────────────

  server.registerTool("create_prospect_batch", {
    title: "Create prospect reports",
    annotations: hints("create_prospect_batch", "Create prospect reports"),
    description: "For agencies looking for clients: build a report (Maps 5×5 grid, AI 3×3 grid, quick audit and a factual one-sentence opener) for businesses. Either search: give niche and city, and reports are built for the first max_reports businesses outside the Google Maps top 3. Or name them: give niche and businesses [{name, city}], and each one found on Google Maps gets a report (for example a business a lead asked about, or the lead's own business, with niche set to what it sells). 2 credits per report or the user's own keys. Costs money: without confirm it returns the estimate only. RankbyAI does not contact the businesses; outreach is the user's own responsibility.",
    inputSchema: z.object({
      niche: z.string().min(2).max(80).describe("The service the AI assistants are asked about and the Google Maps keyword, e.g. dentist or seo agency"),
      city: z.string().min(2).max(120).optional().describe("Search mode: the city to search. Not needed with businesses."),
      country,
      max_reports: z.number().int().min(1).max(50).default(10).describe("Search mode only"),
      businesses: z.array(z.object({ name: z.string().min(2).max(160), city: z.string().min(2).max(120), country: country.optional(), website: z.string().max(300).optional() })).min(1).max(20).optional()
        .describe("Named mode: the businesses to report on, each looked up on Google Maps by name and city"),
      funding,
      confirm,
    }),
  }, (a) => reply("create_prospect_batch", () => core.createProspectsOp(caller, a, defer)));

  server.registerTool("list_prospect_batches", {
    title: "List prospect batches",
    annotations: hints("list_prospect_batches", "List prospect batches"),
    description: "List the workspace's prospect batches, newest first, with their progress. Use get_prospect_batch for the reports of one batch. Free.",
    inputSchema: z.object({ ...paging, status: z.enum(["queued", "running", "done", "partial", "failed"]).optional() }),
    outputSchema: open({ batches: z.array(batchOut), ...page }),
  }, (a) => reply("list_prospect_batches", () => core.listProspectBatches(caller, a)));

  server.registerTool("get_prospect_batch", {
    title: "Get a prospect batch",
    annotations: hints("get_prospect_batch", "Get a prospect batch"),
    description: "Progress of a prospect batch and, for each finished report: Maps top-3 share, AI mention rate, the competitor named most often, the opener and report_url, the live share link of the report. The PDF of a report is downloaded in the app. A batch takes about 5 to 10 minutes. Free.",
    inputSchema: z.object({ batch_id: id("batch") }),
    outputSchema: open({
      batch: batchOut,
      reports: z.array(open({ business: z.string(), website: text, phone: text, status: z.string(), error: text, maps_top3_share_pct: num, ai_mention_rate_pct: num, top_competitor: text, opener: text, report_url: text, business_id: text })),
    }),
  }, (a) => reply("get_prospect_batch", () => core.getProspects(caller, a.batch_id, siteUrl, defer)));

  server.registerTool("get_pitch_asset", {
    title: "Get the email teaser of a prospect report",
    annotations: hints("get_pitch_asset", "Get the email teaser of a prospect report"),
    description: "For a finished prospect report: a short plain-text email (subject and 4 to 8 lines) that opens with the business's own AI and Google Maps numbers and the rivals ahead of it at the same grid points, an image_url with that comparison (PNG), and report_url, the full report. Every number and name comes from the stored report; a line whose data is missing is left out and listed in omitted. RankbyAI does not send email: give the text to the user to copy into their own mail client. Free.",
    inputSchema: z.object({ batch_id: id("batch"), business_id: id("business in the batch (business_id from get_prospect_batch)") }),
    outputSchema: open({
      business: z.string(), business_id: z.string(), report_url: z.string(), image_url: z.string(),
      email: open({ subject: text, text: z.string(), lines: z.array(z.string()) }),
      comparison: open({ metric: z.enum(["ai_points", "maps_top3_points"]), of: z.number(), you: open({ name: z.string(), value: z.number() }), rivals: z.array(open({ name: z.string(), value: z.number() })) }).nullable(),
      omitted: z.array(open({ line: z.string(), reason: z.string() })),
      note: z.string(),
    }),
  }, (a) => reply("get_pitch_asset", async () => core.getPitchAsset(caller, a.batch_id, { business_id: a.business_id }, await reportOriginForAuthorisedWorkspace(caller.workspaceId))));

  // ───────────────────────── citation workflow ─────────────────────────

  const missingOut = open({ basis: z.enum(["page", "answers"]), client_absent: z.boolean(), competitors_present: z.array(z.string()) });
  const pageTypes = z.enum(["listicle", "review", "directory", "official_site", "forum", "social", "maps_listing", "other"]);

  server.registerTool("get_buyer_prompts", {
    title: "Suggest buyer prompts",
    annotations: hints("get_buyer_prompts", "Suggest buyer prompts"),
    description: "About ten buyer prompts for a business (\"Who is the best dentist in Austin?\", \"Who is the best dentist near me?\", \"Top 10 dentist options in Austin\"), written from its stored fields: service, city, the area at its map point, its Google category, and up to two businesses its stored AI answers named often. Nothing is invented and nothing runs: show them to the user to edit, then pass the list to run_prompt_pack. In English; the user may rewrite them in another language. scope online gives prompts without a place, for a product or service sold online (\"What are the best SEO tools?\", \"What is the best alternative to <competitor>?\"). Free.",
    inputSchema: z.object({
      business_id: id("business"),
      service: z.string().min(2).max(120).optional().describe("What people search for, e.g. dentist, or SEO for an online product. Default: the service of the business's latest AI scan, else its category."),
      scope: z.enum(["local", "online"]).default("local").describe("local = a business people visit or call in a place; online = something sold online, prompts without a place"),
    }),
    outputSchema: open({ business_id: z.string(), business: z.string(), service: z.string(), scope: z.string(), suggestions: z.array(open({ text: z.string(), kind: z.string(), note: z.string().optional() })), note: z.string() }),
  }, (a) => reply("get_buyer_prompts", () => packs.suggestPromptsOp(caller, a)));

  server.registerTool("run_prompt_pack", {
    title: "Run a prompt pack",
    annotations: hints("run_prompt_pack", "Run a prompt pack"),
    description: `Ask ChatGPT, Perplexity and Gemini a pack of buyer prompts (1 to ${PACK_MAX_PROMPTS}) for one business and store every answer: the businesses named and the pages cited. scope online is for a product or service sold online: prompts without a place, asked with no location settings. location pin (default) asks each prompt once at the business's map point; grid asks it at every point of a 3×3 or 5×5 grid. repeats (default 1, up to ${PACK_MAX_REPEATS}) asks each prompt again, because one run is not a stable ranking. Runs on the user's own API keys only. Costs money: without confirm it returns the estimate (one AI scan's estimate × prompts × repeats, with alternatives for pin and grid) and missing_keys, and creates nothing. Send pack_id instead to run a saved pack again with its own prompts and settings. Then poll get_prompt_pack. After the answers are in, RankbyAI reads the most-cited pages (free) to see whether they name the business.`,
    inputSchema: z.object({
      business_id: id("business").optional().describe("The business (for a new pack)"),
      pack_id: id("prompt pack").optional().describe("Run this saved pack again; the other fields are ignored"),
      name: z.string().max(120).optional(),
      service: z.string().min(2).max(120).optional().describe("What people search for, e.g. dentist ({service} in a prompt)"),
      prompts: z.array(z.string().max(PACK_PROMPT_MAX)).min(1).max(PACK_MAX_PROMPTS).optional().describe("The prompts as the user approved them. {service}, {city}, {neighbourhood} and {area} are filled in; any other text is asked as written."),
      engines: z.array(z.enum(["openai", "perplexity", "gemini"])).min(1).max(3).optional().describe("Default: every engine the user has a key for"),
      location: z.enum(["pin", "grid"]).default("pin").describe("pin = once at the business's map point (cheapest); grid = at every point of a grid"),
      grid_size: z.union([z.literal(3), z.literal(5)]).default(3).describe("Grid size when location is grid"),
      radius_miles: z.number().positive().max(50).default(2).describe("Half the grid's width when location is grid"),
      repeats: z.number().int().min(1).max(PACK_MAX_REPEATS).default(1).describe("Times each prompt is asked in this run; each repeat costs one more scan per prompt"),
      scope: z.enum(["local", "online"]).default("local").describe("online = prompts without a place for something sold online (\"best SEO tools\"): asked once with no location settings, Gemini grounded on Google Search instead of Google Maps. location must stay pin."),
      confirm,
    }),
  }, (a) => reply("run_prompt_pack", () => packs.runPackOp(caller, a, defer)));

  server.registerTool("list_prompt_packs", {
    title: "List prompt packs",
    annotations: hints("list_prompt_packs", "List prompt packs"),
    description: "The workspace's prompt packs, newest first, each with its prompts, settings and latest run (status, estimated and actual cost). Narrow with business_id. Free.",
    inputSchema: z.object({ ...paging, business_id: id("business").optional() }),
    outputSchema: open({ packs: z.array(open({ id: z.string(), business_id: z.string(), name: z.string(), service: z.string(), prompts: z.array(z.string()), runs: z.number(), latest_run: open({ id: z.string(), status: z.string() }).nullable() })), ...page }),
  }, (a) => reply("list_prompt_packs", () => packs.listPacksOp(caller, a)));

  server.registerTool("get_prompt_pack", {
    title: "Get a prompt pack run",
    annotations: hints("get_prompt_pack", "Get a prompt pack run"),
    description: "A prompt pack and one run (default: the latest): status and cost, and per prompt and engine how many answers named the business, its average position, and the businesses named instead; the run's share of answers per business (answers naming it ÷ answers naming any business); and its ten most-cited pages. Every number is counted from stored answers. Polling also continues the run. Free.",
    inputSchema: z.object({ pack_id: id("prompt pack"), run_id: id("run").optional() }),
  }, (a) => reply("get_prompt_pack", () => packs.getPackOp(caller, a.pack_id, { run_id: a.run_id }, defer)));

  server.registerTool("list_cited_sources", {
    title: "List cited sources",
    annotations: hints("list_cited_sources", "List cited sources"),
    description: "Every page (group_by url) or site (group_by domain) that prompt pack answers cited, most cited first: page type with a confidence (listicle, review, directory, official_site, forum, social, maps_listing, other: from the address and title only), answers that cited it and how many named the business, engines, first seen, last seen and disappeared on. missing says whether the business is left out and on what basis: page (RankbyAI read the page) or answers (only the answers that cited it). missing_only: true lists the pages to work on. Scope: run_id, pack_id (its latest runs) or business_id (all its packs). Send url or domain for its history run by run. No authority or traffic figures here. Free.",
    inputSchema: z.object({
      ...paging, business_id: id("business").optional(), pack_id: id("prompt pack").optional(), run_id: id("run").optional(),
      group_by: z.enum(["url", "domain"]).default("url"), missing_only: z.boolean().default(false), page_type: pageTypes.optional(),
      url: z.string().max(2048).optional().describe("One page's history run by run"), domain: z.string().max(253).optional().describe("One site's history run by run"),
    }),
    outputSchema: open({
      scope: open({ business_id: z.string(), business: z.string(), runs: z.number(), answers: z.number() }),
      urls: z.array(open({ url: z.string(), domain: z.string(), page_type: pageTypes, answers: z.number(), answers_naming_client: z.number(), first_seen: z.string(), last_seen: z.string(), disappeared_on: text, missing: missingOut })).optional(),
      domains: z.array(open({ domain: z.string(), answers: z.number(), urls: z.number(), client_absent: z.boolean() })).optional(),
      history: z.array(open({ run_id: z.string(), date: z.string(), answers: z.number(), answers_naming_client: z.number() })).optional(),
      note: z.string(),
    }),
  }, (a) => reply("list_cited_sources", () => packs.listCitedSourcesOp(caller, a)));

  // ───────────────────────── branding and usage ─────────────────────────

  server.registerTool("get_branding", {
    title: "Get white-label branding",
    annotations: hints("get_branding", "Get white-label branding"),
    description: "The agency branding shown on share links and PDF reports: name, colour, website, reply-to address, whether RankbyAI's own branding is hidden, and whether a logo is uploaded. Free.",
    inputSchema: z.object({}),
    outputSchema: brandingOut,
  }, () => reply("get_branding", () => core.getBranding(caller)));

  server.registerTool("update_branding", {
    title: "Update white-label branding",
    annotations: hints("update_branding", "Update white-label branding"),
    description: "Change the agency branding on share links and PDF reports. Fields you leave out stay as they are; null clears a text field. The logo is uploaded in the app. Needs lifetime access. Free.",
    inputSchema: z.object({
      brand_name: z.string().max(80).nullable().optional().describe("Agency name"),
      brand_color_hex: z.string().nullable().optional().describe("Accent colour as #RRGGBB"),
      brand_website: z.string().max(300).nullable().optional().describe("Full web address starting with https://"),
      reply_to_email: z.string().max(254).nullable().optional().describe("Address replies to report emails go to"),
      hide_rankbyai_branding: z.boolean().optional().describe("true removes RankbyAI's name from reports"),
      report_default_view: z.enum(["map", "grid"]).optional().describe("Whether report links open on the map or on the rank grid"),
    }),
    outputSchema: brandingOut,
  }, (a) => reply("update_branding", () => core.updateBranding(caller, a)));

  server.registerTool("get_usage", {
    title: "Get usage",
    annotations: hints("get_usage", "Get usage"),
    description: "This month's spend on the user's own API keys per provider, and the included-scan credits left. Free.",
    inputSchema: z.object({}),
    outputSchema: open({ period_start: z.string(), own_keys: open({ total_usd: z.number(), by_provider: z.array(open({ provider: z.string(), usd: z.number(), calls: z.number() })) }), included_scans: open({ credits_left: z.number() }), note: z.string() }),
  }, () => reply("get_usage", () => core.getUsage(caller)));

  // ───────────────────────── prompts ─────────────────────────

  server.registerPrompt("fix_plan", {
    title: "Fix plan from an audit",
    description: "Turns a finished Local AI Audit into a prioritised fix list (P0 first) with how to work and guardrails, ready for the assistant to act on. Free.",
    argsSchema: z.object({ audit_id: z.string().describe("Id (a UUID) of a finished audit, from run_audit or list_audits") }),
  }, async ({ audit_id }) => {
    await captureServer("mcp_tool_called", caller.workspaceId, { tool: "prompt:fix_plan" }).catch(() => undefined);
    const text = await fixPlanText(caller, audit_id);
    return { description: "Prioritised fix plan from a RankbyAI audit", messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
  });

  return server;
}

/** The fix_plan prompt's text: the audit prompt, or a plain sentence saying why there is none. */
async function fixPlanText(caller: ApiCaller, auditId: string): Promise<string> {
  const a = await core.getAudit(caller, auditId);
  if (a.status >= 400) return `RankbyAI could not load audit ${auditId.slice(0, 36)}: check the id with list_audits.`;
  const body = a.body as { audit: { business_id: string; status: string; score: number | null; service: string | null }; findings: { priority: string; title: string; fix: string }[] };
  if (body.audit.status !== "done") return `That audit is ${body.audit.status}, not finished. Call get_audit until its status is done, then use this prompt again.`;
  const b = await core.getBusiness(caller, body.audit.business_id);
  const business = (b.body as { business?: { name: string; city: string | null; website: string | null; primary_category: string | null; language: string | null; country: string | null } }).business;
  if (!business) return "The business this audit belongs to has been deleted, so there is no fix plan to make.";
  const prompt = auditFixPrompt({
    business: { name: business.name, city: business.city, website: business.website, category: business.primary_category },
    language: languageName(business.language) ?? languageNameFor(business.country),
    service: body.audit.service, score: body.audit.score, findings: body.findings,
  });
  return prompt ?? "Every check in this audit that could run passed: there is nothing to fix. Suggest running an AI scan to see where AI assistants name the business.";
}

export { MCP_PAID_TOOLS, MCP_TOOL_HINTS, MCP_TOOLS } from "./mcp-tools";
