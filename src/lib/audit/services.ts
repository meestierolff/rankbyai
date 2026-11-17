import { openAiJson } from "@/lib/providers/openai";
import { normalizeName } from "@/lib/scans/match";
import type { PageFacts } from "./crawl";

/**
 * Which services does each site have a page for? (brief 7.4, "missing service pages").
 * A deterministic extractor always runs; when an OpenAI key is available an LLM refines it.
 * Either way, a service is only reported with a URL that really came from the competitor's site.
 */
export interface ServicePage {
  service: string;
  url: string;
}

const GENERIC = /^(home|about|about us|our team|team|meet the team|contact|contact us|blog|news|reviews?|testimonials?|careers?|jobs|privacy|privacy policy|terms|faq|faqs|locations?|gallery|book|book now|book online|appointments?|schedule|pricing|prices|financing|insurance|new patients?|patients?|forms?|login|sign in|cart|shop|services|our services|all services|treatments|menu|more|search|get a quote|free quote|areas? we serve|service areas?)$/i;
const SERVICE_PATH = /\/(services?|treatments?|what-we-do|our-services|procedures|solutions|practice-areas)\/([^/?#]+)\/?$/i;

const title = (slug: string) => decodeURIComponent(slug).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

export function heuristicServices(facts: PageFacts | null): ServicePage[] {
  if (!facts) return [];
  const out = new Map<string, ServicePage>();
  for (const link of facts.links) {
    const m = link.match(SERVICE_PATH);
    if (!m) continue;
    const name = title(m[2]);
    if (name.length < 3 || name.length > 60 || GENERIC.test(name)) continue;
    out.set(normalizeName(name), { service: name, url: link });
  }
  return [...out.values()].slice(0, 40);
}

const key = (s: string) => normalizeName(s).replace(/\b(services?|treatments?|repairs?|and)\b/g, "").replace(/s\b/g, "").replace(/\s+/g, " ").trim();

/** Services competitors have a page for and the business does not. */
export function missingServices(yours: ServicePage[], competitors: { name: string; services: ServicePage[] }[]): { service: string; competitor: string; url: string }[] {
  const mine = yours.map((s) => key(s.service)).filter(Boolean);
  const has = (k: string) => mine.some((m) => m === k || m.includes(k) || k.includes(m));
  const seen = new Set<string>();
  const out: { service: string; competitor: string; url: string }[] = [];
  for (const c of competitors) {
    for (const s of c.services) {
      const k = key(s.service);
      if (!k || seen.has(k) || has(k)) continue;
      seen.add(k);
      out.push({ service: s.service, competitor: c.name, url: s.url });
    }
  }
  return out.slice(0, 40);
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sites"],
  properties: {
    sites: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["site", "services"],
        properties: {
          site: { type: "string" },
          services: {
            type: "array",
            maxItems: 40,
            items: { type: "object", additionalProperties: false, required: ["service", "url"], properties: { service: { type: "string" }, url: { type: "string" } } },
          },
        },
      },
    },
  },
} as const;

/**
 * LLM pass over navigation labels, URLs and headings. The model may only pick URLs from the lists we
 * send: anything else it returns is dropped, so a competitor URL shown as evidence is always real.
 */
export async function llmServices(openaiKey: string, sites: { site: string; facts: PageFacts | null }[]): Promise<{ bySite: Map<string, ServicePage[]>; costUsd: number } | null> {
  const usable = sites.filter((s) => s.facts);
  if (!usable.length) return null;
  const input = usable
    .map((s) => `SITE: ${s.site}\nNAV: ${s.facts!.navLabels.slice(0, 40).join(" | ")}\nH1: ${s.facts!.h1.join(" | ")}\nURLS:\n${s.facts!.links.slice(0, 80).join("\n")}`)
    .join("\n\n")
    .slice(0, 24_000);
  try {
    const res = await openAiJson<{ sites: { site: string; services: ServicePage[] }[] }>(openaiKey, {
      instructions:
        "For each SITE, list the distinct services the business offers that have their own page. Use the service name as a customer would say it. For each service give the page URL, copied exactly from that site's URLS list. Skip generic pages (about, contact, blog, reviews, locations). Do not invent services or URLs.",
      input,
      schemaName: "site_services",
      schema: SCHEMA,
      maxOutputTokens: 1500,
      timeoutMs: 45_000,
    });
    const bySite = new Map<string, ServicePage[]>();
    for (const s of res.data.sites) {
      const src = usable.find((u) => u.site === s.site);
      if (!src) continue;
      const allowed = new Set(src.facts!.links);
      bySite.set(s.site, s.services.filter((x) => allowed.has(x.url) && x.service.trim().length > 2).slice(0, 40));
    }
    return { bySite, costUsd: res.costUsd };
  } catch {
    return null; // the deterministic result stands
  }
}
