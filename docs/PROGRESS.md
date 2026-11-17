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

## M3 — history, compare, schedules, share links, white-label (17 Nov 2026)

Tested with simulated vendors (see the M2 note) against the real local database, and in the browser.

### Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| Compare of two scans shows per-point deltas + metric deltas | **Pass** | `tests/db/m3.test.ts` (AI and Maps maths, no delta invented where one side has no data) and `/app/compare` in the browser: before grid, after grid, change-per-point grid with ▲/▼ chips, metric deltas, a data-only headline |
| A weekly schedule fires from cron and charges the right funding | **Pass** | Same test file: a due weekly schedule starts exactly one scan (also with two overlapping cron ticks), BYOK leaves the house spend log empty, a credit-funded schedule spends one credit or is skipped when the balance is empty, paused schedules and locked workspaces do not run |
| `/r/{slug}` shows the latest data, is `noindex`, respects white-label + hide-branding | **Pass** | Test file (latest scan replaces the older one on the same link; agency name, colour, website; hide-branding) and a signed-out request in the browser: `noindex` present, "Get this fixed by {agency}" shown |
| Revoking a slug 404s it | **Pass** | Checked on a production build: unknown link 404, valid link 200, revoked link 404 with `X-Robots-Tag: noindex` |

### Built

- Compare page for AI and Maps scans; scan history strip on every result; schedules list with pause, resume and delete.
- "Repeat: just once / weekly / monthly" in the scan setup. Schedules are opt-in and the first repeat is one period away. Scheduled Maps runs use the Standard queue.
- Live share link per business (create, copy, regenerate, revoke) and white-label settings (name, logo upload, colour, website, reply-to, hide RankbyAI).
- Cron tick now also runs due schedules.

### Two things worth knowing

- **Share-link 404s are decided in the proxy.** A streamed page has already answered 200 by the time its lookup finishes, and a rewrite to a prerendered page is served from cache with 200, so the proxy answers 404 itself.
- **Brand fields are validated where they are used.** Owners may update brand columns through the database API directly, so the public report page re-checks them: only `http(s)` websites become links and the logo must sit in the workspace's own folder.

## M2 — BYOK vault, AI grid, Maps grid, free check, cost guard (17 Nov 2026)

**Honest status: built and tested end to end with simulated vendors; not yet run against real vendor APIs.** No real API keys exist in this environment (adding them is the operator's step), so every vendor call below was exercised through a development-only mock (`RANKBYAI_MOCK_PROVIDERS=1`, impossible to enable on Vercel) and through response fixtures taken from the vendors' docs. The first run with real keys may surface differences; treat (a) and (b) as open until then.

### Acceptance criteria

| | Criterion | Result | Evidence |
|---|---|---|---|
| a | 3×3 AI grid on 3 engines stores 27 samples with mentioned/position/names/sources; actual cost within ±50% of the estimate | **Pass with simulated vendors; needs real keys** | `tests/db/scan-engine.test.ts`: 27 samples, all fields set, cost within range. Response parsing is unit-tested against the documented OpenAI, Perplexity and Gemini response shapes |
| b | 7×7 Maps scan stores 49 ranks and renders | **Pass with simulated vendors; needs real keys** | Same test file: 49 points, top 20 at each, rank matched by cid. Rendered in the browser as a grid and on a MapLibre map |
| c | One engine forced to fail → scan `partial`, UI shows "engine unavailable" | **Pass** | Test forces Perplexity to fail: scan ends `partial`, 9 samples marked "Engine unavailable", the other engines complete. The result screen shows "unavailable" for that engine and offers "Retry failed parts" |
| d | Keys never appear in logs, responses or client bundles | **Pass** | `tests/unit/provider-http.test.ts` (a key echoed back by a vendor is scrubbed from errors and console output; the key travels only in the Authorization header), `tests/db/scan-engine.test.ts` (database holds ciphertext only; no client path returns it), `pnpm check:secrets` on the build |
| e | Free check: second attempt with the same email refused, 4th from the same IP/day refused, daily cap queues | **Pass** | `tests/db/free-check.test.ts` |
| f | Switch Stripe to live keys only after the operator approves, with the early-access banner | **Not done, by design** | Stop item. Checkout stays unconfigured until the operator adds test keys, then live keys |

### Built

- Key vault: AES-256-GCM with the workspace and provider bound into the ciphertext, validation per vendor, write-only API, four key cards with status, hint and balance.
- Adapters for DataForSEO (Maps queue, priority, live, pingback, business profile), OpenAI Responses + web search, Perplexity Agent API + web search, Gemini with Google Maps grounding and a Search fallback.
- Scan engine: estimate → confirm → run. Resumable (a status poll, a DataForSEO pingback or the cron tick continue a scan after a timeout), partial results, per-engine failure handling, retry of failed parts only.
- AI Visibility and Maps Grid screens: setup with live estimate, results that fill in while the scan runs, grid and real-map views, point drill-down (full answers, named businesses, sources, top 20), competitor overlay, share-of-voice lists with the tracked business pinned.
- Business page with the combined Maps + AI view and a data-only insight sentence.
- Free check on the home page → emailed link → watermarked report at `/r/{slug}`.
- Cost guard: per-credit cap (worst-case cost reserved before each call), daily house caps, concurrency limit; `/admin` spend view.

### Changes from the brief (and why)

| Brief | Built | Reason |
|---|---|---|
| OpenAI default `gpt-5-mini` | `gpt-6-luna` | OpenAI retires `gpt-5-mini` on 11 Dec 2026. Estimates follow: about $0.011 per OpenAI sample, about $0.14–0.26 per 3×3 AI grid, about $60 a year for the comparison scenario (the brief said $67). The site renders these from the constants |
| Reverse-geocode every grid point with Nominatim | One cached OpenStreetMap Overpass request per area; each point takes the nearest named neighbourhood; otherwise the prompt uses coordinates | Nominatim's usage policy forbids systematic grid reverse lookups. Nothing is invented when no name is found |
| Pingback URL with a shared secret | Per-task HMAC signature | The URL is visible in the customer's DataForSEO account on BYOK scans |
| Jaro-Winkler ≥ 0.9 name match | Same, plus a per-word check when both names have the same number of words | Plain Jaro-Winkler merged different businesses that share a prefix ("Smile Dental North" / "Smile Dental South") |

### Dashboard patterns taken from the Semrush Local reference (structure only)

Business cards with the latest numbers per business, share-of-voice lists with your own business pinned, competitor overlay that reuses the scan (no new spend), definitions and denominators next to every metric, retry that targets failed work only.

### Needs the operator

1. Real keys: the four `HOUSE_*` keys (free checks, included scans) in the deployment, and your own keys in Settings → API keys. Then one 3×3 AI grid and one 7×7 Maps grid on a real business to close (a) and (b). Estimated spend about $0.20.
2. Confirm with a real Perplexity key that `perplexity/sonar` accepts the web search tool (the docs do not show that pairing). If it does not, set `PERPLEXITY_MODEL`.
3. A Gemini key on a billing-enabled project (Maps grounding is not on the free tier).

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
