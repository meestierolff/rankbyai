/** MCP tool names, shared by the server and the pages that list them. */
export const MCP_TOOLS = [
  "list_businesses", "add_business", "update_business", "delete_business",
  "estimate_scan", "run_ai_scan", "run_maps_scan", "list_scans", "get_scan", "compare_scans",
  "run_audit", "list_audits", "get_audit", "get_fix_kit",
  "create_prospect_batch", "list_prospect_batches", "get_prospect_batch",
  "get_branding", "update_branding", "get_usage",
] as const;
/** Tools that can spend money. Each takes `confirm` and does nothing but estimate without it. */
export const MCP_PAID_TOOLS = ["add_business", "run_ai_scan", "run_maps_scan", "run_audit", "get_fix_kit", "create_prospect_batch"] as const;
