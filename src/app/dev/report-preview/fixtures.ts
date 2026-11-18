import { assembleAi, assembleMaps, buildAiPoints, buildMapsPoints, buildQuote, nearestPoint, type QuoteRow, type RawPoint } from "@/components/report/model";
import type { ReportView } from "@/components/report/types";
import { pitchOpener } from "@/lib/prospects/opener";
import type { Engine } from "@/lib/pricing-constants";
import { buildGrid } from "@/lib/scans/grid";
import { summarizeAi, summarizeMaps, type AiSampleRow, type MapsPointRow } from "@/lib/scans/summary";

/**
 * DEVELOPMENT FIXTURES for /dev/report-preview only. Every business below is invented (the same
 * fictional names as lib/sample-data.ts) and every source domain ends in .example. Rows are shaped
 * like the database rows and go through the same builders and summaries as a real report, so the
 * preview exercises the production counting code.
 */

const CENTER = { lat: 30.3185, lng: -97.724 };
const YOU = "Northgate Family Dental";
const RIVALS = ["Smile Dental", "Pecan Row Dentistry", "Bluebonnet Dental Co.", "Violet Crown Dental", "Hyde Park Smiles", "Lamar Square Dental", "Burnet Road Family Dentistry", "Shoal Creek Dental Studio", "Mueller Modern Dentistry", "Rosedale Dental Arts"];
const AREAS = ["Crestview", "Brentwood", "Highland", "Rosedale", "North Loop", "Hancock", "Allandale", "Hyde Park", "Cherrywood"];
const AREAS_25 = ["Allandale", "Crestview", "Wooten", "Windsor Park", "Mueller", "Rosedale", "Brentwood", "Highland", "Hancock", "Cherrywood", "Bryker Woods", "North Loop", "North Loop", "Hyde Park", "French Place", "Tarrytown", "Heritage", "North University", "Eastwoods", "Blackland", "Clarksville", "West Campus", "UT Campus", "Swede Hill", "Rainey"];
const SOURCES = ["austin-dentist-guide.example", "txsmiles-directory.example", "northloop-neighbors.example", "dental-reviews-hub.example", "atx-health-finder.example", "family-care-list.example"];

/** Deterministic 0–1 noise (no Math.random: fixtures must render the same every time). */
const noise = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

const day = "2026-11-12T15:04:00.000Z";

// ───────────────────────── answers ─────────────────────────

const REASONS = [
  "family and cosmetic care, with evening hours on weekdays",
  "patients mention short waits and clear explanations of treatment",
  "general dentistry, crowns and same-week emergency visits",
  "a long-running practice with many reviews about gentle cleanings",
  "Invisalign and whitening alongside routine checkups",
  "accepts most major insurance plans and offers payment plans",
  "kid-friendly visits and Saturday appointments",
];

function answerFor(engine: Engine, area: string, names: string[]): string {
  if (engine === "openai") {
    return [
      `Here are some well-reviewed dentists near ${area}, Austin:`,
      "",
      ...names.map((n, i) => `${i + 1}. **${n}** – ${REASONS[(i + area.length) % REASONS.length]}.`),
      "",
      "Before booking, check that the office accepts your insurance and has openings that fit your schedule.",
    ].join("\n");
  }
  if (engine === "perplexity") {
    return [
      `Based on recent reviews and local listings, these dental practices near ${area} in Austin are frequently recommended:`,
      "",
      ...names.map((n, i) => `- **${n}**: ${REASONS[(i + 2 + area.length) % REASONS.length]} [${i + 1}].`),
      "",
      "Hours and insurance acceptance change, so it is worth calling ahead to confirm availability [2][3].",
    ].join("\n");
  }
  return [
    `Here are a few dentists near ${area}, Austin, TX with good ratings on Google Maps:`,
    "",
    ...names.map((n, i) => `* **${n}**: ${REASONS[(i + 4 + area.length) % REASONS.length]}.`),
    "",
    "You can open each listing in Google Maps to see photos, opening hours and directions.",
  ].join("\n");
}

const prompt = (area: string) => `I'm in ${area}, Austin. Who are the best dentists near me? Recommend up to 5 specific businesses by name, each with a one-line reason.`;

// ───────────────────────── builders ─────────────────────────

interface AiSpec {
  n: number;
  engines: Engine[];
  radiusMiles: number;
  /** Which engines name the business at a point, and at what position. */
  you: (row: number, col: number, engine: Engine) => number | null;
  failed?: (row: number, col: number, engine: Engine) => boolean;
  skipped?: (row: number, col: number) => boolean;
  areas?: string[];
}

function aiPart(spec: AiSpec, businessName = YOU, businessAt: { lat: number; lng: number } | null = CENTER): NonNullable<ReportView["ai"]> {
  const grid = buildGrid(CENTER, spec.n, spec.radiusMiles);
  const areas = spec.areas ?? (spec.n === 3 ? AREAS : spec.n === 5 ? AREAS_25 : []);
  const points: RawPoint[] = grid.map((p) => ({ ...p, label: areas[p.idx] ?? null, status: spec.skipped?.(p.row, p.col) ? "skipped" : "done" }));
  const rows: (AiSampleRow & QuoteRow)[] = [];
  for (const p of points) {
    if (p.status === "skipped") continue;
    for (const engine of spec.engines) {
      const area = p.label ?? `the area around ${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}`;
      if (spec.failed?.(p.row, p.col, engine)) {
        rows.push({ point_idx: p.idx, engine, status: "failed", mentioned: null, mention_position: null, named_businesses: [], sources: [], cost_usd: null, prompt: prompt(area), answer_text: null });
        continue;
      }
      // Smile Dental leads almost everywhere (the "who instead" story); the rest vary by point and engine.
      const rivals = RIVALS.map((name, k) => ({ name, score: noise(p.row * 3 + k, p.col * 5 + k, engine.length + k) + (name === "Smile Dental" ? 0.6 : k < 4 ? 0.2 : 0) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, noise(p.idx, 1, engine.length) > 0.4 ? 5 : 4)
        .map((x) => x.name);
      const pos = spec.you(p.row, p.col, engine);
      const list = rivals.slice(0, 5);
      if (pos) list.splice(Math.min(pos - 1, list.length), 0, businessName);
      const names = list.slice(0, 5);
      const at = names.indexOf(businessName);
      const srcs = SOURCES.filter((_, k) => noise(p.idx, k, engine.length + 3) > 0.45).slice(0, 4).map((d) => ({ url: `https://${d}/austin/dentists`, title: d.replace(".example", "").replace(/-/g, " ") }));
      rows.push({
        point_idx: p.idx, engine, status: "done", mentioned: at >= 0, mention_position: at >= 0 ? at + 1 : null,
        named_businesses: names.map((name, i) => ({ name, position: i + 1, ...(name === businessName ? { you: true } : {}) })),
        sources: srcs, cost_usd: null, prompt: prompt(area), answer_text: answerFor(engine, area, names),
      });
    }
  }
  const summary = summarizeAi(rows, points.filter((p) => p.status !== "skipped").length);
  const aiPoints = buildAiPoints(points, rows, spec.engines);
  const near = nearestPoint(aiPoints, businessAt ?? CENTER, spec.n);
  const quote = near ? buildQuote(near, rows.filter((r) => r.point_idx === near.idx), spec.engines, spec.n) : null;
  return assembleAi({ n: spec.n, engines: spec.engines, service: "dentist", radiusMiles: spec.radiusMiles, center: CENTER, date: day, summary }, aiPoints, rows, businessName, quote);
}

interface MapsSpec {
  n: number;
  radiusMiles: number;
  strength: number;
  failed?: (row: number, col: number) => boolean;
  skipped?: (row: number, col: number) => boolean;
}

function mapsPart(spec: MapsSpec, businessName = YOU): NonNullable<ReportView["maps"]> {
  const grid = buildGrid(CENTER, spec.n, spec.radiusMiles);
  const c = (spec.n - 1) / 2;
  const rows: (MapsPointRow & RawPoint)[] = grid.map((p) => {
    if (spec.skipped?.(p.row, p.col)) return { ...p, status: "skipped", rank: null, top: null };
    if (spec.failed?.(p.row, p.col)) return { ...p, status: "failed", rank: null, top: null };
    const d = Math.hypot(p.row - c, p.col - c) / Math.max(1, Math.hypot(c, c));
    const raw = 1 + Math.pow(d, 1.4) * 26 * (1.2 - spec.strength) + (noise(p.row, p.col, 5) - 0.5) * 5 - (p.col - c) * 0.6;
    const rank = Math.max(1, Math.round(raw));
    const shift = Math.floor(noise(p.col, p.row, 2) * 3);
    const names = [...RIVALS.slice(shift), ...RIVALS.slice(0, shift)].slice(0, 5);
    if (rank <= 5) names.splice(rank - 1, 0, businessName);
    return { ...p, status: "done", rank: rank <= 20 ? rank : null, top: names.slice(0, 5).map((name, i) => ({ rank: i + 1, name })) };
  });
  const summary = summarizeMaps(rows, businessName);
  return assembleMaps({ n: spec.n, keyword: "dentist", radiusMiles: spec.radiusMiles, center: CENTER, date: day, summary }, buildMapsPoints(rows));
}

const brandNone: ReportView["brand"] = { name: null, logoUrl: null, color: null, website: null, hideRankbyai: false };
const business: ReportView["business"] = { name: YOU, city: "Austin", region: "TX", category: "Dentist", lat: CENTER.lat, lng: CENTER.lng };

const quickAudit: NonNullable<ReportView["audit"]> = {
  score: 46,
  date: day,
  findings: [
    { priority: "P0", title: "38 Google reviews against a median of 112 for the businesses in the Maps top 3", fix: "Ask every patient for a review after their visit, with a direct link to the Google review form. Reply to each review." },
    { priority: "P0", title: "The website has no page for each service people ask AI about", fix: "Add a page each for cleanings, crowns, Invisalign and emergency visits, written for patients, with prices or price ranges where you can." },
    { priority: "P1", title: "The Google profile lists one category; the leading competitors list four", fix: "Add the categories that fit: Cosmetic dentist, Emergency dental service and Pediatric dentist." },
    { priority: "P1", title: "No structured data (LocalBusiness / Dentist) on the homepage", fix: "Add Dentist schema with name, address, phone, opening hours and the Google profile link, so assistants can read the basics reliably." },
  ],
};

// ───────────────────────── variants ─────────────────────────

const ENGINES: Engine[] = ["openai", "perplexity", "gemini"];

function full(): ReportView {
  const ai = aiPart({
    n: 3, engines: ENGINES, radiusMiles: 2,
    you: (r, c, e) => (r === 1 && c === 1 ? (e === "openai" ? 2 : e === "gemini" ? 1 : null) : r === 0 && c === 1 && e === "gemini" ? 4 : null),
    failed: (r, c, e) => r === 2 && c === 2 && e === "perplexity",
  });
  const maps = mapsPart({ n: 5, radiusMiles: 2, strength: 0.55 });
  const opener = pitchOpener({
    business: YOU, city: "Austin",
    ai: { points: ai.pointsChecked, pointsMentioned: ai.pointsMentioned, topCompetitor: ai.namedInstead[0]?.name ?? null },
    maps: { points: maps.pointsDone, top3Points: maps.top3Points, avgRank: maps.avgRank },
    reviews: { you: 38, median: 112 },
  });
  return { kind: "prospect", watermark: false, business, brand: brandNone, opener, ai, maps, audit: quickAudit, updatedAt: day };
}

function mapsOnly(): ReportView {
  return { kind: "share", watermark: false, business: { ...business, name: "Pecan Row Dentistry" }, brand: brandNone, opener: null, ai: null, maps: mapsPart({ n: 7, radiusMiles: 3, strength: 0.8 }, "Pecan Row Dentistry"), audit: null, updatedAt: day };
}

function freeCheck(): ReportView {
  const ai = aiPart({ n: 1, engines: ENGINES, radiusMiles: 1, you: (_r, _c, e) => (e === "gemini" ? 3 : null), failed: (_r, _c, e) => e === "perplexity", areas: ["North Loop"] });
  return {
    kind: "free_check", watermark: true, business, brand: brandNone, opener: null, ai,
    maps: { date: day, keyword: "dentist", n: 1, radiusMiles: null, center: CENTER, cells: [], points: [], avgRank: null, top3Points: 0, pointsDone: 1, pointsFailed: 0, pointsSkipped: 0, competitors: [],
      single: { rank: 6, top: ["Smile Dental", "Pecan Row Dentistry", "Bluebonnet Dental Co.", "Violet Crown Dental", "Hyde Park Smiles"].map((name, i) => ({ rank: i + 1, name })) } },
    audit: null, updatedAt: day,
  };
}

const LOGO = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#7c6cf2"/><path d="M26 66 L48 26 L70 66 Z" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/></svg>')}`;

function whiteLabel(): ReportView {
  const name = "Dr. Alexandra Papadopoulos Family & Cosmetic Dentistry of North Austin";
  const ai = aiPart({
    n: 5, engines: ENGINES, radiusMiles: 3,
    you: (r, c, e) => (Math.hypot(r - 2, c - 2) <= 1.5 && (e !== "perplexity" || (r + c) % 2 === 0) ? 1 + ((r + c) % 3) : null),
  }, name);
  return {
    kind: "share", watermark: false, business: { ...business, name }, opener: null,
    brand: { name: "Brightline Local", logoUrl: LOGO, color: "#7c6cf2", website: "https://brightline-local.example/", hideRankbyai: true },
    ai, maps: mapsPart({ n: 9, radiusMiles: 3, strength: 0.75 }, name), audit: { ...quickAudit, score: 71, findings: quickAudit.findings.slice(1, 3) }, updatedAt: day,
  };
}

function big(): ReportView {
  // A lake on the east side: those points were skipped by the user. Three points returned no result.
  const lake = (r: number, c: number) => c >= 11 && r >= 4 && r <= 10 && c - r > 2;
  const ai = aiPart({
    n: 3, engines: ["openai", "gemini"], radiusMiles: 5,
    you: (r, c, e) => (r === 1 && c === 1 && e === "gemini" ? 2 : null),
    skipped: (r, c) => r === 1 && c === 2,
  });
  const maps = mapsPart({ n: 15, radiusMiles: 5, strength: 0.6, skipped: lake, failed: (r, c) => (r === 0 && c === 3) || (r === 14 && c === 9) || (r === 7 && c === 0) });
  return { kind: "share", watermark: false, business, brand: brandNone, opener: null, ai, maps, audit: quickAudit, updatedAt: day };
}

function noCoords(): ReportView {
  const ai = aiPart({ n: 3, engines: ENGINES, radiusMiles: 2, you: () => null, failed: (r, c) => r === 0 && c === 0 }, YOU, null);
  return { kind: "share", watermark: false, business: { ...business, lat: null, lng: null, city: null, region: null, category: null }, brand: { ...brandNone, hideRankbyai: false }, opener: null, ai, maps: null, audit: null, updatedAt: day };
}

export const VARIANTS = {
  full: { title: "Prospect report (AI 3×3 + Maps 5×5 + audit)", build: full },
  "maps-only": { title: "Maps only (no AI keys), no audit", build: mapsOnly },
  free: { title: "Free check (1×1, one engine unavailable)", build: freeCheck },
  "white-label": { title: "White-labelled (logo, colour, website, hide RankbyAI), AI 5×5 + Maps 9×9, long name", build: whiteLabel },
  big: { title: "15×15 Maps grid with skipped and failed points; AI 3×3 with a skipped point", build: big },
  "no-coords": { title: "AI only, business without coordinates or city, never named", build: noCoords },
} as const;

export type VariantKey = keyof typeof VARIANTS;
export const isVariant = (v: string): v is VariantKey => v in VARIANTS;
