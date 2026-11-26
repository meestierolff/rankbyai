# Public page release log

## 26 November 2026 — Local SEO audit page shipped

- Status: shipped. Production deployment explicitly requested by Mees in this session.
- Vercel deployment: `dpl_FgCkFKvjafvMXrUyXwAt6jqkaFAR` (READY), aliased to
  https://rankbyai.live. Remote build completed in 44 seconds.
- Deployed via CLI from base `4243f06` plus the tested, uncommitted audit-page changes.
- New URL: `/local-seo-audit`; sitemap lastmod: 2026-11-26; included in llms.txt.
- Incoming contextual links: local SEO software, ChatGPT guide, BrightLocal alternative,
  and Maps grid guide; footer link added through the shared SEO registry.
- Six categories and claims checked against `src/lib/audit/checks.ts`. Website checks cover
  titles/H1, schema and crawler access, not Lighthouse performance. Missing scan evidence
  is skipped. Live price uses the existing offer service and refreshes via `/api/offer`.
- Demo reuses the homepage's fictional Northgate audit (64/100); social card has the
  separately labelled sample 62/100 requested in the brief.
- Local validation: production build and TypeScript passed; 57 focused tests passed;
  targeted ESLint and client-bundle secret check (73 files) passed. Browser checks at
  desktop and 390px mobile confirmed no horizontal overflow, raw-HTML H1/answer/
  checklist/tables/four FAQs, self canonical, index/follow, matching schema without
  AggregateRating, sitemap lastmod, llms.txt, footer and four contextual links.
  Both social images returned 200 as 1200×630 PNGs. Local offer 503 displays an
  unavailable-price message; moved-price and closed-offer states covered by tests.
- Production validation passed after READY: page HTTP 200, self canonical,
  index/follow, raw-HTML H1/answer/checklist/tables, four visible/schema-matching FAQs,
  SoftwareApplication and BreadcrumbList without AggregateRating; sitemap lastmod
  2026-11-26, llms.txt, footer and all four contextual incoming links verified.
  Live offer HTTP 200: $29 now / $39 next, matching software offer schema. OG and
  Twitter images both HTTP 200, 1200×630 PNG. No error/fatal logs returned for this
  deployment in the initial 10-minute query window. Drain inventory unavailable
  (Vercel drain endpoint returned 404); no monitoring configuration changed.
- GSC/GA4 baseline: UNKNOWN (not connected in the supplied brief). Evaluate 28 days
  after publication once access exists; no traffic impact claimed.


## 25 November 2026 — ChatGPT local business guide refreshed

- Page: https://rankbyai.live/blog/how-to-show-up-in-chatgpt (existing URL).
- Vercel production deployment: `dpl_DQ44yiB3y6ENG93M4pS7BCarhfKm`.
- Production release explicitly requested by Mees in the implementation session.
- Deployed the local working tree via CLI, including uncommitted guide changes on base `bf7e79d`.
- Updated title, opening answer, crawler guidance, citation workflow, customer-referral table,
  seven FAQs, example-data screenshot, social cards and three contextual incoming links.
- Article dateModified and sitemap lastmod: 2026-11-25; datePublished remains 2026-11-17.

Validation: production build, TypeScript, targeted lint, 44 focused tests and client-bundle
secret check passed. After Vercel reported READY, the canonical page returned 200 with
updated title/meta/H1 and opening answer in raw HTML. Self canonical, seven matching
visible/schema FAQs, preserved source-section anchor, loaded screenshot, 1200×630 OG
image, sitemap date, three incoming links and OAI-SearchBot Allow verified live.
No error/fatal runtime log entries were returned for this deployment in the initial
10-minute query window. Search-console baseline remains UNKNOWN; no traffic impact claimed.

## 24 November 2026 — SEO Agency AI Index shipped

- Hub: https://rankbyai.live/ai-index/seo-agencies
- City pages: 387 under `/ai-index/seo-agencies/{country}/{city}`.
- Vercel deployment: `dpl_FtqAVKZjy8ZaRzFKTRKFw6ZMEvr5`.
- Production release explicitly approved by Mees in the implementation session.
- `AI_INDEX_PUBLIC=true` for the production environment. Preview default remains false.
- Actual publication date: 2026-11-24. Source collection date: 2026-11-23.
- Shipped status recorded after successful live HTTP checks of the canonical production domain.

Validation: production build passed; 49 focused tests passed. Hub and Denver,
Dublin and Springfield returned HTTP 200, index/follow and self canonicals.
The hub contains all 387 city links in raw HTML; the sitemap contains the hub
plus 387 city URLs. Dataset/FAQ/WebPage/Breadcrumb schema and publication date
verified. Parsed examples contain agency ItemList schema; unparseable examples
do not. llms.txt and the five discovery links are enabled. No CSV download.

Regression checks compared live responses against the pre-release baseline:
`/`, `/pricing`, `/ai/dentist/austin`, `/ai/dentist/manchester` and
`/ai/plumber/denver` retained status 200, title, canonical and robots metadata.
robots.txt remained byte-for-byte identical. Vercel reported no runtime errors
for the hub and no error/fatal log entries for the new deployment in the
selected 10-minute window immediately after release.

GSC/GA4/Bing baseline remains UNKNOWN. No new paid scans or research calls ran.
