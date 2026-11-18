#!/usr/bin/env node
// Draws the brand mark (the 3×3 dot grid: eight off-white dots around an orange centre) into the
// PNG files that cannot be an inline SVG: the favicon, the Apple touch icon and the logo used by
// the social card and the Organization structured data.
//
// No dependencies on purpose: `sharp` is not installed in this project (Next only uses it when it
// is present), and the mark is nine circles, so this file rasterises them itself and writes the
// PNG with node:zlib. Run it again after changing the mark:  node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

// Same geometry as DotMark in src/components/marketing/lp.tsx (a 22-unit box).
const BOX = 22;
const AT = [3, 11, 19];
const DOT = { r: 2.3, rgb: [0xf4, 0xf2, 0xee] }; // --lp-fg
const CENTRE = { r: 3.1, rgb: [0xff, 0x7a, 0x1a] }; // --lp-accent

/** The same mark as an SVG string with literal colours (CSS variables do not resolve in a file). */
export const markSvg = (size = BOX) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${BOX} ${BOX}">` +
  AT.flatMap((cy, r) => AT.map((cx, c) => (r === 1 && c === 1 ? `<circle cx="${cx}" cy="${cy}" r="${CENTRE.r}" fill="#ff7a1a"/>` : `<circle cx="${cx}" cy="${cy}" r="${DOT.r}" fill="#f4f2ee"/>`))).join("") +
  `</svg>`;

/**
 * @param {object} o
 * @param {number} o.width      canvas width in px
 * @param {number} o.height     canvas height in px
 * @param {number} o.mark       side of the mark's 22-unit box in px
 * @param {number[]|null} o.bg  background colour [r,g,b], or null for transparent
 * @param {number} [o.radius]   corner radius of the background in px (0 = square)
 * @param {number} [o.dotScale] makes the dots a little larger for small sizes (favicon)
 */
function draw({ width, height, mark, bg, radius = 0, dotScale = 1 }) {
  const SS = 4; // 4×4 samples per pixel
  const unit = mark / BOX;
  const ox = (width - mark) / 2;
  const oy = (height - mark) / 2;
  const dots = AT.flatMap((cy, r) => AT.map((cx, c) => {
    const d = r === 1 && c === 1 ? CENTRE : DOT;
    return { x: ox + cx * unit, y: oy + cy * unit, r2: (d.r * dotScale * unit) ** 2, rgb: d.rgb };
  }));
  const insideBg = (x, y) => {
    if (!bg) return false;
    if (!radius) return true;
    const dx = Math.max(radius - x, x - (width - radius), 0);
    const dy = Math.max(radius - y, y - (height - radius), 0);
    return dx * dx + dy * dy <= radius * radius;
  };
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          const dot = dots.find((d) => (fx - d.x) ** 2 + (fy - d.y) ** 2 <= d.r2);
          const colour = dot ? dot.rgb : insideBg(fx, fy) ? bg : null;
          if (colour) { r += colour[0]; g += colour[1]; b += colour[2]; a += 1; }
        }
      }
      const i = (y * width + x) * 4;
      if (a) { px[i] = Math.round(r / a); px[i + 1] = Math.round(g / a); px[i + 2] = Math.round(b / a); }
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return png(width, height, px);
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}
/** 8-bit RGBA PNG. */
function png(width, height, rgba) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const BLACK = [0, 0, 0];
const files = [
  // Favicon: a black rounded tile, so the off-white dots also read on a light browser tab.
  { path: "src/app/icon.png", width: 256, height: 256, mark: 176, bg: BLACK, radius: 56, dotScale: 1.12 },
  // Apple touch icon: full-bleed and opaque; iOS applies its own corner mask.
  { path: "src/app/apple-icon.png", width: 180, height: 180, mark: 108, bg: BLACK, dotScale: 1.08 },
  // Logo for the social card (src/lib/og.tsx draws it at 118×64 on a #0b0b0b card) and for the
  // Organization structured data (src/lib/seo.ts). Same 148:80 canvas as the file it replaces.
  { path: "public/brand/logo.png", width: 1184, height: 640, mark: 520, bg: [0x0b, 0x0b, 0x0b] },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of files) {
    const out = join(process.cwd(), f.path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, draw(f));
    console.log(`${f.path}  ${f.width}×${f.height}`);
  }
}
