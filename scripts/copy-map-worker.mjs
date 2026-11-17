#!/usr/bin/env node
// MapLibre GL JS 6 ships its web worker as a separate ES module that bundlers do not pick up.
// Copy it to /public/vendor so the app can point the library at a same-origin URL.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
try {
  const dist = dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
  const out = join(process.cwd(), "public", "vendor");
  mkdirSync(out, { recursive: true });
  for (const f of ["maplibre-gl-worker.mjs"]) if (existsSync(join(dist, f))) copyFileSync(join(dist, f), join(out, f));
  console.log("map worker copied to public/vendor");
} catch (e) {
  console.warn("map worker not copied:", e instanceof Error ? e.message : e);
}
