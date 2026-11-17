# Progress log

Newest entry first. Each milestone lists what was verified, how, what is left, and open [CONFIRM] items.

## Decisions that apply to every milestone

Where the design handoff and the build brief disagree, the brief wins on content, numbers, legal and honesty rules; the design wins on visuals.

| Topic | Design handoff | Build brief | What the code does |
|---|---|---|---|
| Engines | 4 engines incl. Claude, all on one DataForSEO key | 3 engines (OpenAI, Perplexity, Gemini), each on its own vendor key | 3 engines. No Claude tabs or copy anywhere |
| Numbers | $149, ~$0.10 per 7×7 scan, "$99/month tracker" | $29 ladder, vendor price constants, dated competitor prices | Every number renders from `/api/offer`, `lib/pricing-constants.ts` or the dated competitor table |
| AI grid size | 7×7 | 1×1, 3×3, 5×5 (Maps up to 9×9) | Demos show AI 5×5 beside Maps 7×7 |
| Theme | Dark only (logo is dark-only) | Light + dark | Dark only (deviation from the brief, on purpose) |
| Sample business | "Lone Star Plumbing" | Fictional "Northgate Family Dental", no real names | Northgate Family Dental + invented competitors, labelled "Sample data" |
| Tokens | CSS values | `tailwind.config` + CSS variables | Tailwind v4 is CSS-first: tokens in `src/styles/tokens.css`, mapped in the `@theme` block of `globals.css` |
| P0 / Maps 20+ red | `oklch(0.60 0.19 25)` | 4.5:1 contrast | `oklch(0.56 0.19 25)` so white text passes contrast |

## M1 — foundation, marketing site, ladder, test checkout (17 Nov 2026)

### Acceptance criteria

| | Criterion | Result | Evidence |
|---|---|---|---|
| a | RLS: anon and a second user can't read any private table; key ciphertext unreadable to members | **Pass** | `tests/db/rls.test.ts` (75 checks) against local Postgres: RLS on for all tables, both roles blocked on 29 private tables, ciphertext and API-key hashes not selectable, the credentials view filters by membership, members cannot set their own plan, cannot insert orders/credits, cannot call server-only functions |
| b | Ladder: sale #1 $29, #5 $29, #6 $39, #11 $49; refunded orders still count | **Pass** | `tests/unit/ladder.test.ts` and `tests/db/ladder.test.ts` (SQL view agrees with the TypeScript formula for 11 sales; refunds keep the count; terms freeze after the first sale) |
| c | Concurrent checkout → 409 `price_changed` or the next tier, never more than 5 seats at a price | **Pass** | `tests/db/ladder.test.ts`: 6 parallel buyers on the last $29 seat → 1 success, 5 × 409; 8 parallel buyers on a fresh ladder → exactly 5 holds at $29, the other 3 get $39 after confirming |
| d | Test-mode purchase (4242…) sets plan lifetime, seat 1, tax calculated; replay changes nothing | **Partly verified, needs operator** | Verified without a Stripe account: a correctly signed `checkout.session.completed` sets plan `lifetime`, seat 1, stores tax; the same event and a re-delivered event change nothing (`tests/db/webhook.test.ts`). **Not done:** a real 4242 test purchase with Stripe-calculated tax. Needs the RankbyAI Stripe **test** keys (see "Needs the operator") |
| e | Lighthouse mobile ≥ 90 on `/`; reduced motion shows static frames | **Pass (local production build)** | `/`: performance 100, accessibility 100, best practices 100, SEO 100. `/terms`: 100 on all four. Reduced motion: tour does not auto-advance and grid reveal is off (`prefers-reduced-motion` handled in CSS and in the tour). Re-run on the deployed preview |
| f | Rich Results Test shows SoftwareApplication + FAQPage without errors | **Not run; one known limitation** | JSON-LD `@graph` renders Organization, WebSite, SoftwareApplication (price from the live ladder) and FAQPage (11 Q&As, same text as the page). Google's test needs a public URL. Expect Google to flag SoftwareApplication for a missing `aggregateRating`/`review`: we have no real reviews and will not mark up fake ones |
| g | No secrets in client bundles | **Pass** | `pnpm check:secrets` after build: values of 7 local secrets and 15 server-only variable names absent from `.next/static` (the check caught and we fixed one leak of variable *names*) |
| h | Tracker loads on the preview deploy | **Needs operator** | The root layout loads `SOD_TRACKER_SNIPPET_SRC` on every page. Needs the real snippet URL in the environment and a deploy |

### Built

- Scaffold from `create-next-app` and `shadcn/ui` only. Next.js 16.4 with Cache Components; marketing pages are prerendered, the app streams behind a shell.
- Design tokens and a brand component library extracted from the handoff; used by the site and the app.
- Schema for every table in the brief, RLS on all of them, explicit grants, money and plan changes only through server-only functions.
- Magic-link sign-in (`/login`, `/signup`), app shell with the sidebar, dashboard, billing page.
- Home page with every section of the brief, sample-data demos, calculator on the shared price constants.
- `/terms`, `/privacy`, `/refunds`, `/disclaimer`, `/removal` (form + rate limit + optional Turnstile).
- `/api/offer`, `/api/checkout`, `/api/webhooks/stripe`, refund endpoint, thanks page that waits for the webhook.
- SEO: metadata, JSON-LD, `robots.txt` (AI crawlers allowed), `sitemap.xml`, `/llms.txt`, social image.
- PostHog with a consent banner for EU/EEA/UK/CH visitors, cookieless until consent.

### Left for later milestones

- `/docs/api` and `/ai` are honest "not live yet" pages until M6 and M7.
- App module pages other than Dashboard and Billing are labelled placeholders until their milestone.
- Free check (M2), early-access banner text (`EARLY_ACCESS_NOTE`, set by the operator with true dates).

### Needs the operator

1. **Stripe test keys** for the dedicated RankbyAI account: run `scripts/stripe-setup.mjs`, set the `STRIPE_*` variables, then do one 4242 purchase to close criterion (d).
2. **A hosted Supabase project** (a spend and account decision). Apply the migration and paste the email template (docs/SETUP.md).
3. **`SOD_TRACKER_SNIPPET_SRC`**: the exact script URL from the hackathon dashboard. If the snippet needs extra attributes, say so and the layout gets them.
4. **`LEGAL_*`** values: until set, legal pages show a visible "not set" marker instead of invented details.
5. A read of the legal pages by the operator (and ideally a lawyer). They follow the brief; clauses added beyond it: account suspension for abuse, changes to the terms, exclusion of indirect loss, GDPR legal bases, an 18+ line.

### [CONFIRM] items

Full notes with quotes and URLs: [vendor-api-notes.md](vendor-api-notes.md). Items that differ from the brief:

| Item | Brief assumed | Docs say (17 Nov 2026) | Action |
|---|---|---|---|
| OpenAI model | `gpt-5-mini` | Supports web search but is deprecated, shuts down 11 Dec 2026. `gpt-6-luna` is the cheap current model | Decide default in M2; keep `OPENAI_MODEL` override |
| Perplexity model + web_search | `perplexity/sonar` with the tool | Endpoint and tool shape confirmed; that model + tool pairing is not shown in the docs | Test with a real key in M2 (tiny call) |
| Perplexity key validation | cheap or free call | No free validation confirmed | Show "one tiny test call" notice |
| Gemini | `generateContent` + `googleMaps` tool | Confirmed; `generateContent` is now labelled legacy; grounding needs a paid-tier key | Use as specified, note the legacy label |
| MCP SDK | `@modelcontextprotocol/sdk` | That is the v1 line; `@modelcontextprotocol/server` 2.x / `mcp-handler` are current | Decide in M6 |
| Stripe tax code | to confirm | `txcd_10103001` (SaaS, business use) | Default in `scripts/stripe-setup.mjs` |
| Stripe `payment_method_types` | cards + wallets + Link | Replaced by `allowed_payment_method_types` in the current API version | Done |
| Nominatim | reverse-geocode each grid point | Policy forbids systematic grid reverse queries | Needs a different approach in M2 (see M2 notes) |
| Ship or Die tracker and consent | load on every page | Unknown whether it sets cookies | Loaded unconditionally as the hackathon requires; disclosed on `/privacy` |
