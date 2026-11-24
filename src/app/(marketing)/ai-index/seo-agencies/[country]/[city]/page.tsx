import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { PageShell } from "@/components/marketing/page-shell";
import { Correction, IndexCta } from "@/components/ai-index/shared";
import { cities, cityPath, COUNTRIES, findCity, INDEX_PATH, indexPublished } from "@/lib/ai-index/data";
import { CityRecord } from "@/components/ai-index/city-record";
import { citySchema } from "@/lib/ai-index/schema";
import "@/components/ai-index/index.css";

type Props = { params: Promise<{ country: string; city: string }> };
export function generateStaticParams() {
  return cities.map(city => ({ country: city.country, city: city.slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const route = await params;
  const city = findCity(route.country, route.city);
  if (!city) notFound();
  const title = `ChatGPT on “best SEO agency in ${city.city}” (23 Nov 2026) | RankbyAI`;
  const description = city.status === "parsed" ? `${city.agencies.length} names in this one ChatGPT run. A snapshot, not a ranking. See the method and request a correction.` : "This one ChatGPT run was unparseable. A snapshot, not a ranking. See the reason, the method and request a correction.";
  return { title: { absolute: title }, description, alternates: { canonical: `https://rankbyai.live${cityPath(city)}` }, robots: { index: indexPublished, follow: true }, openGraph: { title, description, url: cityPath(city) } };
}
export default async function CityPage({ params }: Props) {
  const route = await params;
  const city = findCity(route.country, route.city);
  if (!city) notFound();
  return <PageShell><JsonLd data={citySchema(city)} /><article className="ai-index"><header>
    <nav aria-label="Breadcrumb" className="index-note"><Link href="/">Home</Link> / <Link href={INDEX_PATH}>SEO Agency AI Index</Link> / <Link href={`${INDEX_PATH}#${city.country}`}>{COUNTRIES[city.country]}</Link> / {city.city}</nav>
    <p className="index-eyebrow">23 November 2026 · {COUNTRIES[city.country]}</p>
    <h1>ChatGPT’s 23 November 2026 shortlist for “best SEO agency in {city.city}”</h1>
    <p className="index-opening">We asked ChatGPT “{city.query}” on 23 November 2026. This page records this one ChatGPT run; answers vary. <Link href={`${INDEX_PATH}#methodology`}>Read the collection method</Link>.</p>
    {!indexPublished ? <p className="index-warning">Draft preview — not published.</p> : null}<p>We make RankbyAI.</p><dl className="index-note"><dt>Model</dt><dd>{city.model || "not recorded"}</dd><dt>Collected (Europe/Amsterdam)</dt><dd>{city.collectedAmsterdam || "not recorded"}</dd><dt>Collected (UTC)</dt><dd>{city.collectedUtc || "not recorded"}</dd></dl>
  </header><CityRecord city={city} /><Correction /><IndexCta sourcePage={cityPath(city)} /><p><Link href={INDEX_PATH}>Explore all cities in this snapshot →</Link></p></article></PageShell>;
}
