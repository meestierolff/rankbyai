import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_ICON_FILES, brandIcons } from "@/lib/brand-icons";
import { monogram } from "@/components/oauth/consent";

/** One app icon everywhere: the MCP server, the MCP Registry entry, the plugins and the skill. */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p));
/** Width × height from a PNG's IHDR chunk. */
const pngSize = (p: string) => {
  const b = read(p);
  expect(b.subarray(1, 4).toString("ascii"), p).toBe("PNG");
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};

describe("the app icon", () => {
  it("server.json lists exactly the icons the MCP server announces", () => {
    expect(JSON.parse(read("server.json").toString()).icons).toEqual(brandIcons("https://rankbyai.live"));
  });

  it("every icon exists at the size it claims", () => {
    for (const icon of BRAND_ICON_FILES) {
      const file = `public${icon.path}`;
      expect(existsSync(path.join(root, file)), file).toBe(true);
      if (icon.mimeType === "image/png") expect(pngSize(file)).toBe(icon.sizes[0]);
    }
  });

  it("the plugins use the same 512 px tile", () => {
    const claude = JSON.parse(read("plugins/rankbyai/.claude-plugin/plugin.json").toString());
    expect(claude.icon).toBe("./assets/logo.png");
    expect(pngSize("plugins/rankbyai/assets/logo.png")).toBe("512x512");
    expect(read("plugins/rankbyai/assets/logo.png").equals(read("public/brand/icon-512.png"))).toBe(true);
    // The OpenAI plugin is built from the same file (scripts/build-openai-plugin.mjs).
    expect(JSON.parse(read("plugins/openai/plugin.json").toString()).extensions["com.openai"].interface.logo).toBe("./assets/logo.png");
    expect(read("scripts/build-openai-plugin.mjs").toString()).toContain('read("plugins/rankbyai/assets/logo.png")');
  });

  it("SKILL.md points at the 512 px icon", () => {
    const url = read("public/SKILL.md").toString().match(/^ {2}icon: (\S+)$/m)?.[1];
    expect(url).toBe("https://rankbyai.live/brand/icon-512.png");
  });
});

describe("the consent screen's app monogram", () => {
  it("uses one letter per word, at most two, and never an empty tile", () => {
    expect(monogram("Claude")).toBe("C");
    expect(monogram("MCP Inspector")).toBe("MI");
    expect(monogram("  chatgpt.com connector ")).toBe("CC");
    expect(monogram("Ünïcode app")).toBe("UA");
    expect(monogram("***")).toBe("?");
  });
});
