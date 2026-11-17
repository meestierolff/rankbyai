import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { Calculator } from "@/components/marketing/calculator";
import { Compare } from "@/components/marketing/compare";
import { EarlyAccessBanner } from "@/components/marketing/early-access";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { FinalCta, StickyBar } from "@/components/marketing/final-cta";
import { Footer } from "@/components/marketing/footer";
import { Header } from "@/components/marketing/header";
import { Hero } from "@/components/marketing/hero";
import { OfferProvider } from "@/components/marketing/offer-context";
import { Pricing } from "@/components/marketing/pricing";
import { ApiMcp, CostBand, Fix, HowItWorks, KeySecurity, Problem } from "@/components/marketing/sections";
import { Tour } from "@/components/marketing/tour";
import { calculateYearlyDataCost } from "@/lib/cost/estimate";
import { buildFaq } from "@/lib/faq";
import { getOfferCached } from "@/lib/offer";
import { ENGINES, SCENARIO } from "@/lib/pricing-constants";
import { faqLd, graph, organizationLd, softwareLd, websiteLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "AI Visibility Tracker You Pay For Once | RankbyAI" },
  description:
    "See where ChatGPT, Perplexity and Gemini recommend a local business, point by point on a map, next to its Google Maps rank. Pay once. Your own API keys. 14-day refund.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "AI visibility software you pay for once",
    description: "Point by point on a map: who ChatGPT, Perplexity and Gemini recommend, next to the Google Maps rank. Pay once, scans at cost on your own keys.",
    url: "/",
  },
};

export default async function HomePage() {
  const result = await getOfferCached();
  const live = result.available ? { ...result.offer, paidTotal: result.paidTotal } : null;
  const offer = result.available ? result.offer : null;
  const faq = buildFaq(offer);
  // The published comparison scenario [estimate]: one number, used by hero, pricing and compare.
  const scenarioYearUsd = calculateYearlyDataCost({
    prompts: SCENARIO.clients * SCENARIO.promptsPerClient,
    aiGrid: SCENARIO.aiGrid,
    engines: ENGINES,
    frequency: SCENARIO.frequency,
    geminiFreeAllowance: true,
    mapsGrid: SCENARIO.mapsGrid,
  }).totalUsdPerYear;

  return (
    <OfferProvider initial={live}>
      <JsonLd data={graph(organizationLd(), websiteLd(), softwareLd(offer), faqLd(faq))} />
      <EarlyAccessBanner />
      <Header />
      <main>
        <Hero scenarioYearUsd={scenarioYearUsd} />
        <Tour />
        <CostBand />
        <Problem />
        <Fix />
        <Features />
        <HowItWorks />
        <KeySecurity />
        <ApiMcp />
        <Pricing scenarioYearUsd={scenarioYearUsd} />
        <Compare scenarioYearUsd={scenarioYearUsd} />
        <Calculator />
        <Faq items={faq} />
        <FinalCta />
      </main>
      <Footer padForStickyBar />
      <StickyBar />
    </OfferProvider>
  );
}
