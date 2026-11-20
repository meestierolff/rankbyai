#!/usr/bin/env node
/**
 * Builds the ZIP for the OpenAI plugin directory (ChatGPT and Codex) from:
 *   plugins/openai/plugin.json, plugins/openai/mcp.json      (OpenAI's own manifests)
 *   plugins/rankbyai/skills/rankbyai/SKILL.md                 (the skill, shared with the Claude/Grok plugin)
 *   plugins/rankbyai/assets/logo.png
 * The ZIP holds only these files (no .claude-plugin/ or .mcp.json), as OpenAI's submission expects.
 *
 *   node scripts/build-openai-plugin.mjs --demo-url https://…   → dist/rankbyai-openai-plugin.zip
 *
 * The walkthrough URL comes from plugin.json (review.demo_recording_url) or --demo-url. Without one the
 * ZIP leaves the recording out (a draft: upload, checks, MCP connect) and it must be added before
 * Submit for review. Refuses to build while the text limits or test-case counts are not met.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p));
const plugin = JSON.parse(read("plugins/openai/plugin.json").toString("utf8"));

const i = process.argv.indexOf("--demo-url");
const demo = i > -1 ? process.argv[i + 1] : plugin.extensions["com.openai"].review.demo_recording_url;
const problems = [];
// The recording is optional in the ZIP and required only before "Submit for review"; it can also be
// entered in the dashboard under Review details. Without one the ZIP is a draft for upload and checks.
const hasDemo = Boolean(demo) && !demo.includes("REPLACE_WITH");
if (hasDemo && !/^https:\/\//.test(demo)) problems.push("demo recording URL must start with https://");
const ui = plugin.extensions["com.openai"].interface;
const tc = plugin.extensions["com.openai"].review.test_cases;
if (ui.displayName.length > 30) problems.push("displayName is over 30 characters");
if (ui.shortDescription.length > 30) problems.push("shortDescription is over 30 characters");
if (ui.longDescription.length > 4000) problems.push("longDescription is over 4000 characters");
if (ui.defaultPrompt.length > 3 || ui.defaultPrompt.some((p) => p.length > 128 || p.includes("@"))) problems.push("defaultPrompt: at most 3, each at most 128 characters, no @");
if (tc.positive.length !== 5 || tc.negative.length !== 3) problems.push("exactly 5 positive and 3 negative test cases are required");
if (problems.length) {
  console.error("Not built:\n- " + problems.join("\n- "));
  process.exit(1);
}
if (hasDemo) plugin.extensions["com.openai"].review.demo_recording_url = demo;
else {
  delete plugin.extensions["com.openai"].review.demo_recording_url;
  console.warn("No demo recording URL: built as a draft. Add one (--demo-url or Review details) before Submit for review.");
}

const zip = zipSync({
  "plugin.json": Buffer.from(JSON.stringify(plugin, null, 2) + "\n"),
  "mcp.json": read("plugins/openai/mcp.json"),
  "skills/rankbyai/SKILL.md": read("plugins/rankbyai/skills/rankbyai/SKILL.md"),
  "assets/logo.png": read("plugins/rankbyai/assets/logo.png"),
});
mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/rankbyai-openai-plugin.zip"), zip);
console.log(`dist/rankbyai-openai-plugin.zip (${zip.length} bytes)`);
