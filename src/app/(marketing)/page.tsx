import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { Calculator } from "@/components/marketing/calculator";
import { Compare } from "@/components/marketing/compare";
import { DemoVideo } from "@/components/marketing/demo-video";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { FinalCta, StickyBar } from "@/components/marketing/final-cta";
import { Footer } from "@/components/marketing/footer";
import { FreeCheck } from "@/components/marketing/free-check";
import { Header } from "@/components/marketing/header";
import { Hero } from "@/components/marketing/hero";
import { LandingView } from "@/components/marketing/landing-view";
import { OfferProvider } from "@/components/marketing/offer-context";
import { Pricing } from "@/components/marketing/pricing";
import { RealDataLink } from "@/components/marketing/real-data";
import { FeatureRows, HowItWorks, Problem } from "@/components/marketing/sections";
import { TopBanner } from "@/components/marketing/top-banner";
import { Tour } from "@/components/marketing/tour";
import { scenarioCosts } from "@/lib/cost/estimate";
import { miscEnv } from "@/lib/env";
import { freeCheckOpen, packsOpen } from "@/lib/availability";
import { buildFaq } from "@/lib/faq";
import { getOfferCached } from "@/lib/offer";
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
  const packs = packsOpen();
  const faq = buildFaq(offer, { packsOpen: packs });
  // The published comparison scenario [estimate]: one set of numbers, used by hero, pricing and compare.
  const costs = scenarioCosts();

  return (
    <OfferProvider initial={live}>
      <JsonLd data={graph(organizationLd(), websiteLd(), softwareLd(offer), faqLd(faq))} />
      <LandingView />
      {/* Landing redesign: pure black page, warm off-white text (tokens --lp-*). */}
      <div className="min-h-dvh overflow-x-clip bg-lp-bg text-lp-fg">
        <TopBanner />
        <Header />
        <main>
          <Hero costs={costs} />
          <DemoVideo />
          <Tour />
          <RealDataLink />
          <Problem />
          <FeatureRows packsOpen={packs} />
          <Features />
          <HowItWorks packsOpen={packs} />
          <Pricing costs={costs} packsOpen={packs} />
          <Compare costs={costs} />
          <Calculator />
          <Faq items={faq} />
          <FreeCheck turnstileSiteKey={miscEnv.turnstileSiteKey()} open={freeCheckOpen()} />
          <FinalCta />
        </main>
        <Footer padForStickyBar />
        <StickyBar />
      </div>
    </OfferProvider>
  );
}
