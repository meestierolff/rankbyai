/** MCP tool names, shared by the server and the pages that list them. */
export const MCP_TOOLS = [
  "list_businesses", "add_business", "update_business", "delete_business",
  "estimate_scan", "run_ai_scan", "run_maps_scan", "list_scans", "get_scan", "compare_scans", "get_change_note", "run_consistency_check", "get_consistency",
  "run_audit", "list_audits", "get_audit", "get_fix_kit",
  "create_prospect_batch", "list_prospect_batches", "get_prospect_batch", "get_pitch_asset",
  "get_buyer_prompts", "run_prompt_pack", "list_prompt_packs", "get_prompt_pack", "list_cited_sources",
  "get_branding", "update_branding", "get_usage",
] as const;
export type McpTool = (typeof MCP_TOOLS)[number];

/** Tools that can spend money. Each takes `confirm` and does nothing but estimate without it. */
export const MCP_PAID_TOOLS = ["add_business", "run_ai_scan", "run_maps_scan", "run_consistency_check", "run_audit", "get_fix_kit", "create_prospect_batch", "run_prompt_pack"] as const;

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
  get_change_note: read,
  run_consistency_check: run,
  // Like get_scan: may continue the next run the user already started.
  get_consistency: read,
  run_audit: run,
  list_audits: read,
  get_audit: read,
  // Built once with one model call (on the user's keys only after confirm), then returned as stored.
  get_fix_kit: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  create_prospect_batch: run,
  list_prospect_batches: read,
  get_prospect_batch: read,
  get_pitch_asset: read,
  // Reads stored fields and answers, plus one cached OpenStreetMap place-name lookup at the business's map point.
  get_buyer_prompts: { ...read, openWorldHint: true },
  run_prompt_pack: run,
  list_prompt_packs: read,
  // Like get_scan: may continue the run the user already started (its scans, then reading the cited pages).
  get_prompt_pack: read,
  list_cited_sources: read,
  get_branding: read,
  update_branding: overwrite,
  get_usage: read,
};
