/**
 * Content for the search pages (brief 19.1). One registry feeds the pages, the sitemap and llms.txt.
 *
 * Rules these pages keep:
 *  - Competitor prices come only from COMPETITORS in pricing-constants.ts and are shown with their date.
 *    Where we hold no verified figure, the page says so and points at the vendor's own pricing page.
 *  - We never claim to be first or only: Local Falcon and BrightLocal already offer AI visibility grids.
 *  - Each page says what the other tool does well.
 *  - No rankings or results are promised.
 */
export type CompareColumn = "rankbyai" | "localfalcon" | "brightlocal" | "semrush";
export type Block = string | { list: string[] };

export interface SeoPage {
  path: string;
  group: "root" | "alternatives" | "blog";
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  h1: string;
  /** Answer-first opening: the direct answer to the search, in two or three sentences. */
  answer: string;
  showSampleGrid?: boolean;
  table?: { caption: string; columns: CompareColumn[] };
  sections: { h2: string; body: Block[] }[];
  faqs: { q: string; a: string }[];
  related: string[];
  updated: string;
}

const UPDATED = "2026-11-17";
const VARY = "AI answers vary between runs, places and time, so a grid is a set of observations on the date it was run, not a fixed ranking.";

export const SEO_PAGES: SeoPage[] = [
  {
    path: "/alternatives/local-falcon", group: "alternatives", slug: "local-falcon", eyebrow: "Alternatives",
    title: "Local Falcon Alternative You Pay For Once",
    description: "An honest comparison of Local Falcon and RankbyAI: what Local Falcon does well, and where a pay-once tool with scans at cost on your own API keys fits better.",
    h1: "A Local Falcon alternative you pay for once",
    answer:
      "RankbyAI is an alternative to Local Falcon for agencies that want Google Maps grids and AI recommendation grids without a monthly plan. You pay once for the software, then run scans at cost on your own API keys or from a pack of included scans. Local Falcon is the more mature grid tracker; RankbyAI is built around paying once, bulk prospect reports and an API with an MCP server.",
    showSampleGrid: true,
    table: { caption: "Local Falcon and RankbyAI side by side", columns: ["rankbyai", "localfalcon"] },
    sections: [
      { h2: "What does Local Falcon do well?", body: [
        "Local Falcon has been building map grids for years and it shows. Its grids are mature, it supports Apple Maps as well as Google Maps, and it already has an AI visibility module. If you want one established tracker with a credit system you already know, it is a sound choice.",
        "We are not the first tool to show AI recommendations on a grid, and we do not claim to be. Local Falcon and BrightLocal both offer that today.",
      ] },
      { h2: "What is different about RankbyAI?", body: [
        { list: [
          "You pay once. The lifetime price follows a public sales counter: it starts low and rises a fixed step after every few sales. There is no subscription to cancel.",
          "Scans run at cost. With your own DataForSEO, OpenAI, Perplexity and Gemini keys, your vendors bill you directly at their rates and we add nothing. You see an estimate before every scan and the actual cost after it.",
          "AI and Maps on the same grid. Each point shows who ChatGPT, Perplexity and Gemini named, next to the Google Maps rank at that point.",
          "Prospect reports in bulk. Search a niche and a city, pick the businesses outside the top 3, and get a white-label report with a factual opening line for each.",
          "An API and an MCP server, so your scripts or your AI agent can run scans and read results.",
        ] },
      ] },
      { h2: "When should you stay with Local Falcon?", body: [
        "Stay if you need Apple Maps grids, if your team is trained on it and its reports, or if you prefer one bill that covers the data. RankbyAI asks you to bring your own API keys or buy scan packs, which is one more thing to set up.",
      ] },
      { h2: "How do the costs compare?", body: [
        "The two tools charge in different ways, so compare a year of the work you actually do. With RankbyAI the software is a one-time payment and the data is billed by your API vendors. The calculator on our pricing page works out your own numbers from published vendor prices; the figures it shows are estimates.",
        "The table below shows the one Local Falcon price we verified on its public pricing page. Plans and prices change: check theirs before you decide.",
      ] },
    ],
    faqs: [
      { q: "Is RankbyAI a free alternative to Local Falcon?", a: "No. RankbyAI is a one-time purchase, and scans cost what your API vendors charge. There is a free check of one map point on three AI engines, so you can see a real result before buying." },
      { q: "Does RankbyAI have AI visibility grids like Local Falcon?", a: `Yes. RankbyAI asks ChatGPT, Perplexity and Gemini through their official APIs who they recommend at each grid point. Local Falcon also has an AI visibility module; we do not claim to be first. ${VARY}` },
      { q: "Can I move my Local Falcon scans to RankbyAI?", a: "No. There is no import. You add your businesses in RankbyAI and run new scans, which then build their own history." },
      { q: "Does RankbyAI support Apple Maps?", a: "No. RankbyAI covers Google Maps and three AI engines. If Apple Maps grids matter to you, Local Falcon supports them." },
    ],
    related: ["/pricing", "/alternatives/brightlocal", "/ai-visibility-tracker", "/local-falcon-vs-brightlocal"],
    updated: UPDATED,
  },
  {
    path: "/alternatives/brightlocal", group: "alternatives", slug: "brightlocal", eyebrow: "Alternatives",
    title: "BrightLocal Alternative: Pay Once, Scans at Cost",
    description: "How RankbyAI compares with BrightLocal for AI visibility and Google Maps grids: a lifetime seat with scans at cost versus monthly plans.",
    h1: "A BrightLocal alternative without the monthly plan",
    answer:
      "RankbyAI is an alternative to BrightLocal for agencies whose main need is to see where AI assistants and Google Maps recommend a client, and to win new clients with that evidence. You pay once, then run scans at cost on your own API keys. BrightLocal is a broader local SEO suite sold as monthly plans, with AI visibility as a module inside its Track plan.",
    showSampleGrid: true,
    table: { caption: "BrightLocal, Semrush Map Rank Tracker and RankbyAI side by side", columns: ["rankbyai", "brightlocal", "semrush"] },
    sections: [
      { h2: "What does BrightLocal do well?", body: [
        "BrightLocal is a full local SEO suite: rank tracking, citations, reviews and reporting in one subscription. If you manage listings and reviews for many locations and want one vendor for all of it, that breadth is its strength. Its AI visibility tracking is part of the Track plan.",
        "RankbyAI does not manage citations or reviews. It measures, audits and reports.",
      ] },
      { h2: "What does RankbyAI do differently?", body: [
        { list: [
          "A lifetime seat. One payment, no plan tiers by number of locations.",
          "Scans at cost on your own keys, with the estimate shown before you run and the actual cost after.",
          "An AI grid and a Maps grid for the same points, so you can see where a business ranks on Maps but is not named by AI, and the other way round.",
          "A Local AI Audit that scores a business against the three competitors that hold the map pack around it. Every finding shows its evidence, and checks that could not run are listed, not guessed.",
          "Prospect reports in bulk, white-labelled, for winning new clients.",
        ] },
      ] },
      { h2: "Which one fits your agency?", body: [
        "Choose BrightLocal if you want citations, review management and tracking under one subscription. Choose RankbyAI if you mostly need visibility evidence for client reports and sales, and you would sooner pay once and cover the data at cost.",
        "Many agencies will use both: a suite for listings, and a grid tool for proof.",
      ] },
    ],
    faqs: [
      { q: "Does BrightLocal track AI visibility?", a: "Yes. BrightLocal offers AI visibility tracking as a module inside its Track plan. RankbyAI is not the first or only tool that does this." },
      { q: "Is RankbyAI cheaper than BrightLocal?", a: "It depends on your volume. RankbyAI is a one-time payment plus what your API vendors charge for the scans you run; BrightLocal is a monthly or yearly plan. Use the calculator on our pricing page with your own number of clients and prompts. Its results are estimates from published vendor prices." },
      { q: "Does RankbyAI build citations or manage reviews?", a: "No. RankbyAI measures AI and Maps visibility, audits a business against its competitors and produces reports and fix lists. You apply the fixes yourself or with your own tools." },
    ],
    related: ["/pricing", "/alternatives/local-falcon", "/ai-visibility-tracker", "/local-falcon-vs-brightlocal", "/blog/semrush-map-rank-tracker"],
    updated: UPDATED,
  },
  {
    path: "/ai-visibility-tracker", group: "root", slug: "ai-visibility-tracker", eyebrow: "Guide",
    title: "AI Visibility Tracker for Local Businesses",
    description: "What an AI visibility tracker measures, why a national share of voice is the wrong unit for local businesses, and how a map grid shows who AI assistants recommend at each point.",
    h1: "AI visibility tracker for local businesses",
    answer:
      "An AI visibility tracker records whether AI assistants such as ChatGPT, Perplexity and Gemini name a business when someone asks for a recommendation. For a local business the answer changes with where the question is asked, so RankbyAI asks the same question at each point of a map grid and shows who was named at every point, next to the Google Maps rank there.",
    showSampleGrid: true,
    sections: [
      { h2: "What does an AI visibility tracker measure?", body: [
        "It sends a fixed question to each AI engine, stores the full answer, and records four things: whether the business was named, in which position, which other businesses were named, and which sources the engine cited. Repeating the same question later shows whether anything changed.",
        VARY,
      ] },
      { h2: "Why is a national share of voice the wrong unit for local?", body: [
        "Most AI visibility tools were built for national brands. They ask a question once and report a share of voice. That works for “best project management software”. It does not work for “best plumber near me”, where the answer depends on the asker's location.",
        "A dentist can be the first name an assistant gives two streets from the practice and be absent three miles away. One national number hides that. A grid shows it.",
      ] },
      { h2: "How does a local AI grid work?", body: [
        { list: [
          "Pick a business and the service people ask for, for example “dentist”.",
          "Choose a grid: 3×3 or 5×5 points around the business, over a radius you set.",
          "At each point, each engine is asked the same question with that point's location. RankbyAI uses the official APIs only: OpenAI with web search, Perplexity with web search, and Gemini with Google Maps grounding.",
          "Each cell shows how many engines named the business. Click a point to read the answers, the businesses named instead and the cited sources.",
        ] },
        "The same grid can carry the Google Maps rank at each point, which is how you find places where a business ranks on Maps but AI names someone else.",
      ] },
      { h2: "What do you do with the result?", body: [
        "Look at who is named instead and which sources the engines cite. If several engines cite the same directory or list and the business is not on it, that is a concrete task. The Local AI Audit turns this into findings with evidence: identity and phone consistency, profile gaps against the map pack, missing service pages, review gap, and sources to get listed on.",
        "Then run the same grid again later and compare the two. No tool can promise that an assistant will name a business; what you can do is fix the causes and measure again.",
      ] },
      { h2: "Which AI visibility trackers exist?", body: [
        "For national brands there are many, sold by the large SEO suites and by specialist tools. For local grids, Local Falcon and BrightLocal both offer AI visibility modules. RankbyAI is another option, with a different way of paying: once for the software, and scans at cost on your own API keys.",
      ] },
    ],
    faqs: [
      { q: "Is there a free AI visibility tracker?", a: "RankbyAI has a free check: one map point at the business's own location, on three AI engines, plus its Google Maps rank there. Full grids, history and audits need lifetime access." },
      { q: "Which AI engines does RankbyAI check?", a: "ChatGPT (OpenAI's API with web search), Perplexity, and Gemini with Google Maps grounding. API answers can differ from what people see in the consumer apps." },
      { q: "How often should I check AI visibility?", a: "Monthly is enough for most local businesses, and after any change you want to measure. Answers vary from run to run, so look at the pattern across the grid and over time, not at a single cell." },
      { q: "Can a tracker make AI recommend my business?", a: "No. A tracker measures. It shows where you are named, who is named instead and which sources the engines rely on, so you know what to fix. Nobody can guarantee what an assistant will answer." },
    ],
    related: ["/pricing", "/alternatives/local-falcon", "/alternatives/brightlocal", "/blog/how-to-show-up-in-chatgpt", "/ai-rank-tracker"],
    updated: UPDATED,
  },
  {
    path: "/local-falcon-vs-brightlocal", group: "root", slug: "local-falcon-vs-brightlocal", eyebrow: "Comparison",
    title: "Local Falcon vs BrightLocal (and Two Other Options)",
    description: "A neutral comparison of Local Falcon and BrightLocal for local rank and AI visibility tracking, with Semrush Map Rank Tracker and RankbyAI alongside.",
    h1: "Local Falcon vs BrightLocal: which fits your agency?",
    answer:
      "Local Falcon is a specialist grid tracker; BrightLocal is a wider local SEO suite that includes tracking. Choose Local Falcon when map grids are the job, and BrightLocal when you also want citations and review management in one subscription. Both offer AI visibility tracking. Two other options are in the table: Semrush Map Rank Tracker and RankbyAI.",
    table: { caption: "Four tools side by side", columns: ["localfalcon", "brightlocal", "semrush", "rankbyai"] },
    sections: [
      { h2: "What is each tool for?", body: [
        { list: [
          "Local Falcon: map grid rank tracking, on Google Maps and Apple Maps, with an AI visibility module. Sold with credits.",
          "BrightLocal: a local SEO suite with rank tracking, citations, reviews and reporting. AI visibility is a module inside its Track plan.",
          "Semrush Map Rank Tracker: a map rank module inside the Semrush platform, useful if your team already works in Semrush.",
          "RankbyAI (ours): AI and Google Maps grids on the same points, an evidence-based audit, bulk prospect reports, and an API with an MCP server. Paid once, with scans at cost on your own keys.",
        ] },
      ] },
      { h2: "How should you choose?", body: [
        "Start from the work, not the feature list. If you report map grids to clients every month, a specialist grid tool is the natural fit. If you also build citations and manage reviews, a suite saves you a second vendor. If you already pay for Semrush, check whether its module covers your needs before adding another tool.",
        "We make RankbyAI, so read our column with that in mind. It fits agencies that want visibility evidence for reports and sales and would sooner pay once and cover the data at cost. It does not manage citations, reviews or Apple Maps.",
      ] },
      { h2: "What about price?", body: [
        "The four are priced in different ways: credits, plan tiers by location, a platform add-on, and a one-time payment plus API costs. The table shows only the figures we verified on each public pricing page, with the date. Prices change, so open each vendor's pricing page before you decide.",
      ] },
    ],
    faqs: [
      { q: "Is Local Falcon or BrightLocal better for map grids?", a: "Local Falcon is the specialist: grids are its core product and it covers Apple Maps too. BrightLocal includes grids as part of a wider suite. If grids are most of what you do, start with the specialist." },
      { q: "Do Local Falcon and BrightLocal track AI visibility?", a: "Yes, both offer AI visibility tracking. So does RankbyAI. None of them was built by us first, and we do not claim otherwise." },
      { q: "Why is RankbyAI in this comparison?", a: "Because we make it and this is our site. We have tried to describe the other tools fairly and to show only prices we verified, with their date." },
    ],
    related: ["/alternatives/local-falcon", "/alternatives/brightlocal", "/blog/semrush-map-rank-tracker", "/pricing"],
    updated: UPDATED,
  },
  {
    path: "/blog/semrush-map-rank-tracker", group: "blog", slug: "semrush-map-rank-tracker", eyebrow: "Explainer",
    title: "Semrush Map Rank Tracker: What It Does and Doesn't",
    description: "What Semrush Map Rank Tracker measures, how a map grid differs from an AI recommendation grid, and when you need each.",
    h1: "Semrush Map Rank Tracker: what it does, and what a map grid cannot tell you",
    answer:
      "Semrush Map Rank Tracker shows where a business ranks on Google Maps for a keyword at points across an area. It answers “where do we appear on the map?”. It does not answer “who do AI assistants recommend here?”, which is a separate measurement with its own grid.",
    showSampleGrid: true,
    table: { caption: "Semrush Map Rank Tracker and RankbyAI side by side", columns: ["semrush", "rankbyai"] },
    sections: [
      { h2: "What does a map rank tracker measure?", body: [
        "It looks up a keyword on Google Maps from many points around a business and records the business's position at each point. The result is a grid, usually coloured green where the business is in the top three and red where it is far down or absent. It is the standard way to show that local rankings depend on distance.",
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
      { q: "How much does Semrush Map Rank Tracker cost?", a: "The table on this page shows the one figure we hold, with its date and how it was verified. Semrush changes its plans and regional prices, so check the Semrush site for the current price before you buy." },
      { q: "Does Semrush Map Rank Tracker show AI visibility?", a: "A map rank tracker measures Google Maps positions. AI visibility is a different measurement. Semrush sells AI visibility features as separate products; check its site for what each one covers." },
      { q: "Is a geo grid the same as a map rank tracker?", a: "Yes, in practice. “Geo grid”, “geogrid” and “map rank tracker” all describe looking up a keyword on a map from a grid of points around a business." },
    ],
    related: ["/map-rank-tracker", "/ai-visibility-tracker", "/local-falcon-vs-brightlocal", "/pricing"],
    updated: UPDATED,
  },
  {
    path: "/ai-rank-tracker", group: "root", slug: "ai-rank-tracker", eyebrow: "Guide",
    title: "AI Rank Tracker: Positions in AI Answers, by Location",
    description: "What an AI rank tracker can and cannot measure, and how RankbyAI records the position of a local business in AI answers at each point of a map grid.",
    h1: "AI rank tracker for local businesses",
    answer:
      "An AI rank tracker records the position at which an AI assistant names a business in its answer. There is no fixed ranking to read, as there is on a search results page: the assistant writes a new answer each time. RankbyAI records the position in each stored answer, for three engines, at each point of a map grid.",
    showSampleGrid: true,
    sections: [
      { h2: "Do AI assistants have rankings?", body: [
        "Not in the way a search engine does. An assistant produces an answer that usually names three to five businesses in an order. That order is the nearest thing to a rank, and it can change between two runs of the same question.",
        "So an honest AI rank tracker reports what was observed: named or not, the position in that answer, and how often across points and engines. RankbyAI stores the full answer text with every sample so you can read what was actually said.",
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
      { q: "Why did my position change between two scans?", a: VARY },
      { q: "Is an AI rank tracker the same as an AI visibility tracker?", a: "Mostly. “Rank” puts the weight on position in the answer; “visibility” covers whether you are named, where, by which engines and from which sources. RankbyAI records all of these." },
    ],
    related: ["/ai-visibility-tracker", "/map-rank-tracker", "/pricing"],
    updated: UPDATED,
  },
  {
    path: "/local-seo-software", group: "root", slug: "local-seo-software", eyebrow: "Guide",
    title: "Local SEO Software for Agencies, Paid Once",
    description: "What local SEO software covers, which established tools do what, and where RankbyAI fits: AI and Google Maps grids, audits and prospect reports for a one-time payment.",
    h1: "Local SEO software for agencies that you pay for once",
    answer:
      "Local SEO software helps a business appear where nearby customers look: Google Maps, local search results and, more and more, AI assistants. RankbyAI covers the measuring and reporting part: a Google Maps grid, an AI recommendation grid, an evidence-based audit and prospect reports. You pay once and run scans at cost on your own API keys.",
    showSampleGrid: true,
    table: { caption: "Established tools and RankbyAI", columns: ["rankbyai", "localfalcon", "brightlocal", "semrush"] },
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
        "Rank tracking, AI visibility, audits and reporting. It does not build citations, manage listings or handle reviews. Its audit tells you what is inconsistent or missing, with the evidence, and its Fix Kit gives you copy-ready schema, FAQs and a checklist. You or your other tools apply the fixes.",
      ] },
      { h2: "Why pay once?", body: [
        "Agencies pay for tools every month whether or not they scan. With RankbyAI the software is one payment, and the data is billed by your own API vendors at their rates, only for what you run. You see an estimate before each scan and the actual cost after.",
        "The trade-off is setup: you create API accounts with DataForSEO and at least one AI provider, or buy a pack of included scans.",
      ] },
    ],
    faqs: [
      { q: "What is the best local SEO software?", a: "It depends on the job. For listings and reviews in one place, a suite. For map grids, a specialist. For AI and Maps evidence with a one-time payment, RankbyAI is one option. We make it, so weigh that." },
      { q: "Is RankbyAI a full local SEO suite?", a: "No. It measures and reports: Maps grids, AI grids, audits and prospect reports. It does not manage citations, listings or reviews." },
      { q: "Do I need technical skills to use my own API keys?", a: "No coding. You create an account with each provider, copy a key, and paste it into RankbyAI, where it is encrypted and never shown again. The app checks the key and shows your estimated cost before every scan." },
    ],
    related: ["/pricing", "/ai-visibility-tracker", "/map-rank-tracker", "/alternatives/brightlocal", "/alternatives/local-falcon"],
    updated: UPDATED,
  },
  {
    path: "/blog/local-falcon-pricing", group: "blog", slug: "local-falcon-pricing", eyebrow: "Pricing explained",
    title: "Local Falcon Pricing: What We Verified, and How to Compare",
    description: "The Local Falcon price we verified on its public pricing page, with the date, and a fair way to compare credit plans with a one-time payment plus API costs.",
    h1: "Local Falcon pricing, and how to compare it fairly",
    answer:
      "Local Falcon sells plans that include scan credits. This page shows the one price we verified on its public pricing page, with the date. For anything else, including what a credit buys today, use Local Falcon's own pricing page: plans change and we will not guess.",
    table: { caption: "Verified figures only", columns: ["localfalcon", "rankbyai"] },
    sections: [
      { h2: "How do credit plans work?", body: [
        "A credit plan gives you a number of credits per month, and each scan uses credits according to its size. Larger grids and more keywords use more. Work out your monthly need as scans × points per scan, then see which plan covers it. Check whether unused credits roll over.",
      ] },
      { h2: "How do you compare credits with paying once?", body: [
        "Put both on a yearly basis for the same work. For a credit plan: the yearly plan price. For RankbyAI: the one-time price (which you pay in year one only) plus what your API vendors charge for the scans.",
        "Our calculator does the second half with published vendor prices and your own number of clients, prompts and grid sizes. The result is an estimate; your actual vendor bills are shown per scan inside the app.",
      ] },
      { h2: "What does the cheaper option cost you elsewhere?", body: [
        "Local Falcon includes the data and supports Apple Maps. RankbyAI needs your own API keys or scan packs, and covers Google Maps and three AI engines. Price is one line of the comparison, not the whole of it.",
      ] },
    ],
    faqs: [
      { q: "How much is Local Falcon per month?", a: "The table shows the figure we verified, with its plan name and date. For other plans and current prices, see Local Falcon's pricing page." },
      { q: "Does Local Falcon have a lifetime deal?", a: "We have not seen one on its pricing page. Local Falcon is sold as plans with credits. RankbyAI is sold as a one-time payment." },
    ],
    related: ["/alternatives/local-falcon", "/local-falcon-vs-brightlocal", "/pricing"],
    updated: UPDATED,
  },
  {
    path: "/map-rank-tracker", group: "root", slug: "map-rank-tracker", eyebrow: "Guide",
    title: "Map Rank Tracker: Google Maps Rank on a Geo Grid",
    description: "How a map rank tracker (geo grid, geogrid, GBP rank tracker) works, what grid size and radius to choose, and how to read the result.",
    h1: "Map rank tracker: your Google Maps rank at every point of a grid",
    answer:
      "A map rank tracker looks a keyword up on Google Maps from a grid of points around a business and records its rank at each one. It is also called a geo grid, geogrid or GBP rank tracker. RankbyAI runs these grids through an official data API, stores the top 20 at each point, and can show AI recommendations on the same points.",
    showSampleGrid: true,
    sections: [
      { h2: "Why does rank depend on the point?", body: [
        "Google Maps weighs distance heavily. A business usually ranks best near its own address and falls away further out. A single rank number hides this; a grid shows the footprint: where the business is in the top three, where it is on page one, and where it does not appear.",
      ] },
      { h2: "Which grid size and radius should you use?", body: [
        { list: [
          "7×7 points is a good default: enough detail to see the shape of the footprint.",
          "Use a radius of about 2 miles for a business customers travel to, and 5 to 10 miles for a service-area business.",
          "9×9 gives a finer picture of a large area; 3×3 or 5×5 is enough for a quick check.",
        ] },
        "RankbyAI shows the cost before you run. Maps lookups are billed per point by the data provider, and the standard queue is the cheapest.",
      ] },
      { h2: "How do you read a grid?", body: [
        "Look for the edge: the line where the business drops out of the top three. Then look at who holds the points beyond it. RankbyAI lists the competitors that take the top three most often across the grid, which is also the list its audit compares the business against.",
        "Run the same grid again after changes and compare the two, point by point.",
      ] },
      { h2: "What can a map grid not tell you?", body: [
        "Who AI assistants recommend. That is a different measurement. A business can hold the map pack at a point and not be named by ChatGPT there. RankbyAI can run an AI grid on the same points to show both.",
      ] },
    ],
    faqs: [
      { q: "Is a geo grid rank tracker accurate?", a: "It reports what the data provider returned for that keyword, point and moment. Results on a phone can differ slightly, and ranks move over time, so read the pattern across the grid." },
      { q: "Does RankbyAI scrape Google Maps?", a: "No. RankbyAI uses DataForSEO's official API for Google Maps results, on your account or ours." },
      { q: "How many results does each point show?", a: "The top 20. A business outside the top 20 at a point is shown as 20+." },
    ],
    related: ["/ai-visibility-tracker", "/alternatives/local-falcon", "/blog/semrush-map-rank-tracker", "/pricing"],
    updated: UPDATED,
  },
  {
    path: "/blog/how-to-show-up-in-chatgpt", group: "blog", slug: "how-to-show-up-in-chatgpt", eyebrow: "Checklist",
    title: "How to Show Up in ChatGPT as a Local Business",
    description: "A practical checklist for local businesses that want to be named by ChatGPT and other AI assistants, and how to measure whether it worked.",
    h1: "How to show up in ChatGPT as a local business",
    answer:
      "Nobody can guarantee that ChatGPT names a business. What you can do is make the business easy to identify and easy to cite: consistent name, address and phone everywhere, a complete Google and Bing profile, reviews that mention the service and the area, plain facts on your own pages, and listings on the sources assistants cite. Then measure whether you are named.",
    sections: [
      { h2: "What should you fix first?", body: [
        { list: [
          "Claim and complete your Google Business Profile and Bing Places listing. Pick the primary category that truly describes the business, fill in hours, services and a factual description.",
          "Use one name, address and phone number everywhere: profile, website header and footer, schema markup and directories. Inconsistent details make it harder to treat them as the same business.",
          "Ask every customer for a review. Reviews that mention the service and the neighbourhood give assistants words to match.",
        ] },
      ] },
      { h2: "What should your website say?", body: [
        { list: [
          "State what you do and where in plain HTML text: in the title, the main heading and the first paragraph. Facts that only appear after a script runs are easy to miss.",
          "Give each service its own page, and cover the areas you really serve.",
          "Add LocalBusiness schema with the same name, address and phone as your profile, and an FAQ with matching FAQPage schema.",
          "Do not block AI crawlers such as GPTBot and PerplexityBot in robots.txt if you want to be read. An llms.txt file with a short factual summary and links to your key pages does no harm.",
        ] },
      ] },
      { h2: "Where else do you need to be listed?", body: [
        "Assistants often cite the sources behind an answer: directories, “best of” lists, local news, review sites. If several engines cite the same source for your service and area and you are not on it, getting listed there is a concrete next step.",
        "You find those sources by reading the citations in real answers, which is what an AI visibility scan stores.",
      ] },
      { h2: "How do you measure whether you are named?", body: [
        "Ask the question the way a customer would, from the places your customers are, and record the answer. Doing that by hand does not scale, and one answer proves little because answers vary.",
        "RankbyAI asks three assistants at each point of a map grid and stores every answer, so you can see where you are named, who is named instead, and compare again after your fixes. There is a free check of one point if you want to see a real result first.",
      ] },
    ],
    faqs: [
      { q: "How long does it take to show up in ChatGPT?", a: "There is no fixed time and no guarantee. Fix the basics, then measure monthly. Changes to profiles and listings can take weeks to be reflected in the sources assistants use." },
      { q: "Can I pay to be recommended by ChatGPT?", a: "This page is about unpaid answers. We know of no way to buy a place in them, and we would be wary of anyone who claims to sell one." },
      { q: "Does schema markup make ChatGPT recommend me?", a: "Not by itself. Schema states your name, address, phone and services in a form machines read directly, which removes ambiguity. It is one of several basics." },
    ],
    related: ["/ai-visibility-tracker", "/map-rank-tracker", "/pricing"],
    updated: UPDATED,
  },
];

export const seoPage = (path: string) => SEO_PAGES.find((p) => p.path === path) ?? null;
export const seoPagesIn = (group: SeoPage["group"]) => SEO_PAGES.filter((p) => p.group === group);
