/**
 * Copy-paste setup for MCP clients. Formats checked against each client's documentation on
 * 17 Nov 2026 (docs/vendor-api-notes.md, section 5).
 */
export function mcpSnippets(siteUrl: string, key = "rbai_live_YOUR_KEY") {
  const url = `${siteUrl}/api/mcp`;
  return [
    {
      id: "claude_code", title: "Claude Code", where: "Run in a terminal",
      code: `claude mcp add --transport http rankbyai ${url} \\\n  --header "Authorization: Bearer ${key}"`,
    },
    {
      id: "cursor", title: "Cursor", where: "~/.cursor/mcp.json (or .cursor/mcp.json in a project)",
      code: JSON.stringify({ mcpServers: { rankbyai: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
    },
    {
      id: "claude_desktop", title: "Claude Desktop", where: "Settings → Developer → Edit Config (claude_desktop_config.json), then restart Claude",
      code: JSON.stringify({ mcpServers: { rankbyai: { command: "npx", args: ["-y", "mcp-remote", url, "--header", "Authorization:${RANKBYAI_AUTH}"], env: { RANKBYAI_AUTH: `Bearer ${key}` } } } }, null, 2),
    },
    {
      id: "curl", title: "REST (curl)", where: "Any terminal",
      code: `curl ${siteUrl}/api/v1/businesses \\\n  -H "Authorization: Bearer ${key}"`,
    },
  ];
}
