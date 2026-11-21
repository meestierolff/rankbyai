import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../next.config";
import { MCP_PAID_TOOLS, MCP_TOOLS } from "@/lib/api-v1/mcp-tools";

/** public/SKILL.md, served at https://rankbyai.live/SKILL.md: the method an agent follows with the MCP server. */
const skill = readFileSync(path.resolve(import.meta.dirname, "../../public/SKILL.md"), "utf8");
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";

describe("agent skill (public/SKILL.md)", () => {
  it("is complete: the last line is the END marker of its version", () => {
    const lines = skill.trimEnd().split("\n");
    expect(lines[lines.length - 1]).toBe("END SKILL v1.0.0");
    expect(skill.endsWith("\n")).toBe(true);
    expect(frontmatter).toMatch(/^version: 1\.0\.0$/m);
    expect(frontmatter).toMatch(/^ {2}version: 1\.0\.0$/m);
  });

  it("has the frontmatter agents and skill installers read", () => {
    expect(frontmatter).toMatch(/^name: rankbyai$/m);
    expect(frontmatter).toMatch(/^description: >-\n {2}\S/m);
    expect(frontmatter).toMatch(/^homepage: https:\/\/rankbyai\.live\/SKILL\.md$/m);
    for (const key of ["author", "source", "site", "docs", "mcp"]) expect(frontmatter, key).toMatch(new RegExp(`^ {2}${key}: \\S`, "m"));
    expect(frontmatter).toContain("mcp: https://rankbyai.live/api/mcp");
  });

  it("names only real tools, and every tool of the MCP server", () => {
    const tools = new Set<string>(MCP_TOOLS);
    const mentioned = [...skill.matchAll(/`((?:list|get|run|add|update|delete|create|estimate|compare)_[a-z_]+)`/g)].map((m) => m[1]);
    for (const t of mentioned) expect(tools.has(t), `${t} is not an MCP tool`).toBe(true);
    for (const t of MCP_TOOLS) expect(skill, t).toContain(`\`${t}\``);
    expect(skill).toContain("`fix_plan`");
  });

  it("lists every paid tool under the estimate-first rule", () => {
    const paid = skill.slice(skill.indexOf("## Paid tools"), skill.indexOf("## Call order"));
    for (const t of MCP_PAID_TOOLS) expect(paid, t).toContain(`\`${t}\``);
    expect(paid).toContain("`confirm: true`");
  });

  it("states no prices, sales copy or emoji, and leaves destructive tools to the user", () => {
    expect(skill).not.toMatch(/\$\s?\d/);
    expect(skill).not.toMatch(/lifetime|deal|pay once|aiseotracker|AI SEO Tracker/i);
    expect(skill).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(skill).toMatch(/Do not call `update_business`, `delete_business` or `update_branding` unless the user asked/);
  });

  it("is served as UTF-8 Markdown", async () => {
    const rules = await config.headers!();
    const rule = rules.find((r) => r.source === "/SKILL.md");
    expect(rule?.headers).toContainEqual({ key: "Content-Type", value: "text/markdown; charset=utf-8" });
  });
});
