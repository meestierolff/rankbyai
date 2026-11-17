/** The prompt is identical across engines and stored verbatim with every sample (brief 6.5). */
export const DEFAULT_PROMPT_TEMPLATE =
  "I'm in {neighbourhood}, {city}. Who are the best {service} near me? Recommend up to 5 specific businesses by name, each with a one-line reason.";

export const MAX_TEMPLATE_LENGTH = 400;

/** A template must name the service and carry a location token. */
export function validateTemplate(template: string): string | null {
  const t = template.trim();
  if (t.length < 20) return "The prompt is too short.";
  if (t.length > MAX_TEMPLATE_LENGTH) return `Keep the prompt under ${MAX_TEMPLATE_LENGTH} characters.`;
  if (!t.includes("{service}")) return "The prompt must contain {service}.";
  if (!t.includes("{neighbourhood}") && !t.includes("{city}")) return "The prompt must contain {neighbourhood} or {city}.";
  return null;
}

export function buildPrompt(template: string, v: { neighbourhood?: string | null; city?: string | null; service: string; lat: number; lng: number }): string {
  const city = (v.city ?? "").trim();
  // No named area for this point: fall back to coordinates rather than inventing a place name.
  const hood = (v.neighbourhood ?? "").trim() || `the area around ${v.lat.toFixed(3)}, ${v.lng.toFixed(3)}`;
  let out = template.replaceAll("{service}", v.service.trim()).replaceAll("{neighbourhood}", hood);
  out = city ? out.replaceAll("{city}", city) : out.replace(/,?\s*\{city\}/g, "");
  return out.replace(/\s+/g, " ").trim();
}
