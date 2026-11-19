import "server-only";
import { logHouseSpend } from "@/lib/cost-guard";
import { dbAdmin } from "@/lib/db/clients";
import { resolveCredentials } from "@/lib/keys";
import { isMockMode } from "@/lib/mock";
import type { BusinessInfo } from "@/lib/providers/dataforseo";
import { mockFixKitDraft } from "@/lib/providers/mock-data";
import { openAiJson } from "@/lib/providers/openai";
import { numbersIn, type CheckResult } from "./checks";
import { pagePlan } from "./math";
import type { StoredAuditInputs } from "./run";
import { businessLanguage, languageName } from "@/lib/countries";

/**
 * Fix Kit (brief 7.5). Copy-ready material built from the audit's own inputs.
 *
 * Schema markup, the llms.txt draft and the checklist are assembled in code from stored facts, so
 * they cannot contain anything the audit did not see. Only the description and the FAQs are
 * written by a model (one call), and those are checked afterwards: a sentence or answer with a
 * number that is not in the source material is dropped.
 */
export interface Faq { question: string; answer: string }
export interface ChecklistItem { group: "Google profile" | "Website" | "Get listed" | "Pages to build"; text: string; url?: string }

export interface FixKit {
  id: string;
  audit_id: string | null;
  description: string | null;
  faqs: Faq[];
  jsonld_localbusiness: Record<string, unknown> | null;
  jsonld_faq: Record<string, unknown> | null;
  llms_txt: string | null;
  checklist: ChecklistItem[];
  created_at: string;
}

/** Google category → schema.org LocalBusiness subtype. Only real schema.org types; anything else stays LocalBusiness. */
const SUBTYPES: [RegExp, string][] = [
  [/\bdent/i, "Dentist"], [/\bplumb/i, "Plumber"], [/\belectric/i, "Electrician"], [/\bhvac|heating|air condition/i, "HVACBusiness"],
  [/\broof/i, "RoofingContractor"], [/\blocksmith/i, "Locksmith"], [/\bauto repair|car repair|mechanic|garage/i, "AutoRepair"], [/\bcar dealer|auto dealer/i, "AutoDealer"],
  [/\bcaf[eé]|coffee/i, "CafeOrCoffeeShop"], [/\bbakery/i, "Bakery"], [/\bbar\b|\bpub\b/i, "BarOrPub"], [/\brestaurant|pizz|diner|bistro|steakhouse|sushi/i, "Restaurant"],
  [/\battorney|lawyer|law firm/i, "Attorney"], [/\blegal/i, "LegalService"], [/\baccount|bookkeep|tax /i, "AccountingService"], [/\breal estate/i, "RealEstateAgent"],
  [/\bveterinar|animal hospital/i, "VeterinaryCare"], [/\bnail/i, "NailSalon"], [/\bhair|barber/i, "HairSalon"], [/\bbeauty/i, "BeautySalon"], [/\bspa\b/i, "DaySpa"],
  [/\bmoving|mover/i, "MovingCompany"], [/\bpaint/i, "HousePainter"], [/\bcontractor|builder|construction|remodel/i, "GeneralContractor"],
  [/\boptician|optometr|eye care/i, "Optician"], [/\bpharmac/i, "Pharmacy"], [/\bdoctor|physician|general practitioner/i, "Physician"], [/\bclinic|medical|chiropract|physio|physical therap/i, "MedicalClinic"],
  [/\binsurance/i, "InsuranceAgency"], [/\bgym|fitness/i, "ExerciseGym"], [/\bflorist/i, "Florist"], [/\bchild ?care|day ?care|nursery/i, "ChildCare"],
  [/\bdry clean|laundr/i, "DryCleaningOrLaundry"], [/\bself storage|storage facility/i, "SelfStorage"], [/\btravel agen/i, "TravelAgency"], [/\bhotel|motel/i, "Hotel"],
  [/\bfinancial|mortgage|wealth/i, "FinancialService"],
];
export const schemaTypeFor = (category: string | null | undefined): string => (category ? SUBTYPES.find(([re]) => re.test(category))?.[1] : null) ?? "LocalBusiness";

/** LocalBusiness JSON-LD from the Google profile. Fields without a real value are left out. */
export function localBusinessJsonLd(input: { name: string; website: string | null; profile: BusinessInfo | null; fallback: { phone: string | null; address: string | null; category: string | null }; description: string | null }): Record<string, unknown> {
  const p = input.profile;
  const parts = p?.addressParts;
  const address = parts && (parts.street || parts.city)
    ? Object.fromEntries(Object.entries({
        "@type": "PostalAddress", streetAddress: parts.street, addressLocality: parts.city, addressRegion: parts.region, postalCode: parts.zip, addressCountry: parts.country,
      }).filter(([, v]) => !!v))
    : (p?.address ?? input.fallback.address);
  const out: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaTypeFor(p?.category ?? input.fallback.category),
    name: p?.name ?? input.name,
  };
  if (input.description) out.description = input.description;
  const url = input.website ?? p?.url;
  if (url) out.url = url;
  const phone = p?.phone ?? input.fallback.phone;
  if (phone) out.telephone = phone;
  if (address) out.address = address;
  if (p?.lat != null && p?.lng != null) out.geo = { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng };
  return out;
}

export function faqJsonLd(faqs: Faq[]): Record<string, unknown> | null {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };
}

/** llms.txt draft: a plain summary of the business with links that were really found on its site. */
export function llmsTxt(input: { name: string; category: string | null; city: string | null; description: string | null; phone: string | null; address: string | null; website: string | null; services: { service: string; url: string }[]; pages: { url: string; title: string | null }[] }): string {
  const lines = [`# ${input.name}`, ""];
  const summary = input.description?.split(/(?<=[.!?])\s/)[0] ?? [input.category, input.city ? `in ${input.city}` : null].filter(Boolean).join(" ");
  if (summary) lines.push(`> ${summary}`, "");
  const contact = [input.address ? `- Address: ${input.address}` : null, input.phone ? `- Phone: ${input.phone}` : null, input.website ? `- Website: ${input.website}` : null].filter(Boolean) as string[];
  if (contact.length) lines.push("## Contact", ...contact, "");
  if (input.services.length) lines.push("## Services", ...input.services.slice(0, 20).map((s) => `- [${s.service}](${s.url})`), "");
  const seen = new Set(input.services.map((s) => s.url));
  const pages = input.pages.filter((p) => p.title && !seen.has(p.url)).slice(0, 12);
  if (pages.length) lines.push("## Pages", ...pages.map((p) => `- [${p.title}](${p.url})`), "");
  return lines.join("\n").trimEnd() + "\n";
}

const PROFILE_CHECKS = new Set(["claimed", "primary_category", "category_count", "description", "hours", "photos", "review_gap", "rating"]);
const WEBSITE_CHECKS = new Set(["nap_phone", "nap_name", "nap_address", "schema_localbusiness", "title_service_city", "click_to_call", "map_embed", "faq_section", "faq_schema", "llms_txt"]);

/** Checklist from the audit's failed checks, the sources its AI answers cite, and the page plan. */
export function buildChecklist(inputs: StoredAuditInputs, businessName: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const failed = inputs.checks.filter((c: CheckResult) => c.status === "fail");
  for (const c of failed) {
    if (PROFILE_CHECKS.has(c.key) && c.fix) items.push({ group: "Google profile", text: `${c.title}. ${c.fix}` });
    else if (WEBSITE_CHECKS.has(c.key) && c.fix) items.push({ group: "Website", text: `${c.title}. ${c.fix}` });
  }
  const sources = [...new Set([...(inputs.ai?.sharedSources.map((s) => s.domain) ?? []), ...(inputs.ai?.competitorOnlySources ?? [])])].slice(0, 10);
  for (const d of sources) items.push({ group: "Get listed", text: `Check whether the business is listed or featured on ${d}; AI answers for this search cite it.`, url: `https://${d}` });
  if (inputs.pagePlan && inputs.pagePlan.services.length && inputs.pagePlan.areas.length) {
    for (const row of pagePlan(inputs.pagePlan.services, inputs.pagePlan.areas, businessName).slice(0, 10)) items.push({ group: "Pages to build", text: `${row.title} (${row.slug})` });
  }
  return items;
}

/** Keep only text whose numbers all occur in the source material. */
export function grounded(text: string, source: string): boolean {
  const allowed = new Set(numbersIn(source));
  return numbersIn(text).every((n) => allowed.has(n));
}

const DRAFT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["description", "faqs"],
  properties: {
    description: { type: "string" },
    faqs: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["question", "answer"], properties: { question: { type: "string" }, answer: { type: "string" } } },
    },
  },
};

/** The facts a model may use. Everything here was read from the Google profile or the business's own site. */
export function sourceMaterial(inputs: StoredAuditInputs, business: { name: string; city: string | null }): string {
  const p = inputs.profile;
  return [
    `BUSINESS NAME: ${p?.name ?? business.name}`,
    `CATEGORY: ${[p?.category, ...(p?.additionalCategories ?? [])].filter(Boolean).join(", ") || "unknown"}`,
    `CITY: ${business.city ?? "unknown"}`,
    p?.address ? `ADDRESS: ${p.address}` : null,
    p?.phone ? `PHONE: ${p.phone}` : null,
    p?.description ? `PROFILE DESCRIPTION: ${p.description}` : null,
    inputs.services.length ? `SERVICES WITH A PAGE: ${inputs.services.map((s) => s.service).join(", ")}` : null,
    inputs.site?.headings.length ? `WEBSITE HEADINGS: ${inputs.site.headings.join(" | ")}` : null,
    inputs.site?.homeText ? `WEBSITE TEXT:\n${inputs.site.homeText}` : null,
  ].filter(Boolean).join("\n");
}

export type FixKitResult = { ok: true; kit: FixKit; note: string | null } | { ok: false; status: number; error: string; message: string };

/** Build (or return) the Fix Kit of a finished audit. One model call at most; none when no OpenAI key is available. */
/** The language line of the drafting instructions: nothing for English, else the business's language. */
const writeIn = (language: string) => (language === "English" ? "" : ` Write the description and the FAQs in ${language}, the language of this business's customers.`);

export async function generateFixKit(auditId: string, workspaceId: string, regenerate = false): Promise<FixKitResult> {
  const admin = dbAdmin();
  const { data: audit } = await admin.from("audits").select("id, workspace_id, business_id, funding, status, inputs").eq("id", auditId).maybeSingle();
  if (!audit || audit.workspace_id !== workspaceId) return { ok: false, status: 404, error: "not_found", message: "That audit was not found." };
  if (audit.status !== "done") return { ok: false, status: 409, error: "audit_not_done", message: "The audit has not finished yet." };

  const { data: existing } = await admin.from("fix_kits").select("*").eq("audit_id", auditId).order("created_at", { ascending: false }).limit(1);
  const current = ((existing ?? []) as FixKit[])[0];
  // Included-scan audits get one generation (the house pays for the model call); own-key audits can
  // regenerate. A kit whose model call failed (no description) can always be built again.
  const incomplete = !!current && !current.description && !isMockMode();
  if (current && !incomplete && (!regenerate || audit.funding !== "byok")) return { ok: true, kit: current, note: null };

  const { data: business } = await admin.from("businesses").select("name, city, website, phone, address, primary_category, language, country").eq("id", audit.business_id).maybeSingle();
  if (!business) return { ok: false, status: 404, error: "not_found", message: "The business was deleted." };
  const inputs = audit.inputs as StoredAuditInputs;
  const source = sourceMaterial(inputs, business);

  let draft: { description: string; faqs: Faq[] } | null = null;
  let costUsd = 0;
  let note: string | null = null;
  if (isMockMode()) draft = mockFixKitDraft(business.name, business.city);
  else {
    const creds = await resolveCredentials(workspaceId, audit.funding);
    if (!creds.openai) note = "Add an OpenAI key in Settings → API keys to also get a drafted description and FAQs. The schema, llms.txt and checklist below need no key.";
    else {
      try {
        const res = await openAiJson<{ description: string; faqs: Faq[] }>(creds.openai, {
          instructions:
            "You write for a local business, using ONLY the facts in the input. Write (1) a factual description of at most 750 characters: what the business does, where, and for whom; no superlatives, no claims, prices, awards, years or numbers that are not in the input; (2) exactly 8 FAQs a customer would ask, each answered in one to three sentences using only the input. If the input does not answer a question, do not ask it. Plain language. No marketing phrases." + writeIn(languageName(businessLanguage(business)) ?? "English"),
          input: source.slice(0, 12_000),
          schemaName: "fix_kit",
          schema: DRAFT_SCHEMA,
          maxOutputTokens: 1500,
        });
        draft = res.data;
        costUsd = res.costUsd;
      } catch {
        note = "The description and FAQs could not be drafted just now. Try again in a minute. The schema, llms.txt and checklist below are complete.";
      }
    }
  }

  // Grounding: drop any sentence or answer that carries a number the source does not contain.
  let description: string | null = null;
  let faqs: Faq[] = [];
  if (draft) {
    const sentences = draft.description.split(/(?<=[.!?])\s+/).filter((s) => s.trim() && (isMockMode() || grounded(s, source)));
    description = sentences.join(" ").slice(0, 750).trim() || null;
    faqs = draft.faqs
      .filter((f) => f.question?.trim() && f.answer?.trim() && (isMockMode() || grounded(`${f.question} ${f.answer}`, source)))
      .slice(0, 8)
      .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }));
  }

  const website = business.website ?? inputs.profile?.url ?? null;
  const row = {
    workspace_id: workspaceId,
    business_id: audit.business_id,
    audit_id: auditId,
    description,
    faqs,
    jsonld_localbusiness: localBusinessJsonLd({ name: business.name, website, profile: inputs.profile, fallback: { phone: business.phone, address: business.address, category: business.primary_category }, description }),
    jsonld_faq: faqJsonLd(faqs),
    llms_txt: llmsTxt({
      name: inputs.profile?.name ?? business.name, category: inputs.profile?.category ?? business.primary_category, city: business.city, description,
      phone: inputs.profile?.phone ?? business.phone, address: inputs.profile?.address ?? business.address, website, services: inputs.services, pages: inputs.site?.pageTitles ?? [],
    }),
    checklist: buildChecklist(inputs, business.name),
    cost_usd: costUsd,
  };
  if (current) await admin.from("fix_kits").delete().eq("id", current.id);
  const { data: saved, error } = await admin.from("fix_kits").insert(row).select("*").single<FixKit>();
  if (error || !saved) return { ok: false, status: 500, error: "server_error", message: "The Fix Kit could not be saved. Try again." };
  if (audit.funding !== "byok" && costUsd > 0) await logHouseSpend("credits", null, { openai: costUsd });
  return { ok: true, kit: saved, note };
}
