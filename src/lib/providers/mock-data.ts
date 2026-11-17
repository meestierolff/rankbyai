import type { Engine } from "@/lib/pricing-constants";
import type { BusinessInfo, MapsItem } from "./dataforseo";
import type { AiAnswer, GeoContext } from "./types";

/* Deterministic simulated vendor responses for development (see lib/mock.ts). Not used in any deployed build. */

const RIVALS = ["Mock Rival One", "Mock Rival Two", "Mock Rival Three", "Mock Rival Four", "Mock Rival Five", "Mock Rival Six"];
const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const SEED: Record<Engine, number> = { openai: 11, perplexity: 23, gemini: 37 };

export interface MockCtx {
  businessName: string;
  /** 0 at the business pin, 1 at the edge of the grid. */
  distance: number;
  failEngine?: Engine | null;
}

export function mockAiAnswer(engine: Engine, prompt: string, geo: GeoContext, ctx: MockCtx): AiAnswer {
  const r = rnd(geo.lat * 1000, geo.lng * 1000, SEED[engine]);
  const score = ctx.distance + (r - 0.5) * 0.5;
  const position = score < 0.25 ? 1 : score < 0.45 ? 2 : score < 0.6 ? 3 : score < 0.7 ? 5 : null;
  const names = RIVALS.slice(0, 5).map((n, i) => RIVALS[(i + Math.floor(r * 6)) % RIVALS.length]);
  const unique = [...new Set(names)];
  if (position) unique.splice(Math.min(position - 1, unique.length), 0, ctx.businessName);
  const list = unique.slice(0, 5);
  const text = `Here are well-reviewed options near you:\n\n${list.map((n, i) => `${i + 1}. **${n}** – simulated reason ${i + 1}.`).join("\n")}\n\n(Mock answer for development.)`;
  return {
    engine, model: "mock", variant: engine === "gemini" ? "maps" : undefined, text,
    places: engine === "gemini" ? list.map((name) => ({ name })) : [],
    sources: [
      { url: "https://mock-directory.example/best", title: "Mock Directory" },
      { url: `https://mock-${engine}.example/list`, title: `Mock ${engine} source` },
    ],
    costUsd: engine === "openai" ? 0.0112 : engine === "perplexity" ? 0.0025 : 0.0016,
    costReported: false,
    usage: { inputTokens: 2000, outputTokens: 300, searches: 1 },
    raw: { mock: true, prompt },
  };
}

export function mockMapsItems(lat: number, lng: number, ctx: MockCtx): MapsItem[] {
  const r = rnd(lat * 1000, lng * 1000, 42);
  const rank = Math.max(1, Math.round(1 + Math.pow(ctx.distance, 1.5) * 22 + (r - 0.5) * 4));
  const names = Array.from({ length: 20 }, (_, i) => RIVALS[i % RIVALS.length] + (i >= RIVALS.length ? ` ${Math.floor(i / RIVALS.length) + 1}` : ""));
  if (rank <= 20) names.splice(rank - 1, 0, ctx.businessName);
  return names.slice(0, 20).map((name, i) => ({
    rank: i + 1, name, cid: name === ctx.businessName ? "mock-cid-target" : `mock-cid-${i}`, placeId: null,
    domain: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`, url: null, phone: null, address: "1 Mock Street",
    city: "Mockville", region: "TX", country: "US", lat, lng, category: "Dentist", rating: 4.2 + (i % 8) / 10, reviews: 30 + i * 11,
  }));
}

export function mockBusinessSearch(q: string): MapsItem[] {
  return [0, 1, 2].map((i) => ({
    rank: i + 1, name: i === 0 ? q : `${q} ${["North", "Downtown"][i - 1]}`, cid: i === 0 ? "mock-cid-target" : `mock-cid-s${i}`, placeId: null,
    domain: "mock-business.example", url: "https://mock-business.example", phone: "+1 512 555 0100", address: `${100 + i} Mock Street, Austin, TX`,
    city: "Austin", region: "Texas", country: "US", lat: 30.3072 + i * 0.01, lng: -97.7431 - i * 0.01, category: "Dentist", rating: 4.6, reviews: 38 + i * 20,
  }));
}

// ───────────────────────── audit fixtures ─────────────────────────

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Simulated Google profile. The target is deliberately weaker than its rivals so findings appear. */
export function mockBusinessInfo(name: string, isTarget: boolean, rivalIndex = 0): BusinessInfo {
  const base = { cid: isTarget ? "mock-cid-target" : `mock-cid-${rivalIndex}`, placeId: null, lat: 30.3172, lng: -97.7231, attributes: [] as string[] };
  if (isTarget) {
    return {
      ...base, name, description: null, category: "Dental clinic", additionalCategories: [],
      address: "4100 Mock Lamar Blvd, Austin, TX 78756", addressParts: { street: "4100 Mock Lamar Blvd", city: "Austin", region: "Texas", zip: "78756", country: "US" },
      phone: "+1 512 555 0174", url: `https://${slug(name)}.example`, domain: `${slug(name)}.example`,
      totalPhotos: 12, rating: 4.4, reviews: 38, isClaimed: true, hasHours: true,
    };
  }
  return {
    ...base, name, description: `${name} is a simulated competitor profile.`, category: "Dentist", additionalCategories: ["Cosmetic dentist", "Emergency dental service"],
    address: `${200 + rivalIndex * 10} Mock Street, Austin, TX 78701`, addressParts: { street: `${200 + rivalIndex * 10} Mock Street`, city: "Austin", region: "Texas", zip: "78701", country: "US" },
    phone: `+1 512 555 02${10 + rivalIndex}`, url: `https://${slug(name)}.example`, domain: `${slug(name)}.example`,
    totalPhotos: 40 + rivalIndex * 25, rating: 4.7 + rivalIndex * 0.1, reviews: [96, 112, 205][rivalIndex % 3], isClaimed: true, hasHours: true,
  };
}

/** Simulated homepage HTML. It goes through the real parser, so the audit pipeline is exercised end to end. */
export function mockSiteHtml(name: string, isTarget: boolean): string {
  const origin = `https://${slug(name)}.example`;
  const services = isTarget ? ["teeth-cleaning", "fillings"] : ["teeth-cleaning", "dental-implants", "invisalign", "emergency-dentist", "teeth-whitening"];
  const nav = services.map((s) => `<li><a href="${origin}/services/${s}">${s.replace(/-/g, " ")}</a></li>`).join("");
  if (isTarget) {
    // Different phone than the profile, no schema, no FAQ, no tel: link: each produces a finding.
    return `<!doctype html><html><head><title>Welcome | ${name}</title></head><body><nav><ul>${nav}<li><a href="${origin}/about">About</a></li></ul></nav>
<h1>Welcome to our practice</h1><p>${name} has cared for families for many years.</p><p>Call (512) 555-0199</p><footer>4100 Mock Lamar Blvd, Austin, TX 78756</footer></body></html>`;
  }
  return `<!doctype html><html><head><title>Dentist in Austin | ${name}</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"${name}","telephone":"+1 512 555 0210"}</script></head><body>
<nav><ul>${nav}</ul></nav><h1>Dentist in Austin</h1><a href="tel:+15125550210">Call us</a><h2>Frequently asked questions</h2></body></html>`;
}

export const mockAreas = () => ["Hyde Park", "North Loop", "Rosedale", "Brentwood"];

/** Simulated Fix Kit model output (no vendor call in development). */
export function mockFixKitDraft(name: string, city: string | null) {
  const place = city ?? "the area";
  return {
    description: `${name} is a dental practice in ${place}. (Simulated description for development.)`,
    faqs: Array.from({ length: 8 }, (_, i) => ({ question: `Simulated question ${i + 1} about ${name}?`, answer: `Simulated answer ${i + 1}.` })),
    llms_txt: `# ${name}\n\n> Dental practice in ${place}. (Simulated draft.)\n`,
  };
}
