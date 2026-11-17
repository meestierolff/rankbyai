import { OG_SIZE, ogCard } from "@/lib/og";
import { getRegionalPageCached as getRegionalPage, monthYear } from "@/lib/regional";

export const alt = "Which businesses AI assistants recommend, by city";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ niche: string; city: string }> }) {
  const { niche, city } = await params;
  const page = await getRegionalPage(niche, city);
  return ogCard({
    eyebrow: page ? `Regional data · ${monthYear(page.last_updated)}` : "Regional data",
    title: page ? `Which ${page.labels.niche} do AI assistants recommend in ${page.labels.city}?` : "AI visibility by city",
    footer: page ? `${page.sample_count} answers · official APIs · AI answers vary` : undefined,
  });
}
