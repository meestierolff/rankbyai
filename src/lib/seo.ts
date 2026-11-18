import type { FaqItem } from "@/lib/faq";
import type { Offer } from "@/lib/ladder";
import { legalEnv, publicEnv } from "@/lib/env";
import { MAPS_GRID_RANGE, REFUND_DAYS } from "@/lib/pricing-constants";

const site = () => publicEnv.siteUrl;

export const FEATURE_LIST = [
  "AI visibility grid across ChatGPT, Perplexity and Gemini (official APIs)",
  `Google Maps rank grid from ${MAPS_GRID_RANGE}`,
  "Scan history and side-by-side compare",
  "Local AI Audit with a 0–100 score and P0–P3 findings",
  "Fix Kit: profile text, FAQ, LocalBusiness and FAQ schema, llms.txt draft",
  "White-label prospect reports with live links and PDFs",
  "Bring your own API keys, scans at cost",
  "REST API and MCP server",
];

export function organizationLd() {
  const email = legalEnv.email();
  const legalName = legalEnv.entityName();
  return {
    "@type": "Organization",
    "@id": `${site()}/#organization`,
    name: "RankbyAI",
    ...(legalName ? { legalName } : {}),
    url: site(),
    logo: `${site()}/brand/logo.png`,
    ...(email ? { email } : {}),
  };
}

export function websiteLd() {
  return { "@type": "WebSite", "@id": `${site()}/#website`, url: site(), name: "RankbyAI", publisher: { "@id": `${site()}/#organization` } };
}

/** offers.price is rendered from the live ladder; omitted (never guessed) when the offer is unavailable. */
export function softwareLd(offer: Offer | null) {
  return {
    "@type": ["SoftwareApplication", "WebApplication"],
    "@id": `${site()}/#software`,
    name: "RankbyAI",
    url: site(),
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "AI visibility and local SEO software",
    operatingSystem: "Web",
    description:
      "AI visibility software you pay for once. Shows where ChatGPT, Perplexity and Gemini recommend a local business across a map grid, next to its Google Maps rank, with audits and white-label reports.",
    featureList: FEATURE_LIST,
    publisher: { "@id": `${site()}/#organization` },
    ...(offer && offer.open
      ? {
          offers: {
            "@type": "Offer",
            price: offer.currentPriceUsd.toFixed(2),
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: `${site()}/#pricing`,
            priceValidUntil: offer.closesAt.slice(0, 10),
            hasMerchantReturnPolicy: {
              "@type": "MerchantReturnPolicy",
              applicableCountry: ["US", "GB"],
              returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
              merchantReturnDays: REFUND_DAYS,
              returnMethod: "https://schema.org/ReturnByMail",
              returnFees: "https://schema.org/FreeReturn",
            },
          },
        }
      : {}),
  };
}

export function faqLd(items: FaqItem[], id = `${site()}/#faq`) {
  return {
    "@type": "FAQPage",
    "@id": id,
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: `${site()}${t.path}` })),
  };
}

export const graph = (...nodes: object[]) => ({ "@context": "https://schema.org", "@graph": nodes });
