/**
 * Buyer prompts for a prompt pack (citation workflow, step 1). Pure.
 *
 * Suggestions are written from templates and the business's stored fields only: no model call, no
 * invented reviews, ratings or competitors. A "{competitor}" prompt appears only for names that
 * stored scans already returned. The user edits the list before anything runs.
 */
export const PACK_MAX_PROMPTS = 15;
export const PACK_PROMPT_MIN = 8;
export const PACK_PROMPT_MAX = 300;
export const PACK_MAX_REPEATS = 3;
/** Suggestions stay near "about ten": enough for a baseline, few enough to read every answer. */
export const PACK_SUGGESTIONS_MAX = 12;

/** Placeholders a pack prompt may keep; the scan fills them per point (lib/scans/prompt buildPrompt). */
const TOKENS = new Set(["{service}", "{city}", "{neighbourhood}", "{area}"]);

export function validatePackPrompt(prompt: string): string | null {
  const t = prompt.trim();
  if (t.length < PACK_PROMPT_MIN) return `A prompt needs at least ${PACK_PROMPT_MIN} characters.`;
  if (t.length > PACK_PROMPT_MAX) return `Keep each prompt under ${PACK_PROMPT_MAX} characters.`;
  const unknown = (t.match(/\{[^}]*\}/g) ?? []).find((x) => !TOKENS.has(x));
  if (unknown) return `Unknown placeholder ${unknown.slice(0, 40)}: use {service}, {city}, {neighbourhood} or {area}, or write the words out.`;
  return null;
}

/** The whole list: 1 to PACK_MAX_PROMPTS prompts, each valid, no two the same. Returns the trimmed list or an error. */
export function validatePackPrompts(prompts: readonly string[]): { prompts: string[] } | { error: string } {
  const list = prompts.map((p) => p.trim().replace(/\s+/g, " "));
  if (list.length === 0) return { error: "Add at least one prompt." };
  if (list.length > PACK_MAX_PROMPTS) return { error: `A pack has at most ${PACK_MAX_PROMPTS} prompts.` };
  for (const [i, p] of list.entries()) {
    const e = validatePackPrompt(p);
    if (e) return { error: `Prompt ${i + 1}: ${e}` };
  }
  const seen = new Set<string>();
  for (const [i, p] of list.entries()) {
    const k = p.toLowerCase();
    if (seen.has(k)) return { error: `Prompt ${i + 1} repeats an earlier prompt. Use repeats to ask the same prompt again.` };
    seen.add(k);
  }
  return { prompts: list };
}

export type PromptKind = "local_best" | "near_me" | "neighbourhood" | "recommend" | "choose" | "reviews" | "list" | "price" | "category" | "competitor";

export interface PromptSuggestion {
  text: string;
  kind: PromptKind;
  /** Why this prompt is there, or what it depends on. */
  note?: string;
}

export interface SuggestInput {
  /** The service people ask for, as the user wrote it (e.g. "dentist"). */
  service: string;
  city?: string | null;
  /** A named area at the business's map point, when one is stored or known. */
  neighbourhood?: string | null;
  /** The Google category, when it differs from the service. */
  category?: string | null;
  /** Other businesses that stored scans named most often (never invented). Up to two are used. */
  competitors?: readonly string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function suggestBuyerPrompts(input: SuggestInput): PromptSuggestion[] {
  const s = input.service.trim().replace(/\s+/g, " ");
  const city = input.city?.trim() || null;
  const hood = input.neighbourhood?.trim() || null;
  const at = city ? `in ${city}` : "near me";
  const out: PromptSuggestion[] = [
    { kind: "local_best", text: `Who is the best ${s} ${at}?` },
    ...(city ? [{ kind: "near_me" as const, text: `Who is the best ${s} near me?`, note: "\"Near me\" follows the location each engine receives: the map point for Perplexity and Gemini (Maps grounding), the city for ChatGPT." }] : []),
    ...(hood && norm(hood) !== norm(city ?? "") ? [{ kind: "neighbourhood" as const, text: `Best ${s} near ${hood}${city ? `, ${city}` : ""}` }] : []),
    { kind: "recommend", text: `Which ${s} ${at} would you recommend, and why?` },
    { kind: "choose", text: `Which ${s} ${at} should I choose?` },
    { kind: "reviews", text: `Top-rated ${s} ${at} with good reviews` },
    { kind: "list", text: `Top 10 ${s} options ${at}` },
    { kind: "price", text: `Affordable ${s} options ${at} that are worth it` },
  ];
  const category = input.category?.trim();
  if (category && norm(category) !== norm(s)) out.push({ kind: "category", text: `Who is the best ${category} ${at}?`, note: "The business's Google category." });
  const rivals: string[] = [];
  for (const c of input.competitors ?? []) {
    const name = c.trim().replace(/\s+/g, " ");
    if (name.length >= 2 && name.length <= 80 && !rivals.some((r) => norm(r) === norm(name))) rivals.push(name);
    if (rivals.length === 2) break;
  }
  for (const c of rivals) out.push({ kind: "competitor", text: `Is ${c} a good ${s} ${at}, or is there a better option?`, note: "A business that stored scans named often." });

  // Distinct, valid and within the cap; nothing here is longer than a prompt may be.
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = norm(p.text);
    if (seen.has(k) || validatePackPrompt(p.text)) return false;
    seen.add(k);
    return true;
  }).slice(0, PACK_SUGGESTIONS_MAX);
}
