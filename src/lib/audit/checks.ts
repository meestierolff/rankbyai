import { ENGINE_LABEL, type Engine } from "@/lib/pricing-constants";
import type { BusinessInfo } from "@/lib/providers/dataforseo";
import { normalizeName, normalizePhone } from "@/lib/scans/match";
import type { PageFacts } from "./crawl";
import { median, pageMath, reviewTarget } from "./math";

/**
 * Local AI Audit (brief 7.4): deterministic checks over stored inputs.
 *
 * Rules that keep it honest:
 *  - A check whose input is missing is "not_checked": it leaves the score's denominator and is listed.
 *  - Every number in a finding's title or fix is also present in that finding's evidence rows
 *    (asserted by a test), so nothing can be stated that was not observed.
 */
export type Category = "identity" | "profile" | "website" | "reviews" | "ai_presence" | "competitive";
export const CATEGORY_WEIGHTS: Record<Category, number> = { identity: 20, profile: 25, website: 20, reviews: 15, ai_presence: 10, competitive: 10 };
export const CATEGORY_LABEL: Record<Category, string> = {
  identity: "Identity & NAP", profile: "Business profile", website: "Website & schema", reviews: "Reviews", ai_presence: "AI presence", competitive: "Competitive gap",
};
export type Priority = "P0" | "P1" | "P2" | "P3";

export interface Evidence {
  label: string;
  value: string;
  source_url?: string;
}

export interface CheckResult {
  key: string;
  category: Category;
  status: "pass" | "fail" | "not_checked";
  priority: Priority;
  /** Shown for failures (finding title) and in the checks list. */
  title: string;
  evidence: Evidence[];
  fix: string;
  impact: string;
  /** Why the check could not run (status not_checked). */
  reason?: string;
  data?: Record<string, unknown>;
}

export interface AuditInputs {
  business: { name: string; website: string | null; phone: string | null; address: string | null; city: string | null; category: string | null };
  service: string;
  months: number;
  profile: BusinessInfo | null;
  competitors: { name: string; profile: BusinessInfo | null }[];
  site: { home: PageFacts | null; pages: Pick<PageFacts, "url" | "title" | "h1">[]; hasLlmsTxt: boolean | null; knownPages: number } | null;
  ai: {
    scanDate: string;
    points: number;
    engines: { engine: Engine; done: number; mentioned: number }[];
    namedInstead: { name: string; mentions: number }[];
    sharedSources: { domain: string; engines: number }[];
    /** Domains cited only in answers that did not name the business. */
    competitorOnlySources: string[];
  } | null;
  services: { yours: string[]; missing: { service: string; competitor: string; url: string }[]; method: "llm" | "heuristic" } | null;
  areas: { names: string[]; radiusMiles: number } | null;
}

const ok = (c: Omit<CheckResult, "status">): CheckResult => ({ ...c, status: "pass" });
const bad = (c: Omit<CheckResult, "status">): CheckResult => ({ ...c, status: "fail" });
const skip = (key: string, category: Category, priority: Priority, title: string, reason: string): CheckResult => ({ key, category, priority, title, status: "not_checked", evidence: [], fix: "", impact: "", reason });

const lc = (s: string | null | undefined) => (s ?? "").toLowerCase();
const stem = (word: string) => lc(word).replace(/(ists|ers|ies|es|s)$/, (m) => (m === "ies" ? "y" : m === "ists" ? "ist" : m === "ers" ? "er" : "")).slice(0, 12);

export function runChecks(inp: AuditInputs): CheckResult[] {
  const out: CheckResult[] = [];
  const home = inp.site?.home ?? null;
  const homeUrl = home?.url;
  const p = inp.profile;
  const rivals = inp.competitors.filter((c) => c.profile);
  const rivalNames = rivals.map((r) => r.name).join(", ");

  // ── Identity & NAP ──
  const profilePhone = normalizePhone(p?.phone ?? inp.business.phone);
  if (!profilePhone) out.push(skip("nap_phone", "identity", "P0", "Phone on the website matches the Google profile", "The Google profile lists no phone number."));
  else if (!home) out.push(skip("nap_phone", "identity", "P0", "Phone on the website matches the Google profile", "The website could not be fetched."));
  else if (home.phones.length === 0) out.push(skip("nap_phone", "identity", "P0", "Phone on the website matches the Google profile", "No phone number was found on the homepage."));
  else {
    const match = home.phones.some((ph) => normalizePhone(ph) === profilePhone);
    const base = {
      key: "nap_phone", category: "identity" as const, priority: "P0" as const,
      evidence: [{ label: "Google profile phone", value: p?.phone ?? inp.business.phone ?? "" }, { label: "Phone numbers on the homepage", value: home.phones.join(" · "), source_url: homeUrl }],
      fix: "Use one phone number everywhere: the Google profile, the website header and footer, and the LocalBusiness schema.",
      impact: "A mismatched phone number makes it harder for search and AI systems to treat the profile and the site as the same business.",
    };
    out.push(match ? ok({ ...base, title: "Phone on the website matches the Google profile" }) : bad({ ...base, title: "Phone on the website doesn't match the Google profile" }));
  }

  if (!home) out.push(skip("nap_name", "identity", "P0", "Business name appears on the website", "The website could not be fetched."));
  else {
    const name = normalizeName(inp.business.name);
    const hay = normalizeName([home.title, ...home.h1, home.localBusiness?.name, home.text.slice(0, 3000)].filter(Boolean).join(" "));
    const base = {
      key: "nap_name", category: "identity" as const, priority: "P0" as const,
      evidence: [{ label: "Google profile name", value: inp.business.name }, { label: "Homepage title", value: home.title ?? "(none)", source_url: homeUrl }, { label: "Homepage H1", value: home.h1[0] ?? "(none)", source_url: homeUrl }],
      fix: "Show the exact business name from the Google profile in the homepage title or heading and in the LocalBusiness schema.",
      impact: "The name is the first thing used to connect a website to its listing.",
    };
    out.push(name && hay.includes(name) ? ok({ ...base, title: "Business name appears on the website" }) : bad({ ...base, title: "The website doesn't show the business name from the Google profile" }));
  }

  const address = p?.address ?? inp.business.address;
  if (!address) out.push(skip("nap_address", "identity", "P0", "Address on the website matches the Google profile", "The Google profile lists no address."));
  else if (!home) out.push(skip("nap_address", "identity", "P0", "Address on the website matches the Google profile", "The website could not be fetched."));
  else {
    const streetNo = address.match(/\b\d{1,6}\b/)?.[0];
    const zip = address.match(/\b\d{5}(?:-\d{4})?\b|\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0];
    const siteText = lc(`${home.text} ${home.localBusiness?.address ?? ""} ${(inp.site?.pages ?? []).map((x) => x.title).join(" ")}`);
    if (!streetNo && !zip) out.push(skip("nap_address", "identity", "P0", "Address on the website matches the Google profile", "The profile address has no street number or postcode to compare."));
    else {
      const found = (!streetNo || siteText.includes(streetNo)) && (!zip || siteText.replace(/\s/g, "").includes(lc(zip).replace(/\s/g, "")));
      const base = {
        key: "nap_address", category: "identity" as const, priority: "P0" as const,
        evidence: [{ label: "Google profile address", value: address }, { label: "Address in the site's schema", value: home.localBusiness?.address ?? "(none)", source_url: homeUrl }, { label: "Looked for on the homepage", value: [streetNo, zip].filter(Boolean).join(" and ") }],
        fix: "Put the full address from the Google profile on the website (footer or contact section) and in the LocalBusiness schema.",
        impact: "A consistent address across the profile and the site supports local relevance.",
      };
      out.push(found ? ok({ ...base, title: "Address on the website matches the Google profile" }) : bad({ ...base, title: "The website doesn't show the address from the Google profile" }));
    }
  }

  if (!home) out.push(skip("schema_localbusiness", "identity", "P2", "LocalBusiness schema is present and consistent", "The website could not be fetched."));
  else {
    const lb = home.localBusiness;
    const schemaPhone = normalizePhone(lb?.telephone);
    const inconsistent = !!(lb && schemaPhone && profilePhone && schemaPhone !== profilePhone);
    const base = {
      key: "schema_localbusiness", category: "identity" as const,
      evidence: [{ label: "JSON-LD types on the homepage", value: home.jsonLdTypes.join(", ") || "none", source_url: homeUrl }, ...(lb ? [{ label: "Schema telephone", value: lb.telephone ?? "(none)" }, { label: "Google profile phone", value: p?.phone ?? inp.business.phone ?? "(none)" }] : [])],
      impact: "LocalBusiness schema states name, address, phone and hours in a form machines read directly.",
    };
    if (!lb) out.push(bad({ ...base, priority: "P2", title: "No LocalBusiness schema on the homepage", fix: "Add the LocalBusiness JSON-LD from the Fix Kit to the homepage." }));
    else if (inconsistent) out.push(bad({ ...base, priority: "P0", title: "LocalBusiness schema has a different phone number than the Google profile", fix: "Correct the telephone in the schema so it matches the Google profile." }));
    else out.push(ok({ ...base, priority: "P2", title: "LocalBusiness schema is present and consistent", fix: "" }));
  }

  // ── Business profile ──
  if (p?.isClaimed == null) out.push(skip("claimed", "profile", "P0", "Google Business Profile is claimed", "The claimed status was not returned for this profile."));
  else {
    const base = { key: "claimed", category: "profile" as const, priority: "P0" as const, evidence: [{ label: "Claimed", value: p.isClaimed ? "yes" : "no" }], fix: "Claim and verify the profile at business.google.com.", impact: "An unclaimed profile cannot be corrected or kept up to date by the owner." };
    out.push(p.isClaimed ? ok({ ...base, title: "Google Business Profile is claimed" }) : bad({ ...base, title: "The Google Business Profile is not claimed" }));
  }

  const rivalCats = rivals.map((r) => r.profile!.category).filter((c): c is string => !!c);
  if (!p?.category || rivalCats.length === 0) out.push(skip("primary_category", "profile", "P0", "Primary category matches the map pack", !p?.category ? "The profile's primary category was not returned." : "No competitor profiles were available."));
  else {
    const same = rivalCats.some((c) => lc(c) === lc(p.category));
    const base = {
      key: "primary_category", category: "profile" as const, priority: "P0" as const,
      evidence: [{ label: "Your primary category", value: p.category }, ...rivals.filter((r) => r.profile!.category).map((r) => ({ label: `${r.name} primary category`, value: r.profile!.category as string }))],
      fix: "Check whether one of the competitors' primary categories describes the business better, and change it only if it is accurate.",
      impact: "The primary category is one of the strongest relevance signals on a profile.",
    };
    out.push(same ? ok({ ...base, title: "Primary category matches a top competitor" }) : bad({ ...base, title: `Primary category “${p.category}” differs from every top competitor` }));
  }

  const rivalCatCounts = rivals.map((r) => 1 + r.profile!.additionalCategories.length);
  const catMedian = median(rivalCatCounts);
  if (!p || catMedian == null) out.push(skip("category_count", "profile", "P2", "Number of categories vs the map pack", "Profile or competitor profiles were not available."));
  else {
    const mine = (p.category ? 1 : 0) + p.additionalCategories.length;
    const target = Math.round(catMedian);
    const base = {
      key: "category_count", category: "profile" as const, priority: "P2" as const,
      evidence: [{ label: "Your categories", value: String(mine) }, { label: "Competitor median", value: String(target) }, { label: "Competitors compared", value: rivalNames }],
      fix: "Add the secondary categories that truly describe services the business offers.",
      impact: "Secondary categories widen the searches a profile is eligible for.",
    };
    out.push(mine >= target ? ok({ ...base, title: `${mine} categories vs a competitor median of ${target}` }) : bad({ ...base, title: `${mine} categories vs a competitor median of ${target}` }));
  }

  if (!p) {
    out.push(skip("description", "profile", "P2", "Profile has a description", "The profile could not be loaded."));
    out.push(skip("hours", "profile", "P2", "Opening hours are set", "The profile could not be loaded."));
  } else {
    const len = (p.description ?? "").trim().length;
    const d = { key: "description", category: "profile" as const, priority: "P2" as const, evidence: [{ label: "Description length (characters)", value: String(len) }], fix: "Add a factual description. The Fix Kit drafts one from the profile and the website.", impact: "The description is text that AI systems can quote about the business." };
    out.push(len > 0 ? ok({ ...d, title: "Profile has a description" }) : bad({ ...d, title: "The profile has no description" }));
    if (p.hasHours == null) out.push(skip("hours", "profile", "P2", "Opening hours are set", "Opening hours were not returned for this profile."));
    else {
      const h = { key: "hours", category: "profile" as const, priority: "P2" as const, evidence: [{ label: "Opening hours on the profile", value: p.hasHours ? "set" : "missing" }], fix: "Add opening hours, including special hours for holidays.", impact: "Missing hours remove the business from 'open now' searches." };
      out.push(p.hasHours ? ok({ ...h, title: "Opening hours are set" }) : bad({ ...h, title: "The profile has no opening hours" }));
    }
  }

  const rivalPhotos = rivals.map((r) => r.profile!.totalPhotos).filter((n): n is number => n != null);
  const photoMedian = median(rivalPhotos);
  if (p?.totalPhotos == null || photoMedian == null) out.push(skip("photos", "profile", "P3", "Photos vs the map pack", "Photo counts were not returned."));
  else {
    const target = Math.round(photoMedian);
    const base = {
      key: "photos", category: "profile" as const, priority: "P3" as const,
      evidence: [{ label: "Your photos", value: String(p.totalPhotos) }, { label: "Competitor median", value: String(target) }],
      fix: "Add real photos of the team, the premises and the work.", impact: "Photos make a profile more complete and more convincing to customers.",
    };
    out.push(p.totalPhotos >= target ? ok({ ...base, title: `${p.totalPhotos} photos vs a competitor median of ${target}` }) : bad({ ...base, title: `${p.totalPhotos} photos vs a competitor median of ${target}` }));
  }

  // ── Website & schema ──
  const web = (key: string, priority: Priority, passTitle: string, failTitle: string, pass: boolean | null, evidence: Evidence[], fix: string, impact: string, reason = "The website could not be fetched.") => {
    if (pass == null) out.push(skip(key, "website", priority, passTitle, reason));
    else out.push((pass ? ok : bad)({ key, category: "website", priority, title: pass ? passTitle : failTitle, evidence, fix, impact }));
  };
  if (home) {
    const tl = lc(`${home.title} ${home.h1.join(" ")}`);
    const hasService = !!inp.service && tl.includes(stem(inp.service.split(" ").pop() ?? ""));
    const city = inp.business.city;
    const hasCity = !!city && tl.includes(lc(city.split(",")[0]));
    web("title_service_city", "P2", "Title or H1 names the service and the city", "Title and H1 don't name both the service and the city", city ? hasService && hasCity : null,
      [{ label: "Title", value: home.title ?? "(none)", source_url: homeUrl }, { label: "H1", value: home.h1[0] ?? "(none)", source_url: homeUrl }, { label: "Looked for", value: `${inp.service} · ${city ?? ""}` }],
      "Name the main service and the city in the homepage title and H1.", "Plain statements of what the business does and where are what both search and AI systems extract.", "The business has no city on record.");
    web("click_to_call", "P2", "Click-to-call link present", "No click-to-call link on the homepage", home.hasTelLink, [{ label: "tel: links on the homepage", value: home.hasTelLink ? "found" : "none", source_url: homeUrl }], "Make the phone number a tel: link.", "Most local searches happen on phones.");
    web("map_embed", "P3", "Map embed present", "No map embed on the homepage", home.hasMapEmbed, [{ label: "Map embed on the homepage", value: home.hasMapEmbed ? "found" : "none", source_url: homeUrl }], "Embed a map of the business location on the homepage or contact page.", "A map embed reinforces the location for visitors.");
    const anyFaq = home.hasFaqSection || (inp.site?.pages ?? []).some((pg) => /faq|frequently asked/i.test(`${pg.title} ${pg.h1.join(" ")} ${pg.url}`));
    web("faq_section", "P2", "FAQ section present", "No FAQ section found on the site", anyFaq, [{ label: "FAQ heading or page", value: anyFaq ? "found" : "none found in the pages checked", source_url: homeUrl }], "Publish the FAQ from the Fix Kit, answering the questions customers actually ask.", "Question-and-answer text is easy for AI systems to quote.");
    web("faq_schema", "P2", "FAQPage schema present", "No FAQPage schema on the homepage", home.hasFaqSchema, [{ label: "FAQPage JSON-LD on the homepage", value: home.hasFaqSchema ? "found" : "none", source_url: homeUrl }], "Add the FAQPage JSON-LD from the Fix Kit next to the visible FAQ.", "Schema makes the questions and answers machine-readable.");
    web("llms_txt", "P2", "llms.txt present", "No llms.txt file on the site", inp.site?.hasLlmsTxt ?? null, [{ label: "/llms.txt", value: inp.site?.hasLlmsTxt ? "found" : "not found", source_url: homeUrl ? new URL("/llms.txt", homeUrl).toString() : undefined }], "Publish the llms.txt draft from the Fix Kit at the site root.", "llms.txt gives AI assistants a short, clean summary of the business.", "The llms.txt lookup did not complete.");
  } else {
    for (const [key, pr, t] of [["title_service_city", "P2", "Title or H1 names the service and the city"], ["click_to_call", "P2", "Click-to-call link present"], ["map_embed", "P3", "Map embed present"], ["faq_section", "P2", "FAQ section present"], ["faq_schema", "P2", "FAQPage schema present"], ["llms_txt", "P2", "llms.txt present"]] as const) {
      out.push(skip(key, "website", pr, t, inp.business.website ? "The website could not be fetched." : "The business has no website on record."));
    }
  }

  // ── Reviews ──
  const rivalReviews = rivals.map((r) => r.profile!.reviews).filter((n): n is number => n != null);
  const rt = p?.reviews != null ? reviewTarget(p.reviews, rivalReviews, inp.months) : null;
  if (!rt) out.push(skip("review_gap", "reviews", "P1", "Review count vs the map pack", "Review counts were not available for the business and its competitors."));
  else {
    const base = {
      key: "review_gap", category: "reviews" as const, priority: "P1" as const,
      evidence: [
        { label: "Your reviews", value: String(rt.you) }, { label: "Competitor median", value: String(rt.top3Median) }, { label: "Competitor average", value: String(rt.top3Average) },
        { label: "Competitor maximum", value: String(rt.top3Max) }, { label: "Gap to the median", value: String(rt.gap) }, { label: "Months", value: String(rt.months) },
        { label: "Monthly target", value: `${rt.gap} ÷ ${rt.months} months = ${rt.monthlyTarget} reviews/month` },
      ],
      impact: "Review count is the most visible gap between a business and the map pack.",
      data: { ...rt },
    };
    out.push(rt.gap <= 0
      ? ok({ ...base, title: `${rt.you} reviews vs a map-pack median of ${rt.top3Median}`, fix: "" })
      : bad({ ...base, title: `${rt.you} reviews vs a map-pack median of ${rt.top3Median}`, fix: `Ask every customer. Aim for ${rt.monthlyTarget} new reviews a month for ${rt.months} months to reach the median.` }));
  }
  const rivalRatings = rivals.map((r) => r.profile!.rating).filter((n): n is number => n != null);
  const ratingMedian = median(rivalRatings);
  if (p?.rating == null || ratingMedian == null) out.push(skip("rating", "reviews", "P2", "Rating vs the map pack", "Ratings were not available."));
  else {
    const mine = p.rating.toFixed(1);
    const med = ratingMedian.toFixed(1);
    const base = { key: "rating", category: "reviews" as const, priority: "P2" as const, evidence: [{ label: "Your rating", value: mine }, { label: "Competitor median rating", value: med }], fix: "Reply to every review and fix the causes of low ratings.", impact: "Rating affects both ranking and whether a customer chooses the business." };
    out.push(p.rating >= ratingMedian - 0.05 ? ok({ ...base, title: `Rating ${mine} vs a competitor median of ${med}` }) : bad({ ...base, title: `Rating ${mine} vs a competitor median of ${med}` }));
  }

  // ── AI presence ──
  const ai = inp.ai;
  const available = ai?.engines.filter((e) => e.done > 0) ?? [];
  if (!ai || available.length === 0) {
    out.push(skip("ai_mentions", "ai_presence", "P1", "Named by AI engines", "No AI check has completed for this business."));
    out.push(skip("ai_sources", "ai_presence", "P2", "Sources that several AI engines cite", "No AI check has completed for this business."));
  } else {
    const absent = available.filter((e) => e.mentioned === 0);
    const engineRows = available.map((e) => ({ label: ENGINE_LABEL[e.engine].short, value: `named at ${e.mentioned} of ${e.done} points` }));
    const base = {
      key: "ai_mentions", category: "ai_presence" as const, priority: "P1" as const,
      evidence: [...engineRows, { label: "Engines checked", value: String(available.length) }, { label: "Engines that never named the business", value: String(absent.length) }, ...(ai.namedInstead.length ? [{ label: "Named instead", value: ai.namedInstead.slice(0, 5).map((n) => n.name).join(", ") }] : [])],
      fix: "Fix the identity and profile issues first, then get listed on the sources the engines cite.",
      impact: "These are the businesses AI assistants suggested when asked for this service in this area.",
    };
    // "Absent at 2 of 3 engines" in the brief: with fewer engines available, absent at most of them.
    const failing = absent.length >= Math.max(1, Math.ceil((available.length * 2) / 3));
    out.push(failing ? bad({ ...base, title: `Not named by ${absent.length} of ${available.length} AI engines` }) : ok({ ...base, title: `Named by ${available.length - absent.length} of ${available.length} AI engines` }));

    const shared = ai.sharedSources;
    const sBase = {
      key: "ai_sources", category: "ai_presence" as const, priority: "P2" as const,
      evidence: [{ label: "Sources cited by two or more engines", value: shared.length ? shared.map((s) => s.domain).join(", ") : "none" }, { label: "Count", value: String(shared.length) }],
      fix: "Check each source: if the business is not listed or featured there, get it listed.",
      impact: "Sources that several engines cite are where their answers come from.",
    };
    out.push(failing && shared.length > 0 ? bad({ ...sBase, title: `${shared.length} sources are cited by several AI engines that don't name the business` }) : ok({ ...sBase, title: "No shared-source gap found" }));
  }

  // ── Competitive gap ──
  const sv = inp.services;
  if (!sv) out.push(skip("service_pages", "competitive", "P1", "Service pages vs competitors", "Competitor websites could not be read."));
  else {
    const n = sv.missing.length;
    const base = {
      key: "service_pages", category: "competitive" as const, priority: "P1" as const,
      evidence: [{ label: "Services found on competitor sites but not on yours", value: String(n) }, ...sv.missing.slice(0, 12).map((m) => ({ label: m.service, value: `${m.competitor} has a page`, source_url: m.url }))],
      fix: "Build a page for each service you actually offer.",
      impact: "A dedicated page gives search and AI systems something specific to cite for that service.",
      data: { missing: sv.missing, method: sv.method },
    };
    out.push(n === 0 ? ok({ ...base, title: "No missing service pages found" }) : bad({ ...base, title: `No page for ${n} ${n === 1 ? "service" : "services"} that competitors have pages for` }));
  }

  if (!sv || !inp.areas || !inp.site) out.push(skip("page_math", "competitive", "P3", "Service × area page coverage", !inp.areas ? "Nearby areas could not be loaded." : "Services or the website could not be read."));
  else {
    const allServices = [...new Set([...sv.yours, ...sv.missing.map((m) => m.service)])];
    const pm = pageMath(allServices, inp.areas.names, inp.site.knownPages);
    const base = {
      key: "page_math", category: "competitive" as const, priority: "P3" as const,
      evidence: [
        { label: "Services", value: String(pm.services) }, { label: "Areas within the radius", value: String(pm.areas) }, { label: "Radius (miles)", value: String(inp.areas.radiusMiles) },
        { label: "Pages needed", value: `${pm.services} services × ${pm.areas} areas = ${pm.pagesNeeded}` }, { label: "Pages found on the site", value: String(pm.pagesHave) }, { label: "Pages to build", value: String(pm.toBuild) },
      ],
      fix: "Start with the service and area pairs you serve most. Download the page plan and edit the lists to match what you offer.",
      impact: "One page per service and area is how local sites cover the searches around them.",
      data: { ...pm, services: allServices, areas: inp.areas.names },
    };
    out.push(pm.toBuild === 0 || pm.pagesNeeded === 0 ? ok({ ...base, title: `${pm.pagesHave} pages cover ${pm.pagesNeeded} service and area pairs` }) : bad({ ...base, title: `${pm.services} services × ${pm.areas} areas = ${pm.pagesNeeded} pages; the site has ${pm.pagesHave}` }));
  }

  if (!ai) out.push(skip("source_gap", "competitive", "P3", "Sources that cite competitors but not you", "No AI check has completed for this business."));
  else {
    const only = ai.competitorOnlySources;
    const base = {
      key: "source_gap", category: "competitive" as const, priority: "P3" as const,
      evidence: [{ label: "Domains cited only in answers that did not name the business", value: only.length ? only.slice(0, 10).join(", ") : "none" }, { label: "Count", value: String(only.length) }],
      fix: "Look at each domain: a listing, a feature or a local sponsorship there can put the business in front of the engines.",
      impact: "These sources feed answers that currently name other businesses.",
    };
    out.push(only.length === 0 ? ok({ ...base, title: "No competitor-only sources found" }) : bad({ ...base, title: `${only.length} sources appear only in answers that name other businesses` }));
  }
  return out;
}

export interface AuditScore {
  score: number;
  categoryScores: Record<Category, { score: number | null; ran: number; total: number }>;
  checksRan: number;
  checksTotal: number;
}

/** 0–100. Checks that could not run are excluded from the denominator (per category and overall). */
export function scoreAudit(checks: CheckResult[]): AuditScore {
  const categoryScores = {} as AuditScore["categoryScores"];
  let weighted = 0;
  let weightRan = 0;
  for (const cat of Object.keys(CATEGORY_WEIGHTS) as Category[]) {
    const all = checks.filter((c) => c.category === cat);
    const ran = all.filter((c) => c.status !== "not_checked");
    const passed = ran.filter((c) => c.status === "pass").length;
    const ratio = ran.length ? passed / ran.length : null;
    categoryScores[cat] = { score: ratio == null ? null : Math.round(ratio * 100), ran: ran.length, total: all.length };
    if (ratio != null) {
      weighted += CATEGORY_WEIGHTS[cat] * ratio;
      weightRan += CATEGORY_WEIGHTS[cat];
    }
  }
  return {
    score: weightRan ? Math.round((weighted / weightRan) * 100) : 0,
    categoryScores,
    checksRan: checks.filter((c) => c.status !== "not_checked").length,
    checksTotal: checks.length,
  };
}

/** Numbers that appear in a finding's title and fix. Used by the "nothing invented" test. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
}
