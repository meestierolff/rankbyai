import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { ApiCaller } from "@/lib/api-keys";
import { captureServer } from "@/lib/analytics-server";
import * as core from "./core";

/**
 * MCP tools (brief 7.8). Each tool calls the same operation as its REST endpoint.
 * Every tool that spends money takes `confirm`: without it the tool returns the estimate and does
 * nothing else, so an agent has to show the cost before it can run anything.
 */
const GUIDE =
  "RankbyAI measures whether AI assistants (ChatGPT, Perplexity, Gemini) and Google Maps recommend a local business, point by point on a map grid around it. " +
  "Typical flow: add_business → estimate_scan → run_ai_scan and run_maps_scan with confirm → get_scan until status is done → run_audit → get_audit → get_fix_kit. " +
  "Always show the user the estimate before calling a tool with confirm: true. AI answers vary between runs, places and time; report them as observations, not guarantees.";

const funding = z.enum(["byok", "credits"]).default("byok").describe("byok = the user's own API keys; credits = included scans");
const confirm = z.boolean().default(false).describe("false returns the cost estimate only. true runs it and spends money: ask the user first.");
const country = z.enum(["US", "GB", "CA", "AU", "IE", "NZ"]).default("US");

export function buildMcpServer(caller: ApiCaller, defer: core.Defer, siteUrl: string): McpServer {
  const server = new McpServer({ name: "rankbyai", version: "1.0.0" }, { instructions: GUIDE });

  const reply = async (tool: string, run: () => Promise<core.ApiResult>) => {
    const r = await run();
    await captureServer("mcp_tool_called", caller.workspaceId, { tool }).catch(() => undefined);
    return { content: [{ type: "text" as const, text: JSON.stringify(r.body) }], isError: r.status >= 400 };
  };

  server.registerTool("list_businesses", {
    title: "List businesses",
    description: "List the businesses this workspace tracks, newest first. Use the returned id with the other tools. Free.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().min(0).default(0) }),
  }, (a) => reply("list_businesses", () => core.listBusinesses(caller, a)));

  server.registerTool("add_business", {
    title: "Add a business",
    description: "Start tracking a local business. Give name and city to find its Google Maps listing (one paid lookup of about $0.002 on the user's DataForSEO key: needs confirm), or give lat and lng to store it as is (free). The Maps listing matters: scans are centred on it and ranks are matched against it.",
    inputSchema: z.object({ name: z.string().min(1).max(300), city: z.string().max(120).optional(), country, lat: z.number().optional(), lng: z.number().optional(), website: z.string().optional(), phone: z.string().optional(), primary_category: z.string().optional(), confirm }),
  }, (a) => reply("add_business", () => core.addBusiness(caller, a)));

  const scanInput = {
    business_id: z.string().describe("Id from list_businesses or add_business"),
    keyword: z.string().min(2).max(120).describe("The service customers search for, e.g. \"dentist\" or \"emergency plumber\""),
    radius_miles: z.number().positive().max(50).default(2).describe("Half the width of the grid. 2 miles suits a city business; use 5 to 10 for service-area businesses."),
    funding,
  };
  const aiGrid = z.union([z.literal(1), z.literal(3), z.literal(5)]).default(3).describe("3 = 3×3 grid (9 points). 5×5 costs about three times as much.");
  const mapsGrid = z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(9)]).default(7).describe("7 = 7×7 grid (49 points)");
  const engines = z.array(z.enum(["openai", "perplexity", "gemini"])).min(1).max(3).optional().describe("Default: every engine a key is available for");
  const mode = z.enum(["standard", "priority", "live"]).default("priority").describe("Maps queue: standard is cheapest (about 5 minutes), priority about 1 minute, live a few seconds");

  server.registerTool("estimate_scan", {
    title: "Estimate a scan",
    description: "Return what an AI or Maps scan would cost, without running it. Free. Show the result to the user before run_ai_scan or run_maps_scan.",
    inputSchema: z.object({ ...scanInput, kind: z.enum(["ai", "maps"]), grid_size: z.number().int().default(3), engines, mode }),
  }, (a) => reply("estimate_scan", () => core.createScanOp(caller, { ...a, confirm: false }, defer)));

  server.registerTool("run_ai_scan", {
    title: "Run an AI visibility scan",
    description: "Ask each AI engine \"who are the best {keyword} near me?\" at every point of a grid around the business and record whether it names the business, in which position, who it names instead and which sources it cites. Costs money: without confirm it returns the estimate only. Poll get_scan for the result. A low mention rate with strong Maps ranks points at missing sources and thin on-page content; run_audit shows which.",
    inputSchema: z.object({ ...scanInput, grid_size: aiGrid, engines, confirm }),
  }, (a) => reply("run_ai_scan", () => core.createScanOp(caller, { ...a, kind: "ai" }, defer)));

  server.registerTool("run_maps_scan", {
    title: "Run a Google Maps rank scan",
    description: "Read the business's Google Maps rank for the keyword at every point of a grid around it (official data API, top 20 per point). Costs money: without confirm it returns the estimate only. Poll get_scan for the result. Ranks usually fall with distance from the business; a business that is top 3 only near its own door has a proximity-only footprint.",
    inputSchema: z.object({ ...scanInput, grid_size: mapsGrid, mode, confirm }),
  }, (a) => reply("run_maps_scan", () => core.createScanOp(caller, { ...a, kind: "maps" }, defer)));

  server.registerTool("get_scan", {
    title: "Get a scan",
    description: "Status, summary metrics and cost of a scan. Set include_points to also get every grid point (and, for AI scans, each engine's answer with the businesses it named and its sources). Status goes queued → running → done, partial (some points or engines failed) or failed. Free.",
    inputSchema: z.object({ scan_id: z.string(), include_points: z.boolean().default(false) }),
  }, (a) => reply("get_scan", async () => {
    const scan = await core.getScan(caller, a.scan_id, defer);
    if (scan.status >= 400 || !a.include_points) return scan;
    const points = await core.getScanPoints(caller, a.scan_id);
    return points.status >= 400 ? scan : { status: 200, body: { ...scan.body, ...points.body } };
  }));

  server.registerTool("compare_scans", {
    title: "Compare two scans",
    description: "Compare two finished scans of the same business and kind (a = earlier, b = later): per-point changes and headline metric changes. Use it to show whether fixes worked. Free.",
    inputSchema: z.object({ a: z.string(), b: z.string() }),
  }, (a) => reply("compare_scans", () => core.compareScans(caller, a)));

  server.registerTool("run_audit", {
    title: "Run a Local AI Audit",
    description: "Score the business 0–100 against the three competitors that hold the map pack around it: identity (name, address, phone consistency), Google profile, website and schema, reviews, AI presence and competitive gaps. Findings are ranked P0 (broken identity) to P3 and each carries its evidence. Checks that cannot run are reported as not checked, never guessed. Costs money: without confirm it returns the estimate only. Poll get_audit.",
    inputSchema: z.object({ business_id: z.string(), service: z.string().min(2).max(80).describe("The main service, e.g. \"dentist\""), months: z.number().int().min(1).max(12).default(3).describe("Months to close the review gap"), funding, confirm }),
  }, (a) => reply("run_audit", () => core.createAuditOp(caller, a, defer)));

  server.registerTool("get_audit", {
    title: "Get an audit",
    description: "Audit status, score, category scores, how many checks ran, the findings with evidence and fix, and the checks that could not run with the reason. Work P0 findings first: they are identity problems that undermine everything else. Free.",
    inputSchema: z.object({ audit_id: z.string() }),
  }, (a) => reply("get_audit", () => core.getAudit(caller, a.audit_id)));

  server.registerTool("get_fix_kit", {
    title: "Get the Fix Kit",
    description: "Copy-ready fixes for a finished audit: a factual business description, FAQs from the business's own pages, LocalBusiness and FAQPage JSON-LD, an llms.txt draft and a checklist. The first call builds it with one model call (on the user's own keys that needs confirm). RankbyAI does not edit listings or websites: the user pastes these in.",
    inputSchema: z.object({ audit_id: z.string(), confirm }),
  }, (a) => reply("get_fix_kit", () => core.getFixKit(caller, a.audit_id, { confirm: a.confirm })));

  server.registerTool("create_prospect_batch", {
    title: "Create prospect reports",
    description: "For agencies looking for clients: find businesses for a niche and a city and build a report for each of the first max_reports that are outside the Google Maps top 3 (Maps 5×5 grid, AI 3×3 grid, quick audit and a factual one-sentence opener). 2 credits per report or the user's own keys. Costs money: without confirm it returns the estimate only. RankbyAI does not contact the businesses; outreach is the user's own responsibility.",
    inputSchema: z.object({ niche: z.string().min(2).max(80), city: z.string().min(2).max(120), country, max_reports: z.number().int().min(1).max(50).default(10), funding, confirm }),
  }, (a) => reply("create_prospect_batch", () => core.createProspectsOp(caller, a, defer)));

  server.registerTool("get_prospect_batch", {
    title: "Get a prospect batch",
    description: "Progress of a prospect batch and, for each finished report: Maps top-3 share, AI mention rate, the competitor named most often, the opener and the live report URL. A batch takes about 5 to 10 minutes. Free.",
    inputSchema: z.object({ batch_id: z.string() }),
  }, (a) => reply("get_prospect_batch", () => core.getProspects(caller, a.batch_id, siteUrl, defer)));

  server.registerTool("get_usage", {
    title: "Get usage",
    description: "This month's spend on the user's own API keys per provider, and the included-scan credits left. Free.",
    inputSchema: z.object({}),
  }, () => reply("get_usage", () => core.getUsage(caller)));

  return server;
}

export { MCP_PAID_TOOLS, MCP_TOOLS } from "./mcp-tools";
