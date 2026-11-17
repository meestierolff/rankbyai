import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiReference, McpToolList } from "@/components/api-reference";
import { MCP_PAID_TOOLS, MCP_TOOLS } from "@/lib/api-v1/mcp-tools";
import { openApiSpec } from "@/lib/api-v1/openapi";
import { mcpSnippets } from "@/lib/api-v1/snippets";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("API reference page", () => {
  it("renders every endpoint of the OpenAPI document", () => {
    const html = text(renderToStaticMarkup(<ApiReference siteUrl="https://rankbyai.live" />));
    const spec = openApiSpec("https://rankbyai.live");
    for (const [path, ops] of Object.entries(spec.paths)) {
      expect(html).toContain(`/api/v1${path}`);
      for (const op of Object.values(ops) as { summary: string }[]) expect(html).toContain(op.summary);
    }
    expect(html).toContain("confirm");
  });

  it("lists every MCP tool and marks the ones that need confirm", () => {
    const html = renderToStaticMarkup(<McpToolList />);
    for (const t of MCP_TOOLS) expect(html).toContain(`>${t}<`);
    expect(html.match(/needs confirm/g)).toHaveLength(MCP_PAID_TOOLS.length);
  });
});

describe("MCP client snippets", () => {
  const items = mcpSnippets("https://rankbyai.live", "rbai_live_KEY");
  const get = (id: string) => items.find((s) => s.id === id)!.code;

  it("Claude Code: the http transport and an Authorization header", () => {
    expect(get("claude_code")).toBe('claude mcp add --transport http rankbyai https://rankbyai.live/api/mcp \\\n  --header "Authorization: Bearer rbai_live_KEY"');
  });
  it("Cursor: url and headers, no type field", () => {
    expect(JSON.parse(get("cursor"))).toEqual({ mcpServers: { rankbyai: { url: "https://rankbyai.live/api/mcp", headers: { Authorization: "Bearer rbai_live_KEY" } } } });
  });
  it("Claude Desktop: mcp-remote with the header passed without a space", () => {
    const cfg = JSON.parse(get("claude_desktop")).mcpServers.rankbyai;
    expect(cfg.command).toBe("npx");
    expect(cfg.args).toEqual(["-y", "mcp-remote", "https://rankbyai.live/api/mcp", "--header", "Authorization:${RANKBYAI_AUTH}"]);
    expect(cfg.env).toEqual({ RANKBYAI_AUTH: "Bearer rbai_live_KEY" });
  });
});
