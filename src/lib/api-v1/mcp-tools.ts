/** MCP tool names, shared by the server and the pages that list them. */
export const MCP_TOOLS = [
  "list_businesses", "add_business", "update_business", "delete_business",
  "estimate_scan", "run_ai_scan", "run_maps_scan", "list_scans", "get_scan", "compare_scans",
  "run_audit", "list_audits", "get_audit", "get_fix_kit",
  "create_prospect_batch", "list_prospect_batches", "get_prospect_batch", "get_pitch_asset",
  "get_branding", "update_branding", "get_usage",
] as const;
export type McpTool = (typeof MCP_TOOLS)[number];

/** Tools that can spend money. Each takes `confirm` and does nothing but estimate without it. */
export const MCP_PAID_TOOLS = ["add_business", "run_ai_scan", "run_maps_scan", "run_audit", "get_fix_kit", "create_prospect_batch"] as const;

export interface ToolHints {
  /** Changes nothing in the workspace. */
  readOnlyHint: boolean;
  /** Can overwrite or delete existing data (only meaningful when not read-only). */
  destructiveHint?: boolean;
  /** Calling again with the same arguments has no further effect (only meaningful when not read-only). */
  idempotentHint?: boolean;
  /** Reaches outside RankbyAI's own data: Google Maps data, AI engines, competitor websites. */
  openWorldHint: boolean;
}

/** Changes nothing. destructiveHint is spelled out as false: some directories require all three hints on every tool. */
const read: ToolHints = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
/** Starts paid work that queries outside services and adds new records; nothing existing is changed. */
const run: ToolHints = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
/** Overwrites fields of an existing record with the values given. */
const overwrite: ToolHints = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

/**
 * MCP tool annotations (hints for clients; the server never relies on them for security).
 * estimate_scan and the get/list tools change nothing. get_scan and get_prospect_batch may finish
 * work that is already queued, which the user started earlier, so they stay read-only.
 */
export const MCP_TOOL_HINTS: Record<McpTool, ToolHints> = {
  list_businesses: read,
  add_business: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  update_business: overwrite,
  delete_business: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  estimate_scan: read,
  run_ai_scan: run,
  run_maps_scan: run,
  list_scans: read,
  get_scan: read,
  compare_scans: read,
  run_audit: run,
  list_audits: read,
  get_audit: read,
  // Built once with one model call (on the user's keys only after confirm), then returned as stored.
  get_fix_kit: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  create_prospect_batch: run,
  list_prospect_batches: read,
  get_prospect_batch: read,
  get_pitch_asset: read,
  get_branding: read,
  update_branding: overwrite,
  get_usage: read,
};
