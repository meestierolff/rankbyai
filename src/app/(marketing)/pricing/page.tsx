import { IndexResearchLink } from "@/components/ai-index/shared";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { Calculator } from "@/components/marketing/calculator";
import { Compare } from "@/components/marketing/compare";
import { Faq } from "@/components/marketing/faq";
import { Footer } from "@/components/marketing/footer";
import { Header } from "@/components/marketing/header";
import { OfferProvider } from "@/components/marketing/offer-context";
import { Pricing } from "@/components/marketing/pricing";
import { packsOpen } from "@/lib/availability";
import { scenarioCosts } from "@/lib/cost/estimate";
import { buildFaq } from "@/lib/faq";
import { getOfferCached } from "@/lib/offer";
import { breadcrumbLd, faqLd, graph, softwareLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Pricing: Pay Once, Scans at Cost",
  description: "RankbyAI pricing: one payment for lifetime access, with a price that follows a public sales counter. Scans run at cost on your own API keys. 14-day refund.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "RankbyAI pricing: pay once, scans at cost", description: "One payment for lifetime access. Scans at cost on your own API keys.", url: "/pricing" },
};

export default async function PricingPage() {
  const result = await getOfferCached();
  const live = result.available ? { ...result.offer, paidTotal: result.paidTotal } : null;
  const offer = result.available ? result.offer : null;
  const packs = packsOpen();
  const faq = buildFaq(offer, { packsOpen: packs });
  const costs = scenarioCosts();
  return (
    <OfferProvider initial={live}>
      <JsonLd data={graph(breadcrumbLd([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }]), softwareLd(offer), faqLd(faq))} />
      <div className="min-h-dvh overflow-x-clip bg-lp-bg text-lp-fg">
        <Header />
        <main>
          <h1 className="sr-only">RankbyAI pricing</h1>
          <Pricing costs={costs} packsOpen={packs} />
          <IndexResearchLink label="see the 23 Nov ChatGPT snapshot for 387 cities" />
          <Compare costs={costs} />
          <Calculator />
          <Faq items={faq} />
        </main>
        <Footer />
      </div>
    </OfferProvider>
  );
}
