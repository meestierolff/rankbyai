/**
 * Content for the search pages (brief 19.1). One registry feeds the pages, the sitemap, the footer
 * and llms.txt.
 *
 * Rules these pages keep:
 *  - Facts about other tools come only from lib/competitors.ts (read on the vendor's own page, dated,
 *    with the page linked) or are stated in the text with the same date. Where we hold no verified
 *    figure, the page says so and points at the vendor's own page.
 *  - We never claim to be first or only: Local Falcon runs AI visibility on a grid, and BrightLocal
 *    tracks AI visibility per location.
 *  - AI-visibility platforms for brands (Peec AI, Profound, Otterly.AI, Semrush's AI Visibility
 *    Toolkit) are compared only on AI recommendations. They are not map-grid tools, and RankbyAI does
 *    not replace their enterprise features or a suite such as Semrush.
 *  - Each page says what the other tool does well, and no rankings or results are promised.
 *  - One URL per intent. Close variants are covered in the text and FAQ, and redirect here (next.config.ts).
 */
import { LOCAL_SEO_AUDIT_PAGE } from "@/lib/local-seo-audit-page";
import { BRIGHTLOCAL_VS_WHITESPARK, WS, type FactTable, type Row, type Vendor } from "@/lib/competitors";
import { MAPS_GRID_RANGE, MAPS_GRID_SIZES } from "@/lib/pricing-constants";

/** Running text: plain, or a link. An href starting with "/" is a page on this site; anything else opens the vendor's page. */
export type Inline = string | { text: string; href: string };
/** Article content: paragraphs, lists, commands and accessible comparison tables. */
export type Block = string | { list: string[] } | { p: Inline[] } | { code: string } | {
  table: { caption: string; columns: string[]; rows: Inline[][][] };
};

export interface SeoPage {
  path: string;
  group: "root" | "alternatives" | "blog";
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  h1: string;
  /** Answer-first opening: the direct answer to the search, in two or three sentences. Holds the page's main phrase. */
  answer: string;
  showSampleGrid?: boolean;
  /** Audit product page: demo before copy, live pricing and software schema. */
  showSampleAudit?: boolean;
  /** A static result preview, explicitly labelled when it contains example data. */
  resultPreview?: { src: string; alt: string; width: number; height: number; caption: string };
  /** When supplied, this is the article's single primary CTA. */
  ctaLabel?: string;
  socialTitle?: string;
  table?: { caption: string; columns: Vendor[]; rows?: Row[] };
  /** A table with its own rows and dates (lib/competitors.ts), used instead of `table`. */
  factTable?: FactTable;
  /** Paragraphs right under the table and its footnote. */
  afterTable?: Block[];
  /** One line under the call to action: what happens when you click it. */
  ctaNote?: string;
  /** Who makes RankbyAI and who the compared vendors are, shown under the opening. `maker` is the legal entity name and may be empty. */
  entity?: (maker: string) => string;
  /** JSON-LD type of the page itself. Default "Article". */
  schemaType?: "Article" | "WebPage";
  /** A two-column social card instead of the title card (lib/og.tsx ogVersusCard). */
  og?: { columns: { name: string; line: string }[]; footer: string };
  sections: { h2: string; id?: string; body: Block[] }[];
  faqs: { q: string; a: string }[];
  related: string[];
  /** Last real edit (sitemap lastmod, "Updated" line). */
  updated: string;
  /** First published, when different from `updated`. */
  published?: string;
}

const FIRST = "2026-11-17";
const UPDATED = "2026-11-20";
const VARY = "AI answers vary between runs, places and time, so a grid is a set of observations on the date it was run, not a fixed ranking.";
const LOCAL_ONLY =
  "RankbyAI asks three assistants (ChatGPT, Perplexity and Gemini) and is built around local businesses. It is not a replacement for a brand-level AI-visibility platform with more engines, countries and enterprise features.";

export const SEO_PAGES: SeoPage[] = [
  LOCAL_SEO_AUDIT_PAGE,
  // ───────────────────────── alternatives ─────────────────────────
  {
    path: "/alternatives/local-falcon", group: "alternatives", slug: "local-falcon", eyebrow: "Alternatives",
    title: "Local Falcon Alternative You Pay For Once",
    description: "An honest comparison of Local Falcon and RankbyAI: what Local Falcon does well, and where a pay-once tool with scans at cost on your own API keys fits better.",
    h1: "A Local Falcon alternative you pay for once",
    answer:
      "RankbyAI is a Local Falcon alternative for agencies that want Google Maps grids and AI recommendation grids without a monthly plan. You pay once for the software, then run scans at cost on your own API keys. Local Falcon is the more mature grid tracker and also runs AI visibility on a grid; RankbyAI differs in how you pay, in the engines it asks, and in bulk prospect reports.",
    showSampleGrid: true,
    table: { caption: "Local Falcon and RankbyAI side by side", columns: ["rankbyai", "localfalcon"] },
    sections: [
      { h2: "What does Local Falcon do well?", body: [
        "Local Falcon has been building map grids for years and it shows. It covers Google Maps and Apple Maps on grids up to 21×21, and it runs AI visibility scans on the same geo-grid, from 9 to 441 points. Its pricing page lists an MCP server on every plan, and an API. If you want one established tracker with a credit system that includes the data, it is a sound choice.",
        "We are not the first tool to show AI recommendations on a grid, and we do not claim to be.",
      ] },
      { h2: "What is different about RankbyAI?", body: [
        { list: [
          "You pay once. The lifetime price follows a public sales counter: it starts low and rises a fixed step after every few sales. There is no subscription to cancel while the lifetime deal is open.",
          "Scans run at cost. With your own DataForSEO, OpenAI, Perplexity and Gemini keys, your vendors bill you directly at their rates and we add nothing. You see an estimate before every scan and the actual cost after it.",
          "The engines differ. RankbyAI asks ChatGPT, Perplexity and Gemini through their official APIs. Local Falcon's AI page names ChatGPT, Google AI Overviews, Google AI Mode, Gemini and Grok.",
          "AI and Maps on the same grid, with the full answer text and cited sources stored for every point.",
          "Prospect reports in bulk. Search a niche and a city, pick the businesses outside the top 3, and get a white-label report with a factual opening line for each.",
        ] },
      ] },
      { h2: "When should you stay with Local Falcon?", body: [
        { p: ["Before choosing a tool, see ", { text: "what a local business can fix for ChatGPT", href: "/blog/how-to-show-up-in-chatgpt" }, " for free."] },
        "Stay if you need Apple Maps grids, AI Overviews or Grok, if your team is trained on it and its reports, or if you prefer one bill that covers the data. RankbyAI asks you to bring your own API keys, which is one more thing to set up.",
      ] },
      { h2: "Other Local Falcon alternatives", body: [
        "If a pay-once tool is not what you are after, the other Local Falcon alternatives are BrightLocal (a local SEO suite with a Local Search Grid and AI tracking per location), Local Viking (Google Business Profile management with a GeoGrid) and Semrush Map Rank Tracker (a module in the Semrush platform). Each has its own comparison page on this site.",
      ] },
      { h2: "How do the costs compare?", body: [
        "The two tools charge in different ways, so compare a year of the work you actually do. With RankbyAI the software is a one-time payment and the data is billed by your API vendors. Local Falcon charges one credit per grid point, within its plan's credits. The calculator on our pricing page works out your own numbers from published vendor prices; the figures it shows are estimates.",
      ] },
    ],
    faqs: [
      { q: "Is there a free Local Falcon alternative?", a: "RankbyAI is not free: it is a one-time purchase, and scans cost what your API vendors charge. There is a free check of one map point on three AI engines, without an account, so you can see a real result before buying. Local Falcon gives 100 free credits on sign-up, according to its pricing page." },
      { q: "Does RankbyAI have AI visibility grids like Local Falcon?", a: `Yes. RankbyAI asks ChatGPT, Perplexity and Gemini through their official APIs who they recommend at each grid point. Local Falcon also runs AI visibility on a grid; we do not claim to be first. ${VARY}` },
      { q: "Can I move my Local Falcon scans to RankbyAI?", a: "No. There is no import. You add your businesses in RankbyAI and run new scans, which then build their own history." },
      { q: "Does RankbyAI support Apple Maps?", a: "No. RankbyAI covers Google Maps and three AI engines. If Apple Maps grids matter to you, Local Falcon supports them." },
    ],
    related: ["/pricing", "/blog/local-falcon-pricing", "/alternatives/brightlocal", "/alternatives/local-viking", "/local-rank-tracker"],
    updated: "2026-11-25", published: FIRST,
  },
  {
    path: "/alternatives/brightlocal", group: "alternatives", slug: "brightlocal", eyebrow: "Alternatives",
    title: "BrightLocal Alternative: Pay Once, Scans at Cost",
    description: "How RankbyAI compares with BrightLocal for AI visibility and Google Maps grids: a lifetime seat with scans at cost versus monthly plans by location.",
    h1: "A BrightLocal alternative without the monthly plan",
    answer:
      "RankbyAI is a BrightLocal alternative for agencies whose main need is to see where AI assistants and Google Maps recommend a client, and to win new clients with that evidence. You pay once, then run scans at cost on your own API keys. BrightLocal is a broader local SEO suite sold as monthly plans by number of locations, with a Local AI Visibility Tracker included in every plan.",
    showSampleGrid: true,
    table: { caption: "BrightLocal, Local Falcon and RankbyAI side by side", columns: ["rankbyai", "brightlocal", "localfalcon"] },
    afterTable: [{ p: ["See ", { text: "how our audit works", href: "/local-seo-audit" }, " for the checks, evidence and priority order."] }, { p: ["Whitespark sells its grid, rank tracker and citation tools one by one; see ", { text: "how BrightLocal compares with Whitespark", href: "/brightlocal-vs-whitespark" }, "."] }],
    sections: [
      { h2: "What does BrightLocal do well?", body: [
        "BrightLocal is a full local SEO suite: rank tracking on Google and Bing, a Local Search Grid, citation tracking and building, review tools and white-label reporting, in one subscription. Its Local AI Visibility Tracker covers Google AI Overviews, Google AI Mode and ChatGPT, with up to 20 prompts per location, and comes with every plan. If you manage listings and reviews for many locations and want one vendor for all of it, that breadth is its strength.",
        "RankbyAI does not manage citations or reviews. It measures, audits and reports.",
      ] },
      { h2: "What does RankbyAI do differently?", body: [
        { list: [
          "A lifetime seat. One payment while the lifetime deal is open, no plan tiers by number of locations.",
          "Scans at cost on your own keys, with the estimate shown before you run and the actual cost after.",
          "An AI grid and a Maps grid for the same points. BrightLocal's AI tracker works per location; RankbyAI asks at every point of a grid, so you can see where a business ranks on Maps but is not named by AI, and the other way round.",
          "A Local AI Audit that scores a business against the three competitors that hold the map pack around it. Every finding shows its evidence, and checks that could not run are listed, not guessed.",
          "Prospect reports in bulk, white-labelled, for winning new clients.",
        ] },
      ] },
      { h2: "Which one fits your agency?", body: [
        "Choose BrightLocal if you want citations, review management and tracking under one subscription. Choose RankbyAI if you mostly need visibility evidence for client reports and sales, and you would sooner pay once and cover the data at cost.",
        "Many agencies will use both: a suite for listings, and a grid tool for proof.",
      ] },
      { h2: "Other BrightLocal alternatives", body: [
        "Other BrightLocal alternatives cover parts of the suite: Local Falcon for map grids and AI on a grid, Local Viking for Google Business Profile management with a GeoGrid, and Semrush's Local toolkit inside the Semrush platform. For prices, see our BrightLocal pricing page, with the figures we read on BrightLocal's site and their date.",
      ] },
    ],
    faqs: [
      { q: "Does BrightLocal track AI visibility?", a: "Yes. BrightLocal's Local AI Visibility Tracker is included in its Track, Manage and Grow plans and covers Google AI Overviews, Google AI Mode and ChatGPT. RankbyAI is not the first or only tool that does this." },
      { q: "Is RankbyAI cheaper than BrightLocal?", a: "It depends on your volume. RankbyAI is a one-time payment plus what your API vendors charge for the scans you run; BrightLocal is a monthly or yearly plan priced by number of locations. Use the calculator on our pricing page with your own number of clients and prompts. Its results are estimates from published vendor prices." },
      { q: "Does RankbyAI build citations or manage reviews?", a: "No. RankbyAI measures AI and Maps visibility, audits a business against its competitors and produces reports and fix lists. You apply the fixes yourself or with your own tools." },
    ],
    related: ["/pricing", "/blog/brightlocal-pricing", "/local-falcon-vs-brightlocal", "/alternatives/local-falcon", "/ai-visibility-tracker"],
    updated: "2026-11-26", published: FIRST,
  },
  {
    path: "/alternatives/local-viking", group: "alternatives", slug: "local-viking", eyebrow: "Alternatives",
    title: "Local Viking Alternative: Geo Grids Plus AI Answers",
    description: "Local Viking and RankbyAI compared: Google Business Profile management with a GeoGrid, versus Maps and AI recommendation grids on the same points, paid once.",
    h1: "A Local Viking alternative with AI answers on the same grid",
    answer:
      "RankbyAI is a Local Viking alternative for agencies that want the Google Maps geo grid and, on the same points, whether ChatGPT, Perplexity and Gemini recommend the business. Local Viking manages Google Business Profiles and has a GeoGrid rank tracker; on the pages we read on 20 November 2026 we found no mention of AI visibility tracking.",
    showSampleGrid: true,
    table: { caption: "Local Viking, Local Falcon and RankbyAI side by side", columns: ["rankbyai", "localviking", "localfalcon"], rows: ["pay", "price", "aiGrid", "mapsGrid", "api", "reports", "citations"] },
    sections: [
      { h2: "What does Local Viking do well?", body: [
        "Local Viking is built around Google Business Profiles: edit and sync profile information for many locations in one place, and respond to reviews. Its GeoGrid tracks Google rankings at points around a business, with a mode that runs on your own Google Places API key and a mode for service-area businesses. White-label reporting is available from its Pro plan, and it has an API.",
      ] },
      { h2: "What is different about RankbyAI?", body: [
        { list: [
          "AI recommendations on the grid: at every point, which businesses ChatGPT, Perplexity and Gemini named, next to the Google Maps rank there.",
          "You pay once for the software, and scans run at cost on your own API keys.",
          "A Local AI Audit with evidence for every finding, and a Fix Kit with copy-ready schema and FAQs.",
          "Bulk prospect reports, white-labelled, plus a REST API and an MCP server.",
        ] },
        "RankbyAI does not manage Google Business Profiles, publish posts or answer reviews.",
      ] },
      { h2: "A note on Local Viking's pricing", body: [
        "On 20 November 2026, localviking.com/pricing redirected to a pricing page on app.localoptics.com, branded LocalOptics, which does not mention Local Viking. We could not confirm how the two are related, so we do not quote those prices as Local Viking's. Check the current price with Local Viking before you compare.",
      ] },
      { h2: "When should you stay with Local Viking?", body: [
        "Stay if profile management is the daily work: editing and syncing details across many locations and answering reviews. If you also need to see what AI assistants say around each client, RankbyAI can sit next to it.",
      ] },
    ],
    faqs: [
      { q: "Does Local Viking track AI visibility?", a: "On the Local Viking pages we read on 20 November 2026, including its feature roadmap, we found no mention of tracking ChatGPT, Perplexity, Gemini or AI Overviews. Its AI features listed there are for reviews and posts." },
      { q: "Can I use my own API keys?", a: "In both, in different ways. Local Viking's GeoGrid has a mode that runs on your own Google Places API key. RankbyAI runs Maps lookups on your DataForSEO account and AI checks on your OpenAI, Perplexity and Gemini keys, at those vendors' prices." },
      { q: "Does RankbyAI manage Google Business Profiles?", a: "No. RankbyAI measures, audits and reports. Its audit tells you what to change in a profile, with the evidence; you make the change yourself or in a tool like Local Viking." },
    ],
    related: ["/alternatives/local-falcon", "/local-rank-tracker", "/map-rank-tracker", "/pricing"],
    updated: UPDATED,
  },
  {
    path: "/alternatives/peec-ai", group: "alternatives", slug: "peec-ai", eyebrow: "Alternatives",
    title: "Peec AI Alternative for Local Businesses and Agencies",
    description: "Peec AI tracks brand prompts across AI models and countries. RankbyAI asks who AI assistants recommend at points on a map around a local business. Where each fits.",
    h1: "A Peec AI alternative for local AI visibility",
    answer:
      "Looking for a Peec AI alternative for local businesses? The question is whether you want to track a brand's prompts across many AI models and countries, or see who AI assistants recommend at specific points on a map. Peec AI does the first. RankbyAI does the second: it asks ChatGPT, Perplexity and Gemini at each point of a grid around a business, next to its Google Maps rank, and you pay once.",
    table: { caption: "Peec AI and RankbyAI side by side", columns: ["rankbyai", "peec"], rows: ["pay", "price", "engines", "aiGrid", "api", "reports"] },
    sections: [
      { h2: "What does Peec AI do well?", body: [
        "Peec AI tracks prompts every day across the AI models you choose, including ChatGPT, Perplexity, Google AI Overviews, AI Mode and Gemini, with unlimited users on every plan. Prompts can run from chosen countries, its MCP server is included on every plan, and its agency plans add shareable client dashboards and free pitch projects for prospects. For a brand that wants to see how AI search talks about it across markets, that is the job it is built for.",
      ] },
      { h2: "Where is RankbyAI different?", body: [
        { list: [
          "Local by design: the same question is asked at each point of a map grid around one business, because a local answer depends on where it is asked.",
          "The Google Maps rank at the same points, so AI and Maps can be read together.",
          "One payment for the software; scans at cost on your own API keys.",
          "White-label share links and PDFs, bulk prospect reports, and an audit with a fix list.",
        ] },
        LOCAL_ONLY,
      ] },
      { h2: "When should you stay with Peec AI?", body: [
        "Stay with Peec AI if you track national or international brands, need more AI models than three, or want daily tracking across countries with team dashboards. Its pricing page also lists a “Local GEO” row on every plan without describing it; we found no mention of checking answers at points around a business.",
      ] },
      { h2: "Can an agency use both?", body: [
        "Yes. A brand-level tool shows how AI search describes a client overall; a local grid shows who is recommended street by street. They answer different questions.",
      ] },
    ],
    faqs: [
      { q: "Is Peec AI a local rank tracker?", a: "Not in the map-grid sense. Its pages describe running prompts from chosen countries and showing ChatGPT's local results on a map; we found no mention of checking answers at grid points around a business (read on 20 November 2026)." },
      { q: "What is a cheaper Peec AI alternative?", a: "We do not make that claim. Peec AI is a monthly subscription; RankbyAI is a one-time payment plus what your API vendors charge for the scans you run. Compare a year of your own use; the prices in the table are dated and linked." },
      { q: "Does RankbyAI track Google AI Overviews?", a: "No. RankbyAI asks ChatGPT, Perplexity and Gemini through their official APIs. If AI Overviews or AI Mode matter to you, Peec AI covers them." },
    ],
    related: ["/blog/peec-ai-pricing", "/peec-ai-vs-profound", "/alternatives/profound", "/ai-visibility-tracker", "/pricing"],
    updated: UPDATED,
  },
  {
    path: "/alternatives/profound", group: "alternatives", slug: "profound", eyebrow: "Alternatives",
    title: "Profound Alternative for Local AI Visibility",
    description: "Profound is an enterprise AI-visibility platform for brands. RankbyAI checks who AI assistants recommend at points around a local business, paid once. When each fits.",
    h1: "A Profound alternative for local businesses",
    answer:
      "A Profound alternative makes sense when the businesses you track are local: a dentist, a plumber or a law firm in one city. Profound is an enterprise AI-visibility platform for brands, sold on custom contracts. RankbyAI asks ChatGPT, Perplexity and Gemini who they recommend at each point of a map grid around a local business, next to its Google Maps rank, for a one-time payment.",
    table: { caption: "Profound and RankbyAI side by side", columns: ["rankbyai", "profound"], rows: ["pay", "price", "engines", "aiGrid", "api", "reports"] },
    sections: [
      { h2: "What does Profound do well?", body: [
        "Profound tracks up to ten answer engines, including ChatGPT, Perplexity, Google AI Mode, Gemini, Claude and Google AI Overviews, with daily prompt tracking, unlimited seats, an API, SSO and SOC 2. Its MCP server is available to Enterprise customers, and agencies get workspaces per client. For a large brand that needs coverage and compliance, it is built for that.",
      ] },
      { h2: "Where does RankbyAI differ?", body: [
        { list: [
          "It answers a local question: who is recommended at this point on the map, and how does that compare with the Google Maps rank here.",
          "A published price, paid once, with scans at cost on your own API keys.",
          "White-label reports and bulk prospect reports for agencies that sell local SEO.",
        ] },
        LOCAL_ONLY,
      ] },
      { h2: "When should you choose Profound?", body: [
        "When you track a brand across many AI engines and markets, need security reviews and SSO, and buy software through a sales process. RankbyAI is not trying to be that.",
      ] },
    ],
    faqs: [
      { q: "How much does Profound cost?", a: "Profound does not publish a price: on 20 November 2026 its pricing page listed Enterprise and Agency Enterprise plans at “Custom”. See our Profound pricing page for what is and is not published." },
      { q: "Does Profound track local results?", a: "Its pricing page lists regions as “Custom”, and a 2025 Profound blog post describes city-level analysis through its sales team. We found no mention of checking answers at points on a map around a business." },
      { q: "Is RankbyAI a replacement for Profound?", a: "No. RankbyAI covers three engines and local businesses. It does not replace an enterprise platform's engine coverage, compliance or brand analytics." },
    ],
    related: ["/blog/profound-pricing", "/peec-ai-vs-profound", "/alternatives/peec-ai", "/ai-visibility-tracker"],
    updated: UPDATED,
  },
  {
    path: "/alternatives/otterly", group: "alternatives", slug: "otterly", eyebrow: "Alternatives",
    title: "Otterly Alternatives for Local AI Visibility",
    description: "Otterly alternatives in two groups: brand-level AI monitoring, and tools that measure AI answers at points on a map around a local business.",
    h1: "Otterly alternatives for local AI visibility",
    answer:
      "Otterly alternatives fall into two groups: other brand-level AI monitoring tools, and tools that measure local answers on a map. Otterly.AI monitors how AI search engines mention a brand across seven engines, by country. RankbyAI is in the second group: it asks ChatGPT, Perplexity and Gemini at each point of a grid around a local business, next to its Google Maps rank, and you pay once.",
    table: { caption: "Otterly.AI, Peec AI and RankbyAI side by side", columns: ["rankbyai", "otterly", "peec"], rows: ["pay", "price", "engines", "aiGrid", "api"] },
    sections: [
      { h2: "What does Otterly.AI do well?", body: [
        "Otterly.AI covers seven AI engines, including Microsoft Copilot and Claude, with unlimited brands, competitors, countries and team members on every plan. Its plans are sized in credits, the larger plans include API and MCP requests, agency partners get branded Looker Studio reports, and there is a 7-day free trial without a card.",
      ] },
      { h2: "Which Otterly alternative fits which job?", body: [
        { list: [
          "Brand monitoring across AI search: Peec AI, Profound and Semrush's AI Visibility Toolkit do this, each with its own pricing and engine list.",
          "AI answers on a local map grid: Local Falcon runs AI visibility on its geo-grid, and RankbyAI asks at each grid point next to the Google Maps rank.",
          "AI tracking inside a local SEO suite: BrightLocal includes an AI visibility tracker per location in its plans.",
        ] },
      ] },
      { h2: "Where is RankbyAI different?", body: [
        "It is for local businesses and the agencies that serve them: one business, many points on the map, three assistants and the Maps rank at each point, stored with the full answers and cited sources. You pay once and run scans at cost on your own keys.",
        LOCAL_ONLY,
      ] },
    ],
    faqs: [
      { q: "Is there an Otterly alternative for local SEO agencies?", a: "If your clients are local businesses, a map-grid tool answers the local question directly: Local Falcon and RankbyAI both check AI answers at grid points. BrightLocal tracks AI visibility per location inside its suite." },
      { q: "Does Otterly.AI track Google Maps rankings?", a: "On its pricing page and homepage (read 20 November 2026) we found no mention of Google Maps or map-grid tracking. Location is handled by country." },
      { q: "Does RankbyAI have a free trial?", a: "No trial, but there is a free check of one map point without an account, and a 14-day refund on the purchase. API vendor fees for scans you ran cannot be refunded." },
    ],
    related: ["/blog/otterly-pricing", "/alternatives/peec-ai", "/alternatives/profound", "/ai-visibility-tracker", "/pricing"],
    updated: UPDATED,
  },

  // ───────────────────────── guides ─────────────────────────
  {
    path: "/local-rank-tracker", group: "root", slug: "local-rank-tracker", eyebrow: "Guide",
    title: "Local Rank Tracker: Google Maps and AI Answers on One Grid",
    description: "What a local rank tracker measures, why it needs a grid, and how RankbyAI tracks the Google Maps rank and AI recommendations at the same points around a business.",
    h1: "Local rank tracker for Google Maps and AI answers",
    answer:
      "A local rank tracker shows where a business ranks from the places its customers search. RankbyAI is a local rank tracker that records the Google Maps rank at every point of a grid around a business and, on the same points, whether ChatGPT, Perplexity and Gemini recommend it. It does not track organic web rankings.",
    showSampleGrid: true,
    table: { caption: "Local rank trackers side by side", columns: ["rankbyai", "localfalcon", "brightlocal", "localviking"], rows: ["pay", "price", "mapsGrid", "aiGrid", "api", "reports"] },
    sections: [
      { h2: "What does a local rank tracker measure?", body: [
        "Google's local results depend on where the searcher is. A rank checker that looks from one place, usually the city centre, gives one number that is true only there. A local rank tracker for local SEO looks from many points around the business and records the rank at each, so you see where the business is in the top three and where it drops away.",
        "You will also see this called a Google local rank tracker, a local SEO rank tracker, a map rank tracker or a geo grid. They describe the same idea.",
      ] },
      { h2: "Why track Maps rank and AI answers together?", body: [
        { p: ["If clients ask whether ChatGPT recommends them, start with this ", { text: "ChatGPT checklist for local businesses", href: "/blog/how-to-show-up-in-chatgpt" }, "."] },
        "More people now ask an assistant for “a good dentist near me” instead of scrolling the map. The assistant names a few businesses, and they are not always the ones in the map pack. Measuring both on the same points shows where the two agree and where they do not, which is where the work is.",
        VARY,
      ] },
      { h2: "How does RankbyAI track local rankings?", body: [
        { list: [
          `Google Maps results through DataForSEO's official API, the top 20 at each point, on grids from ${MAPS_GRID_RANGE} points.`,
          "Points you do not want tracked (water, a park, outside the service area) can be skipped; they are not looked up and cost nothing.",
          "The grid can be centred on the business or on another point within 100 miles of it, which suits service-area businesses.",
          "On the same points, an AI grid (1×1, 3×3 or 5×5) asks ChatGPT, Perplexity and Gemini who they recommend.",
          "Weekly or monthly re-checks, history, and side-by-side comparison of two scans.",
        ] },
      ] },
      { h2: "What it does not do", body: [
        "RankbyAI does not track organic web rankings, Bing or Apple Maps, and it does not manage citations, listings or reviews. If you need those, a local SEO suite or a specialist covers them.",
      ] },
      { h2: "Which other local rank trackers are there?", body: [
        { p: [
          "Local Falcon covers Google Maps and Apple Maps on grids and runs AI visibility on its grid. BrightLocal has a Local Rank Tracker for Google and Bing plus a Local Search Grid. Local Viking has a GeoGrid next to profile management. Semrush has a Map Rank Tracker in its Local toolkit. The table shows what we read on each vendor's page, with the date. Whitespark sells Local Ranking Grids on their own, priced per grid point: see ",
          { text: "Whitespark and BrightLocal grids compared", href: "/brightlocal-vs-whitespark" },
          ".",
        ] },
      ] },
    ],
    faqs: [
      { q: "What is the best local rank tracker?", a: "The one that fits the work. A specialist grid tool if grids are the job, a suite if you also manage listings and reviews, and RankbyAI if you want Maps and AI answers on the same points for a one-time payment. We make RankbyAI, so weigh that." },
      { q: "Does RankbyAI track organic Google rankings?", a: "No. It tracks Google Maps (local) rankings on a grid and AI recommendations on the same points." },
      { q: "Is a Google local rank tracker the same as a map rank tracker?", a: "In practice, yes. Both look up a keyword on Google's local results from points around a business. Some tools also track the local pack in web search; RankbyAI tracks Google Maps." },
      { q: "Can I track a service-area business without a storefront?", a: "Yes. Centre the grid where the customers are, within 100 miles of the business's map point, and skip points outside the area you serve." },
    ],
    related: ["/map-rank-tracker", "/ai-visibility-tracker", "/alternatives/local-falcon", "/alternatives/local-viking", "/pricing"],
    updated: "2026-11-25",
  },
  {
    path: "/ai-visibility-tracker", group: "root", slug: "ai-visibility-tracker", eyebrow: "Guide",
    title: "AI Visibility Tracker for Local Businesses",
    description: "What an AI visibility tracker (or AI visibility tool) measures, why a national share of voice is the wrong unit for local businesses, and how a map grid shows who AI recommends.",
    h1: "AI visibility tracker for local businesses",
    answer:
      "An AI visibility tracker records whether AI assistants such as ChatGPT, Perplexity and Gemini name a business when someone asks for a recommendation. For a local business the answer changes with where the question is asked, so RankbyAI asks the same question at each point of a map grid and shows who was named at every point, next to the Google Maps rank there. You will also see it called an AI visibility tool or AI visibility software.",
    showSampleGrid: true,
    table: { caption: "AI visibility tools side by side", columns: ["rankbyai", "localfalcon", "brightlocal", "peec", "otterly"], rows: ["pay", "price", "engines", "aiGrid", "mapsGrid"] },
    sections: [
      { h2: "What does an AI visibility tracker measure?", body: [
        "It sends a fixed question to each AI engine, stores the full answer, and records four things: whether the business was named, in which position, which other businesses were named, and which sources the engine cited. Repeating the same question later shows whether anything changed.",
        VARY,
      ] },
      { h2: "Why is a national share of voice the wrong unit for local?", body: [
        "Most AI visibility tools were built for national brands. They ask a question and report a share of voice. That works for “best project management software”. It does not work for “best plumber near me”, where the answer depends on the asker's location.",
        "A dentist can be the first name an assistant gives two streets from the practice and be absent three miles away. One national number hides that. A grid shows it.",
      ] },
      { h2: "How does a local AI grid work?", body: [
        { list: [
          "Pick a business and the service people ask for, for example “dentist”.",
          "Choose a grid: 1×1, 3×3 or 5×5 points around the business, over a radius you set.",
          "At each point, each engine is asked the same question with that point's location. RankbyAI uses the official APIs only: OpenAI with web search, Perplexity with web search, and Gemini with Google Maps grounding.",
          "Each cell shows how many engines named the business. Click a point to read the answers, the businesses named instead and the cited sources.",
        ] },
        "The same grid can carry the Google Maps rank at each point, which is how you find places where a business ranks on Maps but AI names someone else.",
      ] },
      { h2: "AI visibility tool or AI visibility software: what to look for", body: [
        { list: [
          "Where the question is asked: one national check, a country, or points on a map around the business.",
          "Which assistants are covered, and whether answers come from official APIs.",
          "Whether you can read the full answers and cited sources, not only a score.",
          "How you pay: per prompt and model per month, per location, or once.",
          "Reports you can hand to a client, and an API if you want to automate.",
        ] },
      ] },
      { h2: "What do you do with the result?", body: [
        "Look at who is named instead and which sources the engines cite. If several engines cite the same directory or list and the business is not on it, that is a concrete task. The Local AI Audit turns this into findings with evidence: identity and phone consistency, profile gaps against the map pack, missing service pages, review gap, and sources to get listed on.",
        "Then run the same grid again later and compare the two. No tool can promise that an assistant will name a business; what you can do is fix the causes and measure again.",
      ] },
      { h2: "Which AI visibility trackers exist?", body: [
        "For brands there are many: Peec AI, Profound, Otterly.AI and Semrush's AI Visibility Toolkit among them, each comparing how AI search mentions a brand. For local businesses, Local Falcon runs AI visibility on its geo-grid and BrightLocal tracks it per location. RankbyAI is another local option, with a different way of paying: once for the software, and scans at cost on your own API keys.",
      ] },
    ],
    faqs: [
      { q: "Is there a free AI visibility tracker?", a: "RankbyAI has a free check without an account: one map point at the business's own location, on three AI engines, plus its Google Maps rank there. Full grids, history and audits need lifetime access." },
      { q: "What is the difference between an AI visibility tracker, tool and software?", a: "None in practice: the three names describe the same kind of product. What differs between products is where the question is asked, which engines are covered and how you pay." },
      { q: "Which AI engines does RankbyAI check?", a: "ChatGPT (OpenAI's API with web search), Perplexity, and Gemini with Google Maps grounding. API answers can differ from what people see in the consumer apps." },
      { q: "How often should I check AI visibility?", a: "Monthly is enough for most local businesses, and after any change you want to measure. Answers vary from run to run, so look at the pattern across the grid and over time, not at a single cell." },
      { q: "Can a tracker make AI recommend my business?", a: "No. A tracker measures. It shows where you are named, who is named instead and which sources the engines rely on, so you know what to fix. Nobody can guarantee what an assistant will answer." },
    ],
    related: ["/pricing", "/ai-rank-tracker", "/local-rank-tracker", "/alternatives/peec-ai", "/semrush-ai-visibility"],
    updated: UPDATED, published: FIRST,
  },
  {
    path: "/ai-rank-tracker", group: "root", slug: "ai-rank-tracker", eyebrow: "Guide",
    title: "AI Rank Tracker and ChatGPT Rank Tracker, by Location",
    description: "What an AI rank tracker or ChatGPT rank tracker can and cannot measure, and how RankbyAI records a local business's position in AI answers at each point of a map grid.",
    h1: "AI rank tracker for local businesses: ChatGPT, Perplexity and Gemini",
    answer:
      "An AI rank tracker, or a ChatGPT rank tracker when it covers ChatGPT, records the position at which an AI assistant names a business in its answer. There is no fixed ranking to read, as there is on a search results page: the assistant writes a new answer each time. RankbyAI records the position in each stored answer, for three engines, at each point of a map grid.",
    showSampleGrid: true,
    sections: [
      { h2: "Do AI assistants have rankings?", body: [
        "Not in the way a search engine does. An assistant produces an answer that usually names three to five businesses in an order. That order is the nearest thing to a rank, and it can change between two runs of the same question.",
        "So an honest AI rank tracker reports what was observed: named or not, the position in that answer, and how often across points and engines. RankbyAI stores the full answer text with every sample so you can read what was actually said.",
      ] },
      { h2: "Is there a ChatGPT rank tracker for local businesses?", body: [
        "A ChatGPT rank tracker, sometimes called a ChatGPT visibility tracker, asks ChatGPT the question a customer would ask and records whether and where a business is named. For a local business the place matters, so RankbyAI asks ChatGPT through OpenAI's API with web search at each point of a grid, and asks Perplexity and Gemini at the same points.",
        "API answers can differ from the ChatGPT app, which also uses the person's history and settings. Treat the result as a careful sample, not as what every user sees.",
      ] },
      { h2: "What does RankbyAI record?", body: [
        { list: [
          "Whether the business was named, per engine and per grid point.",
          "The position in the answer when it was named.",
          "The businesses named instead, counted across the grid.",
          "The sources each engine cited.",
        ] },
        "For the wider picture of AI visibility tracking, including why location matters, see our AI visibility tracker guide.",
      ] },
    ],
    faqs: [
      { q: "What is a good AI rank?", a: "Being named at all is the first thing to look for, then how widely across the grid and by how many engines. A first position at one point matters less than being named at most points." },
      { q: "Can I track my ChatGPT ranking for a local business?", a: "Yes, as observations. RankbyAI asks ChatGPT at each grid point around the business and stores whether and where it was named, with the answer text. Run it again later to compare." },
      { q: "Why did my position change between two scans?", a: VARY },
      { q: "Is an AI rank tracker the same as an AI visibility tracker?", a: "Mostly. “Rank” puts the weight on position in the answer; “visibility” covers whether you are named, where, by which engines and from which sources. RankbyAI records all of these." },
    ],
    related: ["/ai-visibility-tracker", "/blog/how-to-show-up-in-chatgpt", "/map-rank-tracker", "/pricing"],
    updated: UPDATED, published: FIRST,
  },
  {
    path: "/map-rank-tracker", group: "root", slug: "map-rank-tracker", eyebrow: "Guide",
    title: "Map Rank Tracker: Google Maps Rank on a Geo Grid",
    description: "How a map rank tracker (Google Maps rank tracker, geo grid, GBP rank tracker) works, what grid size and radius to choose, and how to read the result.",
    h1: "Map rank tracker: your Google Maps rank at every point of a grid",
    answer:
      "A map rank tracker, or Google Maps rank tracker, looks a keyword up on Google Maps from a grid of points around a business and records its rank at each one. It is also called a geo grid, geogrid or GBP rank tracker. RankbyAI runs these grids through an official data API, stores the top 20 at each point, and can show AI recommendations on the same points.",
    showSampleGrid: true,
    sections: [
      { h2: "Why does rank depend on the point?", body: [
        "Google Maps weighs distance heavily. A business usually ranks best near its own address and falls away further out. A single rank number hides this; a grid shows the footprint: where the business is in the top three, where it is on page one, and where it does not appear.",
      ] },
      { h2: "Which grid size and radius should you use?", body: [
        { list: [
          "7×7 points is a good default: enough detail to see the shape of the footprint.",
          "Use a radius of about 2 miles for a business customers travel to, and 5 to 10 miles for a service-area business.",
          `9×9 gives a finer picture of a large area, and grids up to ${MAPS_GRID_SIZES[MAPS_GRID_SIZES.length - 1]}×${MAPS_GRID_SIZES[MAPS_GRID_SIZES.length - 1]} cover a wide service area point by point; 3×3 or 5×5 is enough for a quick check.`,
          "Points you do not want tracked, such as water, a park or places outside the service area, can be skipped. They are not looked up and do not count in the averages.",
        ] },
        "RankbyAI shows the cost before you run. Maps lookups are billed per point by the data provider, and the standard queue is the cheapest.",
      ] },
      { h2: "How do you read a grid?", body: [
        "Look for the edge: the line where the business drops out of the top three. Then look at who holds the points beyond it. RankbyAI lists the competitors that take the top three most often across the grid, which is also the list its audit compares the business against.",
        "Run the same grid again after changes and compare the two, point by point.",
        { p: ["For the next actions, ", { text: "audit the business behind the grid", href: "/local-seo-audit" }, "."] },
      ] },
      { h2: "What can a map grid not tell you?", body: [
        { p: ["Your Maps rank and your place in ChatGPT’s answer are separate jobs; here is ", { text: "how to rank in ChatGPT as a local business", href: "/blog/how-to-show-up-in-chatgpt" }, "."] },
        "Who AI assistants recommend. That is a different measurement. A business can hold the map pack at a point and not be named by ChatGPT there. RankbyAI can run an AI grid on the same points to show both.",
      ] },
    ],
    faqs: [
      { q: "Is a geo grid rank tracker accurate?", a: "It reports what the data provider returned for that keyword, point and moment. Results on a phone can differ slightly, and ranks move over time, so read the pattern across the grid." },
      { q: "Does RankbyAI scrape Google Maps?", a: "No. RankbyAI uses DataForSEO's official API for Google Maps results, on your account or ours." },
      { q: "How many results does each point show?", a: "The top 20. A business outside the top 20 at a point is shown as 20+." },
    ],
    related: ["/local-rank-tracker", "/ai-visibility-tracker", "/alternatives/local-falcon", "/blog/semrush-map-rank-tracker", "/pricing"],
    updated: "2026-11-26", published: FIRST,
  },
  {
    path: "/local-seo-software", group: "root", slug: "local-seo-software", eyebrow: "Guide",
    title: "Local SEO Software for Agencies, Paid Once",
    description: "What local SEO software covers, which established tools do what, and where RankbyAI fits: AI and Google Maps grids, audits and prospect reports for a one-time payment.",
    h1: "Local SEO software for agencies that you pay for once",
    answer:
      "Local SEO software helps a business appear where nearby customers look: Google Maps, local search results and, more and more, AI assistants. RankbyAI covers the measuring and reporting part: a Google Maps grid, an AI recommendation grid, an evidence-based audit and prospect reports. You pay once and run scans at cost on your own API keys.",
    showSampleGrid: true,
    table: { caption: "Established tools and RankbyAI", columns: ["rankbyai", "localfalcon", "brightlocal", "semrush"], rows: ["pay", "price", "aiGrid", "mapsGrid", "api", "reports", "citations"] },
    sections: [
      { h2: "What does local SEO software cover?", body: [
        { list: [
          "Rank tracking: where a business appears on the map and in local results, usually on a grid.",
          "Listings and citations: keeping name, address and phone consistent across directories.",
          "Reviews: collecting, monitoring and replying.",
          "Audits and reporting: finding what to fix and showing clients the result.",
          "AI visibility: whether assistants such as ChatGPT name the business. This part is newer.",
        ] },
        "No single tool is best at all five. Suites such as BrightLocal and Semrush cover the most ground; specialists such as Local Falcon go deepest on grids.",
      ] },
      { h2: "Which part does RankbyAI cover?", body: [
        { p: ["See the ", { text: "local SEO audit", href: "/local-seo-audit" }, " for the score, evidence and six diagnostic categories."] },
        "Rank tracking, AI visibility, audits and reporting. It does not build citations, manage listings or handle reviews. Its audit tells you what is inconsistent or missing, with the evidence, and its Fix Kit gives you copy-ready schema, FAQs and a checklist. You or your other tools apply the fixes.",
      ] },
      { h2: "Why pay once?", body: [
        "Agencies pay for tools every month whether or not they scan. With RankbyAI the software is one payment while the lifetime deal is open, and the data is billed by your own API vendors at their rates, only for what you run. You see an estimate before each scan and the actual cost after.",
        "The trade-off is setup: you create API accounts with DataForSEO and at least one AI provider.",
      ] },
    ],
    faqs: [
      { q: "What is the best local SEO software?", a: "It depends on the job. For listings and reviews in one place, a suite. For map grids, a specialist. For AI and Maps evidence with a one-time payment, RankbyAI is one option. We make it, so weigh that." },
      { q: "Is RankbyAI a full local SEO suite?", a: "No. It measures and reports: Maps grids, AI grids, audits and prospect reports. It does not manage citations, listings or reviews." },
      { q: "Do I need technical skills to use my own API keys?", a: "No coding. You create an account with each provider, copy a key, and paste it into RankbyAI, where it is encrypted and never shown again. The app checks the key and shows your estimated cost before every scan." },
    ],
    related: ["/pricing", "/local-rank-tracker", "/ai-visibility-tracker", "/alternatives/brightlocal", "/alternatives/local-falcon"],
    updated: "2026-11-26", published: FIRST,
  },

  // ───────────────────────── comparisons ─────────────────────────
  {
    path: "/local-falcon-vs-brightlocal", group: "root", slug: "local-falcon-vs-brightlocal", eyebrow: "Comparison",
    title: "Local Falcon vs BrightLocal (and Two Other Options)",
    description: "A neutral comparison of Local Falcon and BrightLocal for local rank and AI visibility tracking, with Semrush Map Rank Tracker and RankbyAI alongside.",
    h1: "Local Falcon vs BrightLocal: which fits your agency?",
    answer:
      "Local Falcon vs BrightLocal (or BrightLocal vs Local Falcon) comes down to the job. Local Falcon is a specialist grid tracker; BrightLocal is a wider local SEO suite that includes tracking. Choose Local Falcon when map grids are the job, and BrightLocal when you also want citations and review management in one subscription. Both track AI visibility. Two other options are in the table: Semrush Map Rank Tracker and RankbyAI.",
    table: { caption: "Four tools side by side", columns: ["localfalcon", "brightlocal", "semrush", "rankbyai"], rows: ["pay", "price", "aiGrid", "mapsGrid", "api", "reports", "citations"] },
    afterTable: [{ p: ["Comparing BrightLocal with a vendor that sells each tool on its own? See ", { text: "BrightLocal vs Whitespark", href: "/brightlocal-vs-whitespark" }, ", with both vendors' prices and the date we read them."] }],
    sections: [
      { h2: "What is each tool for?", body: [
        { list: [
          "Local Falcon: map grid rank tracking on Google Maps and Apple Maps, with AI visibility scans on the same grid. Sold as plans with credits; one credit is one grid point.",
          "BrightLocal: a local SEO suite with rank tracking, a Local Search Grid, citations, reviews and reporting. Its Local AI Visibility Tracker is included in every plan and works per location.",
          "Semrush Map Rank Tracker: a Google Maps heatmap in Semrush's Local toolkit, useful if your team already works in Semrush.",
          "RankbyAI (ours): AI and Google Maps grids on the same points, an evidence-based audit, bulk prospect reports, and an API with an MCP server. Paid once, with scans at cost on your own keys.",
        ] },
      ] },
      { h2: "How should you choose?", body: [
        "Start from the work, not the feature list. If you report map grids to clients every month, a specialist grid tool is the natural fit. If you also build citations and manage reviews, a suite saves you a second vendor. If you already pay for Semrush, check whether its module covers your needs before adding another tool.",
        "We make RankbyAI, so read our column with that in mind. It fits agencies that want visibility evidence for reports and sales and would sooner pay once and cover the data at cost. It does not manage citations, reviews or Apple Maps.",
      ] },
      { h2: "What about price?", body: [
        "The four are priced in different ways: credits, plan tiers by location, a per-location add-on in a platform, and a one-time payment plus API costs. The table shows the figures we read on each public pricing page, with the date and a link. Prices change, so open each vendor's pricing page before you decide.",
      ] },
    ],
    faqs: [
      { q: "Is Local Falcon or BrightLocal better for map grids?", a: "Local Falcon is the specialist: grids are its core product, it goes up to 21×21 and it covers Apple Maps too. BrightLocal includes a grid (up to 15×15) as part of a wider suite. If grids are most of what you do, start with the specialist." },
      { q: "Do Local Falcon and BrightLocal track AI visibility?", a: "Yes, both. Local Falcon runs AI visibility on its geo-grid; BrightLocal tracks it per location. So does RankbyAI, on a grid. None of them was built by us first, and we do not claim otherwise." },
      { q: "Why is RankbyAI in this comparison?", a: "Because we make it and this is our site. We have tried to describe the other tools fairly and to show only facts we read on their own pages, with the date." },
    ],
    related: ["/alternatives/local-falcon", "/alternatives/brightlocal", "/blog/brightlocal-pricing", "/blog/local-falcon-pricing", "/pricing"],
    updated: "2026-11-24", published: FIRST,
  },
  {
    path: "/brightlocal-vs-whitespark", group: "root", slug: "brightlocal-vs-whitespark", eyebrow: "Comparison",
    // The layout appends " | RankbyAI".
    title: "BrightLocal vs Whitespark: Prices Checked 24 Nov 2026",
    description: "BrightLocal sells one suite from $41/mo; Whitespark sells each tool separately, grids from $10/mo. Prices from both vendors' pages, dated, plus AI answers.",
    h1: "BrightLocal vs Whitespark: suite or separate tools?",
    answer:
      "BrightLocal vs Whitespark comes down to how you want to buy. BrightLocal is one suite (tracking, grids, citations, reviews, an AI visibility tracker) from $41 a month for one location. Whitespark sells each tool separately: map grids from $10 a month, rank tracking from $14 a month billed yearly. Prices were checked on both vendors' sites on 24 November 2026.",
    entity: (maker) =>
      `RankbyAI (rankbyai.live) is pay-once AI visibility and local SEO software${maker ? ` made by ${maker}` : ""}. It is not affiliated with BrightLocal or Whitespark. BrightLocal (brightlocal.com) is a UK-based local SEO platform sold as plans; Whitespark (whitespark.ca) is a Canadian local SEO company, founded in 2005 in Edmonton, that sells its software and services individually.`,
    ctaNote: "Enter one business and its city: three AI assistants say who they recommend at its address, next to its Google Maps rank. No sign-up, no card.",
    schemaType: "WebPage",
    og: {
      columns: [{ name: "BrightLocal", line: "One suite from $41/mo" }, { name: "Whitespark", line: "Tools from $10/mo" }],
      footer: "Prices checked 24 Nov 2026 · rankbyai.live/brightlocal-vs-whitespark",
    },
    factTable: BRIGHTLOCAL_VS_WHITESPARK,
    sections: [
      { h2: "Which is cheaper, BrightLocal or Whitespark?", body: [
        "Whitespark vs BrightLocal on price depends on how many jobs you need done. Two worked examples for one client at one location, using only the prices listed on the vendors' own pages on 24 November 2026:",
        { list: [
          "Grids only. Whitespark's Local Ranking Grids cost $10 a month for 2,000 credits. One credit scans one grid point, so that is 80 scans of a 5×5 grid a month (our arithmetic: 2,000 ÷ 25). BrightLocal Track for one location costs $41 a month, or $369 billed yearly, and includes its Local Search Grid for up to five keywords along with rank tracking, citation monitoring and the AI tracker. If grids are all you need and 80 scans of a 5×5 grid a month cover it, Whitespark costs less: $10 against $41 a month.",
          "Grids, rank tracking and citations. Whitespark: Local Ranking Grids $10 a month, Local Rank Tracker from $14 a month billed yearly ($17 billed monthly) and Local Citation Finder from $33 a month billed yearly ($39 billed monthly). That adds up to $57 a month with the two tools billed yearly, or $66 billed monthly. BrightLocal Track for one location includes rank tracking, a grid and citation monitoring for $41 a month. On these list prices, BrightLocal Track costs less.",
        ] },
        { p: [
          "Both examples assume the smallest plan of each product covers your volume (Whitespark's smallest rank tracker plan has 100 location keywords; BrightLocal Track tracks up to 100 keywords and five grid keywords) and that the tools are close enough for your work, so check what each covers on its own page. For more locations, see ",
          { text: "BrightLocal's full price table", href: "/blog/brightlocal-pricing" },
          ".",
        ] },
      ] },
      { h2: "What does Whitespark cost?", body: [
        "Whitespark sells each product separately. As listed on whitespark.ca/pricing on 24 November 2026:",
        { list: [
          "Local Platform (Google Business Profile management): $1 a month per location.",
          "Local Ranking Grids: from $10 a month for 2,000 credits; enterprise pricing available.",
          "Local Rank Tracker: $14 to $200 a month (from $14 billed yearly, $17 billed monthly).",
          "Local Citation Finder: $33 to $149 a month (from $33 billed yearly, $39 billed monthly).",
          "Reputation Builder (getting and managing reviews): $79 a month per location.",
          "SEO Services: $499 to $1,999 a month.",
          "Listings Service (citation building and listing cleanup): $20 to $999, one-time.",
          "Yext Replacement Service: $399 per location, one-time.",
        ] },
        "Unused grid credits expire at the end of each billing period, so pick the plan that matches the scans you run.",
      ] },
      { h2: "When is BrightLocal the better fit?", body: [
        { list: [
          "You want one bill you can budget: one plan for a band of locations, monthly or yearly (BrightLocal says yearly billing saves 25%).",
          "You want citations, reviews, rank tracking and an AI visibility tracker in one place.",
          "You manage many locations: BrightLocal's bands run up to 100 locations on one plan; above that the price is on request.",
        ] },
        { p: [
          "For other ways to cover the same work, see ",
          { text: "BrightLocal alternatives", href: "/alternatives/brightlocal" },
          ". Local Falcon, a specialist grid tracker, is compared with BrightLocal in ",
          { text: "Local Falcon vs BrightLocal", href: "/local-falcon-vs-brightlocal" },
          ".",
        ] },
      ] },
      { h2: "When is Whitespark the better fit?", body: [
        { list: [
          "You need one job done, such as map grids or citations, and do not want to pay for a suite.",
          "You want to pay per grid point: one credit per point scanned, on grids up to 225 points.",
          "You want a stand-alone local rank tracker (Google and Bing local packs, maps and organic results) without paying for a suite.",
          "You want Google Business Profile management for $1 a month per location.",
        ] },
        { p: [
          "Whitespark publishes its own view of the two vendors in ",
          { text: "Whitespark's own comparison", href: WS.vsBrightlocal },
          "; we have not reviewed that page.",
        ] },
      ] },
      { h2: "Do BrightLocal or Whitespark track ChatGPT and AI answers?", body: [
        "BrightLocal does. Its Local AI Visibility Tracker comes with every plan and checks ChatGPT, Google AI Overviews and Google AI Mode per location: every question it runs is “anchored to a specific location”.",
        "For Whitespark, we found no mention of ChatGPT, Perplexity, Gemini, AI Overviews or AI visibility on the five Whitespark pages we read on 24 November 2026 (pricing, Local Ranking Grids, Local Rank Tracker, Local Citation Finder and the home page). That does not prove it has nothing. Its grids do offer an MCP connection, so your own AI tools can read your grid data.",
        { p: [
          "Per location and per grid point are different measurements. A per-location check asks from one place. A grid asks the same question from many points around the business, the way a Maps grid does, so you see where an assistant names the business and where it does not. ",
          VARY,
          " More in our guide to the ",
          { text: "AI visibility tracker", href: "/ai-visibility-tracker" },
          ".",
        ] },
      ] },
      { h2: "Where does RankbyAI fit?", body: [
        `We make RankbyAI, so read this with that in mind. Use it if your question is what AI assistants say at each point around a client, next to the Google Maps rank on the same points: it asks ChatGPT, Perplexity and Gemini on 1×1, 3×3 or 5×5 grids, beside a Maps grid from ${MAPS_GRID_RANGE}. You pay once while the lifetime deal is open, and scans run on your own API keys.`,
        { p: [
          "Do not use it for citations, review requests or Google Business Profile management: it does none of those, so use BrightLocal or Whitespark for that work. How the Maps side works is in our ",
          { text: "map rank tracker", href: "/map-rank-tracker" },
          " guide, and the live price is on our ",
          { text: "pricing page", href: "/pricing" },
          ".",
        ] },
      ] },
    ],
    faqs: [
      { q: "Is Whitespark cheaper than BrightLocal?", a: "For one job, usually yes. On 24 November 2026 Whitespark's map grids started at $10 a month and its rank tracker at $14 a month (billed yearly), while BrightLocal Track for one location was $41 a month. If you need citations, reviews and tracking together, add up the Whitespark products you would buy and compare." },
      { q: "Does Whitespark have a free trial?", a: "Its Local Rank Tracker has a 14-day free trial, and Local Ranking Grids start with 200 free credits without a card (whitespark.ca, 24 November 2026)." },
      { q: "Does BrightLocal track AI visibility?", a: "Yes. BrightLocal's pricing page lists the Local AI Visibility Tracker in its Track plan, and it tracks AI answers per location." },
      { q: "Does Whitespark track ChatGPT or AI Overviews?", a: "We found no mention on the Whitespark pages we read on 24 November 2026. Whitespark does offer an MCP connection so your own AI tools can read your grid data." },
      { q: "What is a Whitespark credit?", a: "In Local Ranking Grids, one credit scans one grid point, so a 5×5 grid uses 25 credits. The $10 plan includes 2,000 credits a month." },
      { q: "Can I use RankbyAI instead of both?", a: "Only for measuring. RankbyAI shows AI answers and Maps rank on the same grid and audits the business, but it does not build citations, request reviews or manage Google Business Profiles." },
    ],
    related: ["/local-falcon-vs-brightlocal", "/blog/brightlocal-pricing", "/alternatives/brightlocal", "/map-rank-tracker", "/ai-visibility-tracker", "/pricing"],
    updated: "2026-11-24",
  },
  {
    path: "/peec-ai-vs-profound", group: "root", slug: "peec-ai-vs-profound", eyebrow: "Comparison",
    title: "Peec AI vs Profound (and a Local Option)",
    description: "Peec AI vs Profound: published self-serve plans against custom enterprise contracts, engines, API and MCP. Plus where a local map-grid tool is a different choice.",
    h1: "Peec AI vs Profound: which fits your team?",
    answer:
      "Peec AI vs Profound (or Profound vs Peec AI) comes down to scale and buying style. Peec AI publishes self-serve plans sized by prompts and models; Profound sells custom enterprise contracts covering up to ten answer engines. Both track how AI assistants mention a brand. If the businesses you track are local, a different kind of tool measures answers at points on a map; RankbyAI is one, shown alongside.",
    table: { caption: "Peec AI, Profound and a local option", columns: ["peec", "profound", "rankbyai"], rows: ["pay", "price", "engines", "aiGrid", "api", "reports"] },
    sections: [
      { h2: "How do Peec AI and Profound differ?", body: [
        { list: [
          "Price: Peec AI publishes plans from $95 a month; Profound lists only “Custom” prices and retired its published plans in September 2026 (both as read on their pricing pages on 20 November 2026).",
          "Engines: Peec AI lets each plan choose three models from a list that includes ChatGPT, Perplexity, AI Overviews, AI Mode and Gemini; Profound covers up to ten answer engines, including Claude and DeepSeek.",
          "API and MCP: Peec AI lists MCP on every plan and an API in its paid tiers (its page is not consistent on which); Profound includes an API and offers MCP to Enterprise customers.",
          "Getting started: Peec AI offers a free trial; Profound starts with a demo.",
        ] },
      ] },
      { h2: "Which should you choose?", body: [
        "If you want to start this week, on a card, and track a set of prompts across a few models, Peec AI's published plans make that simple. If you need broad engine coverage, compliance and a contract shaped around a large brand, Profound is built for that buying process.",
      ] },
      { h2: "Where does a local tool fit?", body: [
        "Neither describes checking answers at points on a map around a business. If your clients are local businesses, the question is often “who does ChatGPT recommend on this street?”. RankbyAI measures that, next to the Google Maps rank, for a one-time payment. It is a different tool, not a drop-in replacement for either.",
      ] },
    ],
    faqs: [
      { q: "Is Peec AI cheaper than Profound?", a: "Peec AI publishes its prices; Profound does not. A fair comparison needs a quote from Profound for the same prompts, engines and countries." },
      { q: "Do Peec AI or Profound track Google Maps?", a: "On the pages we read on 20 November 2026 we found no mention of Google Maps rank tracking or map-grid checks in either." },
      { q: "Why is RankbyAI in this comparison?", a: "Because we make it, and some readers comparing these two track local businesses. It is shown as a different kind of tool, not as a replacement." },
    ],
    related: ["/alternatives/peec-ai", "/alternatives/profound", "/blog/peec-ai-pricing", "/blog/profound-pricing"],
    updated: UPDATED,
  },
  {
    path: "/semrush-ai-visibility", group: "root", slug: "semrush-ai-visibility", eyebrow: "Explainer",
    title: "Semrush AI Visibility: What It Measures, and the Local Gap",
    description: "What Semrush's AI visibility products include and cost, as published on Semrush's own pages, and what a local map grid adds for local businesses.",
    h1: "Semrush AI visibility: what the toolkit measures, and what a local grid adds",
    answer:
      "Semrush AI visibility tracking is sold as the AI Visibility Toolkit and inside Semrush's SEO + AI Search plans. On 20 November 2026 the toolkit's Base plan was listed at $99 a month per domain, billed yearly, for 25 prompts tracked daily across ChatGPT, Google AI, Gemini and Perplexity. It measures how AI answers mention a brand. RankbyAI measures something narrower: who AI assistants recommend at each point of a map around a local business.",
    table: { caption: "Semrush and RankbyAI side by side", columns: ["semrushai", "semrush", "rankbyai"], rows: ["pay", "price", "engines", "aiGrid", "mapsGrid", "api", "reports"] },
    sections: [
      { h2: "What does Semrush sell for AI visibility?", body: [
        { list: [
          "AI Visibility Toolkit: Base at $99 a month per domain billed yearly, with 25 custom prompts tracked daily and mentions from ChatGPT, Google AI, Gemini and Perplexity. A Pro Report add-on ($20 a month) adds branding and white-labelling.",
          "SEO + AI Search plans: Starter at $165.17 a month billed yearly ($199 billed monthly) with 50 prompts and MCP access; Pro+ at $248.17 yearly ($299 monthly) with 100 prompts; Advanced on request. A free plan lists AI visibility features, and there is a 7-day trial.",
          "Enterprise AI Optimization (AIO): custom pricing, with detail by brand, market, city and product.",
        ] },
        "Figures as read on Semrush's pricing pages on 20 November 2026, in US dollars. Semrush changes plans and regional prices, so check its site before you buy.",
      ] },
      { h2: "What does a local grid add?", body: [
        "Semrush's Local SEO page says it can show how AI assistants describe a business for questions in its local area, and its Map Rank Tracker draws Google Maps rankings as a heatmap. What we did not find on its pages is the AI answer checked at each point of a grid around a business. That is what RankbyAI does: the same question at every point, three assistants, and the Google Maps rank at the same points.",
        "For the Maps side of Semrush, see our page on Semrush Map Rank Tracker.",
      ] },
      { h2: "When is Semrush the right choice?", body: [
        "When your team already works in Semrush and wants AI visibility next to keyword research, site audits and the rest of its data. One login and one bill are worth a lot.",
        "RankbyAI is not a Semrush replacement: it has no keyword research, backlink data or site audit. It is a focused local tool you pay for once.",
      ] },
    ],
    faqs: [
      { q: "Does Semrush track AI visibility for local businesses?", a: "Semrush's Local SEO page mentions seeing how AI assistants describe a business for local questions, and Enterprise AIO reports by city. We found no description of checking answers at points on a map around a business (read 20 November 2026)." },
      { q: "Is there a free Semrush AI visibility tool?", a: "Semrush's free plan lists “AI Visibility features”; its limits were not stated on the page we read. Paid AI visibility starts with the toolkit's Base plan." },
      { q: "Is RankbyAI an alternative to Semrush?", a: "Not as a suite. RankbyAI measures local AI recommendations and Google Maps ranks on a grid, with audits and reports. If you need Semrush's research and audit tools, keep Semrush." },
    ],
    related: ["/blog/semrush-map-rank-tracker", "/ai-visibility-tracker", "/alternatives/peec-ai", "/pricing"],
    updated: UPDATED,
  },

  // ───────────────────────── blog ─────────────────────────
  {
    path: "/blog/semrush-map-rank-tracker", group: "blog", slug: "semrush-map-rank-tracker", eyebrow: "Explainer",
    title: "Semrush Map Rank Tracker: What It Does and Doesn't",
    description: "What Semrush Map Rank Tracker measures, what it costs as published by Semrush, how a map grid differs from an AI recommendation grid, and when you need each.",
    h1: "Semrush Map Rank Tracker: what it does, and what a map grid cannot tell you",
    answer:
      "Semrush Map Rank Tracker shows where a business ranks on Google Maps for a keyword at points across an area, drawn as a heatmap. It answers “where do we appear on the map?”. It does not answer “who do AI assistants recommend here?”, which is a separate measurement with its own grid.",
    showSampleGrid: true,
    table: { caption: "Semrush Map Rank Tracker and RankbyAI side by side", columns: ["semrush", "rankbyai"], rows: ["pay", "price", "mapsGrid", "aiGrid", "api", "reports"] },
    sections: [
      { h2: "What does a map rank tracker measure?", body: [
        "It looks up a keyword on Google Maps from many points around a business and records the business's position at each point. The result is a grid, usually coloured green where the business is in the top three and red where it is far down or absent. It is the standard way to show that local rankings depend on distance.",
      ] },
      { h2: "What does it cost?", body: [
        "On 20 November 2026, Semrush's Local pricing page listed Map Rank Tracker inside its Local toolkit: Base at $30 a month per location billed yearly, with 375 Map Rank Tracker credits, and Pro at $60 with 1,225 credits; a Business plan is on request. Check Semrush's site for the current price and your currency.",
      ] },
      { h2: "How is that different from an AI grid?", body: [
        "A map grid reads a ranked list. An AI grid reads an answer. When someone asks an assistant for the best dentist nearby, the assistant names a few businesses and often cites the sources it relied on. A business can be first on Maps at a point and still not be named there, and the reverse happens too.",
        "The two grids are different measurements. Looked at together, on the same points, they show where the gap is. RankbyAI runs both on one grid.",
      ] },
      { h2: "When is the Semrush module the right choice?", body: [
        "When your team already lives in Semrush and wants map ranks next to the rest of its SEO data. One login, one bill and one report format are worth a lot.",
        "It is less suited if you only need grids and do not otherwise use the platform, or if AI recommendations are what your clients ask about.",
      ] },
    ],
    faqs: [
      { q: "How much does Semrush Map Rank Tracker cost?", a: "On 20 November 2026 Semrush listed it in the Local toolkit from $30 a month per location, billed yearly, with 375 credits. Semrush changes plans and regional prices, so check the Semrush site before you buy." },
      { q: "Does Semrush Map Rank Tracker show AI visibility?", a: "Map Rank Tracker measures Google Maps positions. Semrush sells AI visibility separately, as the AI Visibility Toolkit and in its SEO + AI Search plans; see our page on Semrush AI visibility." },
      { q: "Is a geo grid the same as a map rank tracker?", a: "Yes, in practice. “Geo grid”, “geogrid” and “map rank tracker” all describe looking up a keyword on a map from a grid of points around a business." },
    ],
    related: ["/semrush-ai-visibility", "/map-rank-tracker", "/local-falcon-vs-brightlocal", "/pricing"],
    updated: UPDATED, published: FIRST,
  },
  {
    path: "/blog/local-falcon-pricing", group: "blog", slug: "local-falcon-pricing", eyebrow: "Pricing explained",
    title: "Local Falcon Pricing: What We Verified, and How to Compare",
    description: "Local Falcon's plans, prices and credits as listed on its public pricing page, with the date, and a fair way to compare credit plans with a one-time payment plus API costs.",
    h1: "Local Falcon pricing, and how to compare it fairly",
    answer:
      "Local Falcon pricing is a set of plans that include scan credits, where one credit is one grid point. On 20 November 2026 its pricing page listed Starter at $24.99 a month, Basic at $49.99, Pro at $99.99 and Premium at $199.99, billed monthly or yearly. Below are the plans and credits as listed there, with the date; plans change, so check Local Falcon's page before you buy.",
    table: { caption: "Local Falcon and RankbyAI: verified figures", columns: ["localfalcon", "rankbyai"], rows: ["pay", "price", "aiGrid", "mapsGrid", "api", "reports"] },
    sections: [
      { h2: "What do Local Falcon's plans cost?", body: [
        { list: [
          "Starter: $24.99 a month with 7,500 credits a month, or $299.88 a year with 90,000 credits.",
          "Basic: $49.99 a month with 15,150 credits, or $599.88 a year with 183,000 credits.",
          "Pro: $99.99 a month with 31,250 credits, or $1,199.88 a year with 383,000 credits.",
          "Premium: $199.99 a month with 63,150 credits, or $2,399.88 a year with 778,000 credits.",
          "Enterprise packages start at $499 a month. Extra credits are $0.05 each and do not expire.",
        ] },
        "As listed on localfalcon.com/pricing on 20 November 2026. The same page's FAQ quotes slightly different credit ranges; the list above is from its price table. Unused plan credits expire at the end of each billing cycle.",
      ] },
      { h2: "How do credit plans work?", body: [
        "A credit plan gives you a number of credits per billing cycle, and each scan uses one credit per grid point: a 7×7 grid is 49 credits. AI visibility scans use the same credits. Work out your monthly need as scans × points per scan, then see which plan covers it.",
      ] },
      { h2: "How do you compare credits with paying once?", body: [
        "Put both on a yearly basis for the same work. For a credit plan: the yearly plan price. For RankbyAI: the one-time price (which you pay in year one only) plus what your API vendors charge for the scans.",
        "Our calculator does the second half with published vendor prices and your own number of clients, prompts and grid sizes. The result is an estimate; your actual vendor bills are shown per scan inside the app.",
      ] },
      { h2: "What does the cheaper option cost you elsewhere?", body: [
        "Local Falcon includes the data, supports Apple Maps and covers AI Overviews and Grok. RankbyAI needs your own API keys and covers Google Maps and three AI engines. Price is one line of the comparison, not the whole of it.",
      ] },
    ],
    faqs: [
      { q: "How much is Local Falcon per month?", a: "From $24.99 a month for Starter, as listed on its pricing page on 20 November 2026; Basic is $49.99, Pro $99.99 and Premium $199.99. Check Local Falcon's pricing page for current prices." },
      { q: "What does Local Falcon cost per year?", a: "Yearly billing listed $299.88 for Starter (90,000 credits), up to $2,399.88 for Premium (778,000 credits), on 20 November 2026." },
      { q: "Does Local Falcon have a lifetime deal?", a: "We have not seen one on its pricing page. Local Falcon is sold as plans with credits. RankbyAI is sold as a one-time payment while its lifetime deal is open." },
      { q: "Does Local Falcon have a free trial?", a: "Its pricing page offers 100 free credits on sign-up, with no credit card needed." },
    ],
    related: ["/alternatives/local-falcon", "/local-falcon-vs-brightlocal", "/blog/brightlocal-pricing", "/pricing"],
    updated: UPDATED, published: FIRST,
  },
  {
    path: "/blog/brightlocal-pricing", group: "blog", slug: "brightlocal-pricing", eyebrow: "Pricing explained",
    title: "BrightLocal Pricing: Plans We Verified, and How to Compare",
    description: "BrightLocal's plans and prices by number of locations, as listed on its pricing page with the date, and how a monthly suite compares with paying once plus API costs.",
    h1: "BrightLocal pricing, and how to compare it fairly",
    answer:
      "BrightLocal pricing is set by plan (Track, Manage or Grow) and by the number of locations, billed monthly or yearly. On 20 November 2026 its pricing page listed Track for one location at $41 a month, or $369 billed yearly. This page lists the figures we read there, with the date, and a fair way to compare a monthly suite with paying once.",
    table: { caption: "BrightLocal and RankbyAI: verified figures", columns: ["brightlocal", "rankbyai"], rows: ["pay", "price", "aiGrid", "mapsGrid", "api", "reports", "citations"] },
    sections: [
      { h2: "What do BrightLocal's plans cost?", body: [
        { list: [
          "1 location: Track $41 a month or $369 a year; Manage $54 or $485; Grow $65 or $584.",
          "2–5 locations: Track $62 or $558; Manage $76 or $683; Grow $87 or $782.",
          "6–10 locations: Track $83 or $747; Manage $109 or $980; Grow $131 or $1,178.",
          "11–20 locations: Track $104 or $936; Manage $153 or $1,376; Grow $197 or $1,772.",
          "Larger bands continue up to 100 locations; above 100 the price is on request.",
        ] },
        "Monthly price or yearly total, in US dollars, as listed on brightlocal.com/pricing on 20 November 2026. The page says yearly billing saves 25%. Its search description still says prices start from $39 a month; the table shows the figures above.",
      ] },
      { h2: "What does each plan include?", body: [
        { list: [
          "Track: local rank tracking for up to 100 keywords and four competitors, the Local Search Grid for up to five keywords, the Local AI Visibility Tracker and white-label reports.",
          "Manage: adds AI Insights, the other APIs and Active Sync for business data on key sites.",
          "Grow: adds review tools (monitor, get and showcase reviews), the MCP server and the AI Insights API.",
          "Citation Builder is pay-as-you-go on every plan. There is a 14-day free trial without a card.",
        ] },
      ] },
      { h2: "How do you compare a monthly suite with paying once?", body: [
        "Compare the shape of the cost, not one month. A BrightLocal plan is the same price every month or year, and it includes the data and the listings and review tools. RankbyAI is one payment while the lifetime deal is open, plus what your API vendors charge for the scans you run; year two costs only the scans.",
        "Our pricing page has a calculator that estimates the scan costs for your own number of clients and prompts. It does not estimate the citation and review work a suite also covers.",
        { p: ["If you would rather buy single tools than a suite, compare BrightLocal's plans with ", { text: "Whitespark's per-tool prices", href: "/brightlocal-vs-whitespark" }, "."] },
      ] },
      { h2: "What does the price not show?", body: [
        "BrightLocal manages citations, listings and reviews; RankbyAI does not. RankbyAI asks at every point of a grid, next to the Maps rank; BrightLocal's AI tracker works per location. Weigh the work you do, not only the price.",
      ] },
    ],
    faqs: [
      { q: "How much is BrightLocal per month?", a: "From $41 a month for Track with one location, or $369 a year, as listed on its pricing page on 20 November 2026. The price rises with plan and number of locations." },
      { q: "Is BrightLocal's AI visibility tracker included?", a: "Yes. BrightLocal says its Local AI Visibility Tracker comes as standard in Track, Manage and Grow, with up to 20 prompts per location." },
      { q: "Does BrightLocal have a free trial?", a: "Yes. Its pricing page offers 14 days of full access, and no credit card is required." },
      { q: "What does BrightLocal cost for many locations?", a: "On 20 November 2026, Track for 91–100 locations was $524 a month or $4,716 a year; above 100 locations the price is on request." },
    ],
    related: ["/alternatives/brightlocal", "/local-falcon-vs-brightlocal", "/blog/local-falcon-pricing", "/pricing"],
    updated: "2026-11-24",
  },
  {
    path: "/blog/peec-ai-pricing", group: "blog", slug: "peec-ai-pricing", eyebrow: "Pricing explained",
    title: "Peec AI Pricing: Plans, Prompts and What They Cover",
    description: "Peec AI's brand and agency plans as listed on its pricing pages, with the date: prompts, models, projects, API and MCP, and how to compare them with a local tool.",
    h1: "Peec AI pricing: what each plan includes",
    answer:
      "Peec AI pricing is a monthly subscription sized by prompts and AI models. On 20 November 2026 its pricing page listed Starter at $95 a month (50 prompts, 3 models), Pro at $245 and Advanced at $495, with Enterprise on custom annual terms and a 15% discount for yearly billing. Agencies have separate credit-based plans. The figures below are as read on Peec AI's pages; check them before you buy.",
    table: { caption: "Peec AI and RankbyAI: verified figures", columns: ["peec", "rankbyai"], rows: ["pay", "price", "engines", "aiGrid", "api"] },
    sections: [
      { h2: "What do the brand plans include?", body: [
        { list: [
          "Starter, $95 a month: 50 prompts, 3 models of your choice, 1 country, 1 project, daily tracking.",
          "Pro, $245 a month: 150 prompts, 3 models, 3 countries, 2 projects.",
          "Advanced, $495 a month: 350 prompts, 3 models, 3 countries, 5 projects, Looker Studio integration.",
          "Enterprise, custom and annual: unlimited prompts and projects, API access, SSO, and more models.",
        ] },
        "Every plan has unlimited users and the MCP server. The comparison table shows the API from Pro, while the Enterprise card lists API access as an addition; ask Peec AI if the API matters to you.",
      ] },
      { h2: "What do the agency plans cost?", body: [
        { list: [
          "Essential: $245 a month billed monthly or $205 billed yearly, for 10,000 credits and 3 client projects.",
          "Growth: $495 monthly or $420 yearly, for 25,000 credits and 10 projects.",
          "Scale: $795 monthly or $675 yearly, for 65,000 credits and 25 projects.",
        ] },
        "One credit is one prompt on one model for one day. The agency page also lists euro prices for Europe, shareable client dashboards and free pitch projects for prospects.",
      ] },
      { h2: "How do you compare it with a local tool?", body: [
        "Peec AI charges for prompts × models × days, every month. A local grid tool like RankbyAI charges for the software once and for the scans you run, at your API vendors' prices. They measure different things: Peec AI tracks how AI search mentions a brand; RankbyAI asks who is recommended at points on a map around a local business.",
      ] },
    ],
    faqs: [
      { q: "Does Peec AI have a free trial?", a: "Yes, its pages offer a free trial; the length was not stated on the pages we read on 20 November 2026." },
      { q: "Is Peec AI priced in euros?", a: "Its agency page lists euro prices for Europe. The brand plans were shown to us in US dollars, also from a European address." },
      { q: "What is the Peec AI price per prompt?", a: "We do not calculate one: plans bundle prompts with models, countries and projects, and yearly billing changes the total. Compare a plan that covers your prompts and models." },
    ],
    related: ["/alternatives/peec-ai", "/peec-ai-vs-profound", "/blog/profound-pricing", "/blog/otterly-pricing"],
    updated: UPDATED,
  },
  {
    path: "/blog/profound-pricing", group: "blog", slug: "profound-pricing", eyebrow: "Pricing explained",
    title: "Profound Pricing: What Is Published, and What Is Not",
    description: "Profound's pricing as published on its own page: custom Enterprise and Agency plans, retired Starter and Growth plans, and what Enterprise includes.",
    h1: "Profound pricing: what is published, and what is not",
    answer:
      "Profound pricing is not published for new customers. On 20 November 2026 its pricing page listed one plan for brands, Enterprise, and one for agencies, Agency Enterprise, both at a “Custom” price. The same page says Profound retired its Starter and Growth plans in September 2026, so older figures quoted elsewhere no longer apply to new subscriptions.",
    table: { caption: "Profound and RankbyAI: what is published", columns: ["profound", "rankbyai"], rows: ["pay", "price", "engines", "aiGrid", "api"] },
    sections: [
      { h2: "What does Profound Enterprise include?", body: [
        { list: [
          "A tailored prompt tracking plan with daily frequency and unlimited seats.",
          "Up to ten answer engines: ChatGPT, Perplexity, Google AI Mode, Gemini, DeepSeek, Claude, Google AI Overviews, Exa Search, Muse Spark and Qwen.",
          "Custom regions, an API with CSV and JSON exports, SSO/SAML and SOC 2.",
          "The Profound MCP server, available to Enterprise customers.",
        ] },
      ] },
      { h2: "How do you get a price?", body: [
        "Through Profound's sales team: every call to action on its pricing page leads to a demo. Agencies get a separate Agency Enterprise plan with client workspaces.",
      ] },
      { h2: "How does that compare with a tool you pay once for?", body: [
        "They are different products. Profound is an enterprise platform for brand visibility across many engines. RankbyAI is a local tool: it asks three assistants at points on a map around a business, next to its Google Maps rank, with a published one-time price and scans at your API vendors' prices.",
      ] },
    ],
    faqs: [
      { q: "How much does Profound cost per month?", a: "Profound does not publish a price for new customers; its plans are listed as “Custom” (pricing page, 20 November 2026)." },
      { q: "What happened to Profound's $399 plan?", a: "Its pricing FAQ says Profound retired its Starter and Growth plans for brands in September 2026, and that the $399 and $499 prices are no longer available for new subscriptions." },
      { q: "Does Profound have a free trial?", a: "We found no mention of a free trial or free plan on its pricing pages; they lead to a demo." },
    ],
    related: ["/alternatives/profound", "/peec-ai-vs-profound", "/blog/peec-ai-pricing", "/pricing"],
    updated: UPDATED,
  },
  {
    path: "/blog/otterly-pricing", group: "blog", slug: "otterly-pricing", eyebrow: "Pricing explained",
    title: "Otterly Pricing: Plans, Credits and How to Compare",
    description: "Otterly.AI's plans and credits as listed on its pricing page, with the date and what the page leaves unclear, and how to compare it with a local map-grid tool.",
    h1: "Otterly pricing: plans, credits and how to compare",
    answer:
      "Otterly pricing is a subscription sized in credits, where one credit is one prompt checked once on one AI engine. On 20 November 2026 its pricing page showed Lite at $29, Standard at $189 and Premium at $489 a month, with a 15% saving on yearly billing; the page did not say which billing option those figures reflect. Prices are in USD or EUR, excluding tax.",
    table: { caption: "Otterly.AI and RankbyAI: verified figures", columns: ["otterly", "rankbyai"], rows: ["pay", "price", "engines", "aiGrid", "api"] },
    sections: [
      { h2: "What does each plan include?", body: [
        { list: [
          "Lite ($29): 20 prompts (2,000 credits a month), 3 of 7 AI engines, daily checks, 1 workspace; no API or MCP.",
          "Standard ($189): 160 prompts (15,000 credits), unlimited workspaces, 2,000 API and 2,000 MCP requests a month, a Data Studio connector.",
          "Premium ($489): 535 prompts (50,000 credits), daily or weekly checks, 5,000 API and 5,000 MCP requests a month.",
          "Enterprise: custom, starting from 1,000 prompts, with SSO.",
        ] },
        "Every plan has unlimited brands, competitors, countries and team members, and a 7-day free trial without a card.",
      ] },
      { h2: "How do credits work?", body: [
        "Otterly says a prompt tracked daily on one engine uses 31 credits a month, and each Claude answer counts as 3 credits. So the number of prompts a plan covers depends on how many engines you track and how often. Check the prompt count for your own engine choice before you pick a plan.",
      ] },
      { h2: "How do you compare it with a local tool?", body: [
        "Otterly monitors how AI search mentions a brand, by country. RankbyAI asks three assistants at points on a map around a local business, next to its Google Maps rank, for a one-time payment plus scans at your API vendors' prices. If your clients are local businesses, compare the question each tool answers before the price.",
      ] },
    ],
    faqs: [
      { q: "Does Otterly have a free trial?", a: "Yes: a 7-day free trial for new users, with no credit card needed, according to its site (20 November 2026)." },
      { q: "Are Otterly's prices monthly or yearly?", a: "The pricing page has a monthly and a yearly (−15%) option but did not say which one the displayed prices reflect when we read it. Check the toggle on Otterly's page." },
      { q: "Does Otterly track Google Maps rankings?", a: "We found no mention of Google Maps or map-grid tracking on its pricing page or homepage." },
    ],
    related: ["/alternatives/otterly", "/blog/peec-ai-pricing", "/ai-visibility-tracker", "/pricing"],
    updated: UPDATED,
  },
  {
    path: "/blog/how-to-show-up-in-chatgpt", group: "blog", slug: "how-to-show-up-in-chatgpt", eyebrow: "Checklist",
    title: "How to Rank in ChatGPT as a Local Business",
    description: "How a local business gets named in ChatGPT answers: the crawler ChatGPT search needs, which profiles and sources to fix, and how to check from your own service area.",
    h1: "How to show up and rank in ChatGPT as a local business",
    socialTitle: "How to Rank in ChatGPT as a Local Business | RankbyAI",
    ctaLabel: "Run a free check → see who ChatGPT, Perplexity and Gemini name at your address",
    resultPreview: { src: "/guides/chatgpt-free-check-example.png", alt: "Example free-check result for fictional Northgate Family Dental in Austin, showing AI mentions and Google Maps rank at one location.", width: 1200, height: 839, caption: "Example data · one location. The business, names and results are fictional. Perplexity returned no answer in this example; ChatGPT and Gemini responded." },
    answer:
      "To rank in ChatGPT as a local business, make sure ChatGPT’s search crawler (OAI-SearchBot) can read your site, keep your name, address and phone identical everywhere, complete your Google and Bing profiles, earn reviews that mention your service and area, and get listed on the sources ChatGPT cites for your town. There is no fixed position and no guarantee, so check from your own service area whether you are named.",
    sections: [
      { h2: "Is there a ranking in ChatGPT?", body: [
        "ChatGPT writes an answer rather than a stable list of ten search positions. Getting your business on ChatGPT means being included in a relevant answer; there is no business listing you can claim inside ChatGPT.",
        "Being named means your business appears in the text. Being cited means an answer links to a source, which may be your website or a third-party page. Being recommended first describes the order in that particular answer; a citation alone is not a recommendation.",
        "The same question can produce different names between runs and locations. In this guide, rank means how often and where you are named. AI answers vary between runs, places and time, so a grid is a set of observations on the date it was run, not a fixed ranking.",
      ] },
      { h2: "What should you fix first?", body: [
        { list: [
          "Claim and complete your Google Business Profile and Bing Places listing. Pick the primary category that truly describes the business, fill in hours, services and a factual description.",
          "Use one name, address and phone number everywhere: profile, website header and footer, schema markup and directories. Inconsistent details make it harder to treat them as the same business.",
          "Ask every customer for a review. Reviews that mention the service and the neighbourhood give assistants words to match.",
        ] },
      ] },
      { h2: "What should your website say?", body: [
        { p: ["To check access and facts together, ", { text: "run a local SEO audit that includes AI answers", href: "/local-seo-audit" }, "."] },
        { list: [
          "State what you do and where in plain HTML text: in the title, the main heading and the first paragraph. Facts that only appear after a script runs are easy to miss.",
          "Give each service its own page, and cover the areas you really serve.",
          "Add LocalBusiness schema with the same name, address and phone as your profile, and an FAQ with matching FAQPage schema.",
        ] },
        { p: ["Allow OAI-SearchBot in robots.txt. ", { text: "OpenAI’s crawler documentation", href: "https://platform.openai.com/docs/bots" }, " says opting out excludes your site from ChatGPT search answers, although navigational links may remain. GPTBot controls crawling for training separately; you can allow search while blocking training. Search systems can take about 24 hours to reflect a robots.txt update."] },
        { code: 'curl -A "OAI-SearchBot" -I https://yoursite.com' },
        "Check the response for your public page: investigate a non-200 status, following redirects to the final URL. A firewall or CDN can block requests even when robots.txt allows them. A 200 response to this user-agent test does not prove that real OpenAI crawler IPs are allowed or that robots.txt permits crawling; check those too.",
      ] },
      { h2: "Where does ChatGPT get its information about local businesses?", id: "where-else-do-you-need-to-be-listed", body: [
        "Start with the sources in an actual answer for your service and town. Completing Google Business Profile and Bing Places keeps your public details consistent; it does not establish that ChatGPT reads either profile directly.",
        { list: [
          "Open a real ChatGPT answer, click each citation and write down the sites it used: directories, review sites, local news or best-of lists. If you are missing from a relevant directory or list, check its listing or editorial process.",
          "If the answer cites a review site where you have few reviews, respond to those reviews and invite genuine customer feedback there. The review source shown can differ from your Google rating. Never buy reviews or filter requests to happy customers.",
          "Correct wrong facts on the page ChatGPT cited, as well as on your own site. Record the cited URL so you can check the same source after the correction.",
        ] },
      ] },
      { h2: "How do you know if ChatGPT sent you a customer?", body: [
        "A mention is visibility evidence, not proof of a new customer. Combine website visits with what customers tell you, and keep a separate record of the answers you observe.",
        { table: {
          caption: "Four ways to measure AI visibility and customer referrals",
          columns: ["Method", "What it shows", "What it misses", "Cost"],
          rows: [
            [["Analytics referrer (chatgpt.com, perplexity.ai, gemini.google.com)"], ["Visits that clicked a link in an answer"], ["People who saw your name and then called or searched you"], ["Free"]],
            [["‘How did you hear about us?’ with an ‘AI assistant (ChatGPT etc.)’ option"], ["What customers say"], ["People who do not remember, or say ‘Google’"], ["Free"]],
            [["Asking the question yourself"], ["Whether you are named, from one place, once"], ["Variation between runs and locations"], ["Free, slow"]],
            [["An AI visibility tracker (e.g. RankbyAI — our tool)"], ["Whether you are named at many points of a grid, stored over time"], ["Real customer clicks and calls"], ["Paid (", { text: "see pricing", href: "/pricing" }, ")"]],
          ],
        } },
        "In your analytics tool, filter referral sources for those assistant domains and check enquiries or bookings from those visits. Referrers can be missing, so also add the AI assistant option to your enquiry form or ask when someone calls.",
        "For a manual visibility log, record the date, assistant, exact question, location, names and citation URLs. Repeat the same questions from the same places; keep that log separate from clicks, calls and bookings.",
      ] },
      { h2: "How do you measure whether you are named?", body: [
        "Ask the question the way a customer would, from the places your customers are, and record the answer. Doing that by hand does not scale, and one answer proves little because answers vary.",
        { p: ["RankbyAI — our tool — asks ChatGPT, Perplexity and Gemini at each point of a map grid and stores every answer, so you can see where you are named and who is named instead. The ", { text: "free check", href: "/#free-check" }, " runs one point without an account and also looks up your Google Maps rank there. Our ", { text: "AI rank tracker guide", href: "/ai-rank-tracker" }, " explains what the position in an answer means."] },
        "API answers can differ from the consumer apps, which can use personal history and settings. Compare the same questions, locations and method over time; a tracker measures observations rather than every customer’s experience.",
        "RankbyAI (rankbyai.live) is an AI visibility and map rank tracker for local businesses and agencies, built by Mees Tierolff.",
      ] },
    ],
    faqs: [
      { q: "Is ranking in ChatGPT the same as ranking on Google?", a: "No. Google Maps and Google search show ranked lists; ChatGPT writes one answer and names a few businesses, and the names change between runs and places. Many of the basics (consistent details, reviews, clear pages) help with both." },
      { q: "Which robots.txt setting matters for ChatGPT search?", a: "OAI-SearchBot. OpenAI says sites that opt out of it are not shown in ChatGPT search answers. GPTBot controls training use and is a separate choice. Changes can take about 24 hours to apply." },
      { q: "How often should I check if ChatGPT names my business?", a: "Monthly is enough for most local businesses; one check proves little because answers vary, so compare the same questions from the same places over time." },
      { q: "How long does it take to show up in ChatGPT?", a: "There is no fixed time and no guarantee. Fix the basics, then measure monthly. Changes to profiles and listings can take weeks to be reflected in the sources assistants use." },
      { q: "Can I pay to be recommended by ChatGPT?", a: "This page is about unpaid answers. We know of no way to buy a place in them, and we would be wary of anyone who claims to sell one." },
      { q: "Does schema markup make ChatGPT recommend me?", a: "Not by itself. Schema states your name, address, phone and services in a form machines read directly, which removes ambiguity. It is one of several basics." },
      { q: "How do I check whether ChatGPT recommends my business?", a: "Run the free check on our home page: it asks ChatGPT, Perplexity and Gemini at the business's own location, without an account, and shows the result right away." },
    ],
    related: ["/ai-rank-tracker", "/ai-visibility-tracker", "/map-rank-tracker", "/pricing"],
    updated: "2026-11-26", published: FIRST,
  },
];

export const seoPage = (path: string) => SEO_PAGES.find((p) => p.path === path) ?? null;
export const seoPagesIn = (group: SeoPage["group"]) => SEO_PAGES.filter((p) => p.group === group);
