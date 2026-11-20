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

/** Setup with OAuth sign-in (MCP_OAUTH on): the client needs only the URL and opens a RankbyAI sign-in itself. */
export function mcpOAuthSnippets(siteUrl: string) {
  const url = `${siteUrl}/api/mcp`;
  return [
    { id: "claude_connector", title: "Claude (web and desktop)", where: "Settings → Connectors → Add custom connector, paste the URL, then Connect", code: url },
    { id: "chatgpt", title: "ChatGPT", where: "Create an app or connector in developer mode with this URL and OAuth authentication", code: url },
    { id: "cursor_oauth", title: "Cursor", where: "~/.cursor/mcp.json, then sign in when Cursor asks", code: JSON.stringify({ mcpServers: { rankbyai: { url } } }, null, 2) },
    { id: "claude_code_oauth", title: "Claude Code", where: "Run in a terminal, then /mcp to sign in", code: `claude mcp add --transport http rankbyai ${url}` },
  ];
}
