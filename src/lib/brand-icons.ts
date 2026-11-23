/**
 * The RankbyAI app icon (the dot-grid tile drawn by scripts/make-icons.mjs) as directories and MCP
 * clients ask for it: one list, used by the MCP server's info and mirrored in server.json (a test
 * keeps the two equal). Paths are under public/.
 */
export const BRAND_ICON_FILES = [
  { path: "/icon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
  { path: "/brand/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
  { path: "/brand/icon-1024.png", mimeType: "image/png", sizes: ["1024x1024"] },
] as const;

export const brandIcons = (origin: string) => BRAND_ICON_FILES.map((i) => ({ src: `${origin}${i.path}`, mimeType: i.mimeType, sizes: [...i.sizes] }));

/** What the MCP server says about itself (MCP Implementation: title, description, websiteUrl, icons). */
export const MCP_SERVER_DESCRIPTION = "AI and Google Maps visibility for local businesses and online products: map grids, audits, prompt packs, cited pages and citation targets.";
