/** Audit maths (brief 7.4). Pure functions: every number shown in a finding comes out of these. */

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export interface ReviewTarget {
  you: number;
  top3Median: number;
  top3Average: number;
  top3Max: number;
  gap: number;
  months: number;
  /** ceil(max(0, top-3 median − your reviews) ÷ months) */
  monthlyTarget: number;
}

export function reviewTarget(you: number, top3: number[], months = 3): ReviewTarget | null {
  const m = median(top3);
  if (m == null) return null;
  const mo = Math.min(12, Math.max(1, Math.round(months)));
  const med = Math.round(m);
  const gap = Math.max(0, med - you);
  return {
    you,
    top3Median: med,
    top3Average: Math.round(top3.reduce((a, b) => a + b, 0) / top3.length),
    top3Max: Math.max(...top3),
    gap,
    months: mo,
    monthlyTarget: Math.ceil(gap / mo),
  };
}

export interface PageMath {
  services: number;
  areas: number;
  /** services × areas */
  pagesNeeded: number;
  pagesHave: number;
  toBuild: number;
}

export function pageMath(services: string[], areas: string[], pagesHave: number): PageMath {
  const needed = services.length * areas.length;
  return { services: services.length, areas: areas.length, pagesNeeded: needed, pagesHave, toBuild: Math.max(0, needed - pagesHave) };
}

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const titleCase = (s: string) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
const csvCell = (v: string) => {
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};

export interface PagePlanRow {
  service: string;
  area: string;
  slug: string;
  title: string;
}

/** One row per service × area: the pages the page maths says to build. */
export function pagePlan(services: string[], areas: string[], businessName: string): PagePlanRow[] {
  return services.flatMap((service) =>
    areas.map((area) => ({ service, area, slug: `/${slugify(service)}-${slugify(area)}`, title: `${titleCase(service)} in ${area} | ${businessName}` })),
  );
}

export function pagePlanCsv(rows: PagePlanRow[]): string {
  return ["service,area,suggested_slug,suggested_title", ...rows.map((r) => [r.service, r.area, r.slug, r.title].map(csvCell).join(","))].join("\r\n") + "\r\n";
}
