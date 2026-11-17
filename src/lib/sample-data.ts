import type { Engine } from "@/lib/pricing-constants";

/**
 * SAMPLE DATA for marketing demos only. Deterministic, generated, and entirely fictional:
 * the business and every competitor below are invented. Every visual fed by this file is
 * labelled "Sample data" on the page. Nothing here is ever shown inside /app.
 */
export const SAMPLE = {
  business: "Northgate Family Dental",
  city: "Austin, TX",
  service: "dentist",
  prompt: "I'm in North Loop, Austin. Who are the best dentists near me?",
  shareUrl: "rankbyai.live/r/northgate",
  rivals: ["Smile Dental", "Pecan Row Dentistry", "Bluebonnet Dental Co.", "Violet Crown Dental"],
  sources: ["austin-dentist-guide.example", "txsmiles-directory.example", "northloop-neighbors.example"],
  reviews: { you: 38, top3Median: 112, months: 3 },
} as const;

export const SAMPLE_ENGINES: { key: Engine; label: string; threshold: number; seed: number }[] = [
  { key: "openai", label: "ChatGPT", threshold: 0.5, seed: 11 },
  { key: "perplexity", label: "Perplexity", threshold: 0.42, seed: 23 },
  { key: "gemini", label: "Gemini", threshold: 0.6, seed: 37 },
];

export const AI_N = 5; // AI grid 5×5 (the largest AI grid the product runs)
export const MAPS_N = 7; // Maps grid 7×7

function rnd(i: number, j: number, s: number): number {
  const x = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Normalised distance from the centre (0–1) with a slight NE/SW skew so the map looks organic. */
function geometry(n: number, i: number, j: number) {
  const c = (n - 1) / 2;
  const maxD = Math.hypot(c, c) || 1;
  const d = Math.hypot(i - c, j - c) / maxD;
  const skew = ((j - c - (i - c)) / (2 * maxD)) * 0.18;
  return { d, skew };
}

/** Mention position (1–5) or null for one engine at one AI grid point. `strength` < 1 = an earlier, weaker scan. */
export function sampleAiPosition(i: number, j: number, engineSeed: number, threshold: number, strength = 1, n = AI_N): number | null {
  const { d, skew } = geometry(n, i, j);
  const score = d - skew + (rnd(i, j, 42 + engineSeed) - 0.5) * 0.45;
  const t = threshold * strength;
  if (score >= t) return null;
  if (score < t * 0.4) return 1;
  if (score < t * 0.62) return 2;
  if (score < t * 0.8) return 3;
  return score < t * 0.92 ? 4 : 5;
}

/** Google Maps rank at one Maps grid point. */
export function sampleMapsRank(i: number, j: number, strength = 1, n = MAPS_N): number {
  const { d, skew } = geometry(n, i, j);
  return Math.max(1, Math.round(1 + Math.pow(d, 1.6) * 20 * (2 - strength) + (rnd(i, j, 42) - 0.5) * 4 - skew * 8));
}

export interface SampleAiCell {
  i: number;
  j: number;
  position: number | null;
}

export function sampleAiGrid(engine: Engine, strength = 1, n = AI_N): SampleAiCell[] {
  const e = SAMPLE_ENGINES.find((x) => x.key === engine)!;
  const out: SampleAiCell[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push({ i, j, position: sampleAiPosition(i, j, e.seed, e.threshold, strength, n) });
  return out;
}

export function sampleMapsGrid(strength = 1, n = MAPS_N): { i: number; j: number; rank: number }[] {
  const out: { i: number; j: number; rank: number }[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push({ i, j, rank: sampleMapsRank(i, j, strength, n) });
  return out;
}

export const mentionCount = (cells: SampleAiCell[]) => cells.filter((c) => c.position !== null).length;
export const top3Count = (cells: { rank: number }[]) => cells.filter((c) => c.rank <= 3).length;

/** The ordered list of names an engine gave at a point (the sample business slotted in at its position). */
export function sampleNamesAt(i: number, j: number, position: number | null): { name: string; you: boolean }[] {
  const names: { name: string; you: boolean }[] = [0, 1, 2, 3].map((k) => ({
    name: SAMPLE.rivals[(i * 3 + j + k) % SAMPLE.rivals.length],
    you: false,
  }));
  if (position) names.splice(position - 1, 0, { name: SAMPLE.business, you: true });
  return names.slice(0, 5);
}

const DIRS = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];
/** "At the business pin" or "1.2 mi NE of the pin" for a cell in an n×n grid covering ±radius miles. */
export function describeOffset(n: number, i: number, j: number, radiusMiles = 2): string {
  const c = (n - 1) / 2;
  const step = (2 * radiusMiles) / (n - 1);
  const dx = (j - c) * step;
  const dy = (c - i) * step;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.05) return "At the business pin";
  const dir = DIRS[Math.round((((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360) / 45) % 8];
  return `${dist.toFixed(1)} mi ${dir} of the pin`;
}

/** Before/after compare (an earlier, weaker scan vs the current one). */
export function sampleCompare() {
  const BEFORE = 0.62;
  const engines = SAMPLE_ENGINES.map((e) => {
    const before = mentionCount(sampleAiGrid(e.key, e.key === "gemini" ? 1.06 : BEFORE));
    const after = mentionCount(sampleAiGrid(e.key, 1));
    return { key: e.key, label: e.label, before, after, delta: after - before };
  });
  const mapsBefore = top3Count(sampleMapsGrid(0.8));
  const mapsAfter = top3Count(sampleMapsGrid(1));
  return { engines, maps: { before: mapsBefore, after: mapsAfter, delta: mapsAfter - mapsBefore }, aiPoints: AI_N * AI_N, mapsPoints: MAPS_N * MAPS_N };
}

export const SAMPLE_AUDIT = {
  score: 64,
  findings: [
    {
      priority: "P0" as const,
      title: "Phone on the website doesn't match the Google profile",
      evidence: "Website (512) 555-0147 · Profile (512) 555-0174",
      fix: "Use one number everywhere, then add it to the LocalBusiness schema from the Fix Kit.",
    },
    {
      priority: "P1" as const,
      title: "38 reviews vs a map-pack median of 112",
      evidence: "You 38 · top-3 median 112 · gap 74 · ÷ 3 months = 25 reviews/month",
      fix: "Ask every patient this month. Target 25 new reviews a month for 3 months.",
    },
    {
      priority: "P1" as const,
      title: "No page for 3 services the top 3 all have",
      evidence: "Invisalign, dental implants, emergency dentist: found on all three competitor sites",
      fix: "Build a page for each service you actually offer.",
    },
    {
      priority: "P2" as const,
      title: "No FAQPage schema on the homepage",
      evidence: "0 FAQPage blocks found at /",
      fix: "Publish the FAQ and paste the FAQPage JSON-LD from the Fix Kit.",
    },
    {
      priority: "P3" as const,
      title: "12 photos vs a top-3 median of 41",
      evidence: "You 12 · top-3 median 41",
      fix: "Add team, office and treatment-room photos to the profile.",
    },
  ],
};

export const SAMPLE_FIXKIT = {
  profile:
    "Northgate Family Dental is a family dental practice in North Loop, Austin, serving Hyde Park, Crestview and Brentwood. We offer check-ups and cleanings, fillings, crowns, Invisalign, dental implants and same-day emergency appointments. Open Monday to Saturday, with evening hours on Tuesday and Thursday.",
  faqs: [
    { q: "Do you take emergency dental appointments in North Loop?", a: "Yes. Call before 3 pm on a weekday and we see most dental emergencies the same day." },
    { q: "Which areas of Austin do you serve?", a: "Most patients come from North Loop, Hyde Park, Crestview and Brentwood." },
    { q: "Do you offer Invisalign?", a: "Yes. We do Invisalign assessments at the practice and plan treatment in-house." },
  ],
  schema: `{
  "@context": "https://schema.org",
  "@type": "Dentist",
  "name": "Northgate Family Dental",
  "telephone": "+1-512-555-0174",
  "areaServed": ["North Loop", "Hyde Park",
                 "Crestview", "Brentwood"],
  "openingHours": "Mo-Sa 08:00-17:00",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Austin",
    "addressRegion": "TX"
  }
}`,
  llms: `# Northgate Family Dental

> Family dental practice in North Loop, Austin.
> Serves Hyde Park, Crestview and Brentwood.

## Services
- [Check-ups and cleanings](/checkups)
- [Invisalign](/invisalign)
- [Dental implants](/implants)
- [Emergency dentist](/emergency)

## Service area
North Loop, Hyde Park, Crestview, Brentwood`,
};

export const SAMPLE_PROSPECTS = [
  { name: "Smile Dental", ai: "67%", maps: "3.1", audit: 78, link: "/r/smile-dental" },
  { name: "Northgate Family Dental", ai: "41%", maps: "5.8", audit: 64, link: "/r/northgate" },
  { name: "Pecan Row Dentistry", ai: "26%", maps: "7.4", audit: 52, link: "/r/pecan-row" },
  { name: "Bluebonnet Dental Co.", ai: "11%", maps: "9.6", audit: 41, link: "/r/bluebonnet" },
  { name: "Violet Crown Dental", ai: "4%", maps: "14.2", audit: 33, link: "/r/violet-crown" },
];
