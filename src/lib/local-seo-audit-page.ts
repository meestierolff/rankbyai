import type { SeoPage } from "@/lib/seo-pages";

/** Product claims checked against lib/audit/checks.ts; app review remains a release gate. */
export const LOCAL_SEO_AUDIT_PAGE: SeoPage = {
  path: "/local-seo-audit", group: "root", slug: "local-seo-audit", eyebrow: "Local SEO audit",
  title: "Local SEO Audit Tool: Maps, Reviews and AI Answers",
  description: "Audit a local business: profile, website, reviews, Google Maps grid and whether ChatGPT, Perplexity and Gemini name it. 0–100 score, fixes P0–P3.",
  h1: "Local SEO audit tool that also checks AI answers",
  answer: "A local SEO audit checks why a business does or doesn't show up when nearby customers search. RankbyAI's audit covers the Google Business Profile, the website, reviews, Google Maps position across a grid, and whether ChatGPT, Perplexity and Gemini name the business. You get a 0–100 score and a fix list in priority order, P0 to P3.",
  entity: () => "RankbyAI (rankbyai.live) is AI visibility and local SEO software you pay for once. Its Local AI Audit scores a local business 0–100 and lists fixes in priority order, P0 to P3, each with the evidence behind it.",
  schemaType: "WebPage", showSampleAudit: true,
  ctaLabel: "Run a free AI check →",
  ctaNote: "About one minute, no card. One free check per person; the full audit needs lifetime access.",
  sections: [
    { h2: "Who is it for?", body: ["Agencies auditing prospects and clients, and business owners who bring their own API keys. This local SEO checker diagnoses gaps; you apply the fixes. It does not build citations or manage listings."] },
    { h2: "What does a local SEO audit check?", id: "audit-checklist", body: [
      { list: [
        "Identity & NAP: business name, address and phone on the website versus the Google profile, plus LocalBusiness schema consistency.",
        "Business profile: claimed status, primary category, description, opening hours and photos, where returned by the data provider.",
        "Website & schema: service and city in the title or H1, click-to-call, FAQ content and schema, llms.txt and crawler access. It does not run a Lighthouse speed test.",
        "Reviews: review count and rating against map-pack competitors, with the gap and a monthly review target.",
        "AI presence: whether completed ChatGPT, Perplexity and Gemini scans named the business, who they named instead, and shared cited sources.",
        "Competitive gap: service pages found on competitors' websites but missing from the business's site.",
      ] },
      "Checks that cannot run are listed as skipped and left out of the score. Missing evidence is not treated as a pass or a failure. The Fix Kit drafts profile text, FAQ, LocalBusiness and FAQ schema, and llms.txt for you to review and publish.",
      { p: ["The audit uses completed scan evidence. For position across the service area, run a ", { text: "Google Maps grid from 3×3 up to 15×15", href: "/map-rank-tracker" }, "; for repeated position checks, see the ", { text: "local rank tracker", href: "/local-rank-tracker" }, "."] },
    ] },
    { h2: "How do you audit a Google Business Profile?", body: [
      { list: [
        "Open the profile and confirm you can manage it. Check the claimed status and that the primary category describes the business.",
        "Compare the public name, address and phone with the website and its LocalBusiness schema. Correct conflicting details.",
        "Check the description, hours and photos. Review replies and whether public details are still accurate need a human check.",
        "Compare review counts and ratings with the businesses appearing in the map pack for the same service and area.",
      ] },
      "RankbyAI automates comparisons using the profile fields, pages and competitor evidence it can retrieve. It records evidence and a suggested fix; it does not edit your Google Business Profile.",
      { p: ["Google describes relevance, distance and prominence as local ranking factors. See ", { text: "Google's guidance on improving local ranking", href: "https://support.google.com/business/answer/7091" }, "."] },
    ] },
    { h2: "Why does the audit include AI answers?", body: [
      "Assistants answer questions such as ‘best dentist in Austin’ with business names and sources. A Google Maps position does not tell you whether an assistant names the same business. Most website audits focus on pages; an AI check samples the answer itself.",
      "AI answers vary between runs, places and time. Results through an API can differ from the apps. We sample answers and store evidence; we do not measure search impressions or promise recommendations. The audit uses completed AI checks; unavailable engines are marked as skipped.",
      { p: ["Crawler access is one website check: OAI-SearchBot is for ChatGPT search, while GPTBot is for training. ", { text: "OpenAI documents these controls separately", href: "https://platform.openai.com/docs/bots" }, ". Allowing a crawler does not guarantee inclusion."] },
      { p: ["See the ", { text: "AI visibility tracker", href: "/ai-visibility-tracker" }, " and the practical guide to ", { text: "showing up in ChatGPT", href: "/blog/how-to-show-up-in-chatgpt" }, "."] },
    ] },
    { h2: "What does a finding look like?", body: [
      { table: { caption: "Sample data · fictional Northgate Family Dental · P1 finding", columns: ["Evidence", "Sample observation"], rows: [
        [["Review count"], ["You 38 reviews · map-pack median 112"]],
        [["Gap"], ["112 − 38 = 74 reviews"]],
        [["Planning period"], ["3 months · 74 ÷ 3, rounded up = 25 reviews/month"]],
        [["Suggested fix"], ["Ask customers for honest reviews after their visit. Use the target to plan requests, not as a ranking promise."]],
      ] } },
      "P0 comes first: identity conflicts and crawler access. P1 comes next, followed by P2 and P3. Every finding includes the observed evidence and a suggested action; a score is a diagnosis, not a Google ranking.",
    ] },
    { h2: "What each kind of audit checks", body: [
      { table: { caption: "Tool types compared · scope varies by product", columns: ["Checks", "Website audit (Lighthouse/on-page)", "GBP template / checklist", "Map-grid tracker", "RankbyAI Local AI Audit"], rows: [
        [["Page speed, titles, headings"], ["Depends on tool"], ["No"], ["No"], ["Titles / H1 and schema; no speed test"]],
        [["Google Business Profile completeness"], ["Usually no"], ["Manual"], ["Usually no"], ["Profile category, where data is available"]],
        [["Name, address, phone: site ↔ profile"], ["Sometimes"], ["Manual"], ["Usually no"], ["Identity category"]],
        [["Reviews vs competitors"], ["Usually no"], ["Manual"], ["Varies"], ["Counts, ratings and review target math"]],
        [["Google Maps position across an area"], ["No"], ["No"], ["Yes"], ["Completed Maps grid evidence"]],
        [["Named by ChatGPT / Perplexity / Gemini"], ["Usually no"], ["No"], ["Some also track AI visibility"], ["Completed scans on all three assistants"]],
        [["Fixes ranked with evidence"], ["Some"], ["Manual"], ["Varies"], ["P0–P3, with evidence and suggested fixes"]],
      ] } },
      "Categories describe tool types, not named products; individual products can combine them. Some map-grid trackers also track AI visibility. Compare each tool's current scope before choosing.",
    ] },
    { h2: "How much does an audit cost?", id: "local-audit-cost", body: ["Lifetime access is a one-time software payment. With your own DataForSEO account and AI keys, vendors bill scans at their rates. You see an estimate before running a scan. The one free AI check on the homepage is separate from the full audit."] },
    { h2: "Local SEO audit vs local SEO report: what's the difference?", body: ["An audit diagnoses a business: it identifies gaps, shows evidence and orders fixes. A local SEO report communicates results to a client, such as visibility, Maps positions and changes between scans. RankbyAI supports white-label reports with live links and PDFs; the audit supplies the diagnosis behind the next actions."] },
  ],
  faqs: [
    { q: "Is the audit free?", a: "You can run one free AI check per person on the homepage. The full audit needs lifetime access and your own DataForSEO account and AI keys, or included scans when available." },
    { q: "Which AI assistants does it check?", a: "ChatGPT, Perplexity and Gemini. Answers vary between runs, places and time, and results via API can differ from the apps. The audit uses completed scans; engines without results are marked as skipped." },
    { q: "Does a higher score guarantee rankings?", a: "No. It shows what is missing and in which order to fix it; ranking depends on Google and the assistants." },
    { q: "Can I put my agency's logo on the audit?", a: "Yes, through white-label reports with live links and PDFs." },
  ],
  related: ["/map-rank-tracker", "/ai-visibility-tracker", "/local-rank-tracker", "/blog/how-to-show-up-in-chatgpt"],
  updated: "2026-11-26",
};
