import { z } from "zod";

const citySchema = z.object({
  country: z.enum(["us", "uk", "au", "nz"]), city: z.string().min(1), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  query: z.string().min(1), status: z.string().min(1), reason: z.string(),
  agencies: z.array(z.object({ position: z.number().int().positive(), name: z.string().min(1), domain: z.string() })),
  sources: z.array(z.string().min(1)),
  sourceDetails: z.array(z.object({ title: z.string(), url: z.string(), domain: z.string() })).optional(),
  sourceDomains: z.array(z.string()).optional(), parseNotes: z.string().optional(),
  model: z.string().optional(), collectedUtc: z.string().optional(), collectedAmsterdam: z.string().optional(),
}).superRefine((city, ctx) => {
  const valid = city.status === "parsed"
    ? city.agencies.length > 0 && city.agencies.every((a, i) => (i === 0 || a.position > city.agencies[i - 1].position))
    : city.agencies.length === 0 && city.reason.trim().length > 0;
  if (!valid) ctx.addIssue({ code: "custom", message: `Invalid shortlist or missing reason for ${city.city}` });
  if (city.query !== `best SEO agency in ${city.city}`) ctx.addIssue({ code: "custom", message: "Unexpected snapshot prompt" });
});
export const snapshotSchema = z.object({ publishedAt: z.iso.date().nullable(), updatedAt: z.iso.date().nullable(), cities: z.array(citySchema) }).superRefine((snapshot, ctx) => {
  if (!snapshot.cities.length && !snapshot.publishedAt && !snapshot.updatedAt) return;
  const counts = { us: 273, uk: 53, au: 54, nz: 7 };
  const parsed = snapshot.cities.filter(city => city.status === "parsed");
  if (snapshot.cities.length !== 387 || parsed.length !== 336 ||
    Object.entries(counts).some(([code, count]) => snapshot.cities.filter(city => city.country === code).length !== count) ||
    new Set(snapshot.cities.map(city => `${city.country}/${city.slug}`)).size !== 387 ||
    parsed.reduce((sum, city) => sum + city.agencies.length, 0) !== 1610 ||
    parsed.filter(city => city.agencies.length === 5).length !== 213 ||
    snapshot.cities.filter(city => city.sources.length).length !== 325) {
    ctx.addIssue({ code: "custom", message: "Snapshot totals do not match the source brief" });
  }
  if (snapshot.publishedAt && !snapshot.updatedAt) ctx.addIssue({ code: "custom", message: "Published snapshots require a last-edit date" });
});
