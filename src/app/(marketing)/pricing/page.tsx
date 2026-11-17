import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { Calculator } from "@/components/marketing/calculator";
import { Compare } from "@/components/marketing/compare";
import { Faq } from "@/components/marketing/faq";
import { Footer } from "@/components/marketing/footer";
import { Header } from "@/components/marketing/header";
import { OfferProvider } from "@/components/marketing/offer-context";
import { Pricing } from "@/components/marketing/pricing";
import { calculateYearlyDataCost } from "@/lib/cost/estimate";
import { buildFaq } from "@/lib/faq";
import { getOfferCached } from "@/lib/offer";
import { ENGINES, SCENARIO } from "@/lib/pricing-constants";
import { breadcrumbLd, faqLd, graph, softwareLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Pricing: Pay Once, Scans at Cost",
  description: "RankbyAI pricing: one payment for lifetime access, with a price that follows a public sales counter. Scans run at cost on your own API keys, or from included-scan packs. 14-day refund.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "RankbyAI pricing: pay once, scans at cost", description: "One payment for lifetime access. Scans at cost on your own API keys.", url: "/pricing" },
};

export default async function PricingPage() {
  const result = await getOfferCached();
  const live = result.available ? { ...result.offer, paidTotal: result.paidTotal } : null;
  const offer = result.available ? result.offer : null;
  const faq = buildFaq(offer);
  const scenarioYearUsd = calculateYearlyDataCost({
    prompts: SCENARIO.clients * SCENARIO.promptsPerClient, aiGrid: SCENARIO.aiGrid, engines: ENGINES, frequency: SCENARIO.frequency, geminiFreeAllowance: true, mapsGrid: SCENARIO.mapsGrid,
  }).totalUsdPerYear;
  return (
    <OfferProvider initial={live}>
      <JsonLd data={graph(breadcrumbLd([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }]), softwareLd(offer), faqLd(faq))} />
      <Header />
      <main>
        <h1 className="sr-only">RankbyAI pricing</h1>
        <Pricing scenarioYearUsd={scenarioYearUsd} />
        <Compare scenarioYearUsd={scenarioYearUsd} />
        <Calculator />
        <Faq items={faq} />
      </main>
      <Footer />
    </OfferProvider>
  );
}
