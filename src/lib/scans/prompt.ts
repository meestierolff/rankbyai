/** The prompt is identical across engines and stored verbatim with every sample (brief 6.5). */
export const DEFAULT_PROMPT_TEMPLATE =
  "I'm in {neighbourhood}, {city}. Who are the best {service} near me? Recommend up to 5 specific businesses by name, each with a one-line reason.";

export const MAX_TEMPLATE_LENGTH = 400;

/**
 * The question in the business's own language, for languages RankbyAI has written one for. People
 * ask assistants in their own language, and the answer changes with it: measured on 19 Nov 2026 at
 * one Berlin point, the German question changed 2 of Perplexity's 5 dentists and 1 of ChatGPT's, and
 * brought in German review and booking sites the English question never cited (Gemini, grounded on
 * Google Maps, barely changed).
 *
 * Written so the service word never has to agree with anything ("Ich suche: Zahnarzt."), whatever
 * the user types. {area} is the point's neighbourhood, or its coordinates when it has no name.
 * English keeps DEFAULT_PROMPT_TEMPLATE unchanged, so English results stay comparable over time.
 */
export const QUESTIONS: Readonly<Record<string, { template: string; serviceExample: string }>> = {
  de: { template: "Ich bin in der Nähe von {area}, {city}. Ich suche: {service}. Welche konkreten Anbieter in meiner Nähe empfiehlst du? Nenne bis zu 5 mit Namen, jeweils mit einer kurzen Begründung.", serviceExample: "Zahnarzt" },
  nl: { template: "Ik ben in de buurt van {area}, {city}. Ik zoek: {service}. Welke bedrijven hier in de buurt raad je aan? Noem er maximaal 5 bij naam, elk met een korte reden.", serviceExample: "tandarts" },
  fr: { template: "Je suis près de {area}, {city}. Je cherche : {service}. Quelles adresses précises me recommandes-tu près de chez moi ? Donne-moi jusqu'à 5 noms, chacun avec une courte raison.", serviceExample: "dentiste" },
  es: { template: "Estoy cerca de {area}, {city}. Busco: {service}. ¿Qué negocios concretos me recomiendas cerca de mí? Dame hasta 5 nombres, cada uno con una razón breve.", serviceExample: "dentista" },
  it: { template: "Sono vicino a {area}, {city}. Cerco: {service}. Quali attività specifiche mi consigli qui vicino? Dammi fino a 5 nomi, ciascuno con un breve motivo.", serviceExample: "dentista" },
  pt: { template: "Estou perto de {area}, {city}. Procuro: {service}. Quais negócios específicos você recomenda perto de mim? Indique até 5 pelo nome, cada um com um motivo curto.", serviceExample: "dentista" },
  sv: { template: "Jag är nära {area}, {city}. Jag söker: {service}. Vilka företag i närheten rekommenderar du? Nämn upp till 5 med namn, var och en med en kort motivering.", serviceExample: "tandläkare" },
  da: { template: "Jeg er tæt på {area}, {city}. Jeg søger: {service}. Hvilke virksomheder i nærheden kan du anbefale? Nævn op til 5 med navn, hver med en kort begrundelse.", serviceExample: "tandlæge" },
  no: { template: "Jeg er i nærheten av {area}, {city}. Jeg ser etter: {service}. Hvilke bedrifter i nærheten anbefaler du? Nevn opptil 5 med navn, hver med en kort begrunnelse.", serviceExample: "tannlege" },
  pl: { template: "Jestem w okolicy: {area}, {city}. Szukam: {service}. Jakie konkretne firmy w pobliżu polecasz? Wymień do 5 z nazwy, każdą z krótkim uzasadnieniem.", serviceExample: "dentysta" },
};

/** Base code of a language ("pt" for "pt-BR"). */
const base = (code: string | null | undefined) => (code ?? "").split("-")[0].toLowerCase();

/** Whether RankbyAI has a written question in this language. */
export const hasQuestionIn = (language: string | null | undefined): boolean => Object.hasOwn(QUESTIONS, base(language));

/**
 * The language the assistants are asked in for a business: its language (setting, else its country's)
 * when it is asked in its own language and a question exists for it, else English.
 */
export function questionLanguage(b: { ask_in_language?: boolean | null; language: string }): string {
  return b.ask_in_language && hasQuestionIn(b.language) ? base(b.language) : "en";
}

/** The default question for a business (see questionLanguage). */
export const defaultQuestionFor = (b: { ask_in_language?: boolean | null; language: string }): string => {
  const lang = questionLanguage(b);
  return lang === "en" ? DEFAULT_PROMPT_TEMPLATE : QUESTIONS[lang].template;
};

/** A template must name the service and carry a location token. */
export function validateTemplate(template: string): string | null {
  const t = template.trim();
  if (t.length < 20) return "The prompt is too short.";
  if (t.length > MAX_TEMPLATE_LENGTH) return `Keep the prompt under ${MAX_TEMPLATE_LENGTH} characters.`;
  if (!t.includes("{service}")) return "The prompt must contain {service}.";
  if (!t.includes("{neighbourhood}") && !t.includes("{city}") && !t.includes("{area}")) return "The prompt must contain {neighbourhood} or {city}.";
  return null;
}

export function buildPrompt(template: string, v: { neighbourhood?: string | null; city?: string | null; service: string; lat: number; lng: number }): string {
  const city = (v.city ?? "").trim();
  // No named area for this point: fall back to coordinates rather than inventing a place name.
  const hood = (v.neighbourhood ?? "").trim() || `the area around ${v.lat.toFixed(3)}, ${v.lng.toFixed(3)}`;
  // {area}: the point's own name, or its coordinates (the written questions say "near {area}").
  const area = (v.neighbourhood ?? "").trim() || `${v.lat.toFixed(3)}, ${v.lng.toFixed(3)}`;
  let out = template.replaceAll("{service}", v.service.trim()).replaceAll("{neighbourhood}", hood).replaceAll("{area}", area);
  out = city ? out.replaceAll("{city}", city) : out.replace(/,?\s*\{city\}/g, "");
  return out.replace(/\s+/g, " ").trim();
}
