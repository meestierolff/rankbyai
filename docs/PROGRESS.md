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
| Database, sign-in, files | n/a | Supabase (Postgres, magic-link sign-in, Storage) | Neon (Postgres, Neon Auth with Google sign-in, Data API, Object Storage), on the operator's instruction of 17 Nov 2026. The brief's rules are unchanged: RLS on every table, an automated RLS test, secrets on the server only |

## Free check without sign-in, search pages, conversion tracking (20 Nov 2026)

**Status: built and tested locally (mock vendors) on branch `free-check-public-landing-pages`. Needs migration 0013 on Neon before deploy.**

### Free check: new behaviour

- The homepage form (`#free-check`) posts to `POST /api/free-check`, which sets an httpOnly check cookie and answers `{ ok, next: "/free-check" }`. `/free-check` is now a **public** page (noindex, not in the sitemap): it runs the check (`POST /api/free-check/execute`) and shows the result, the same report view as `/r/`, with a sign-up / buy panel and an optional email box under it. No login before the result.
- `GET /free-check` answers 200 (the form, or this browser's own check). `/free-check/` still 308s once to `/free-check`. Only `/free-check/run` (the old signed-in step, kept for links issued before) still sends signed-out visitors to `/login`.
- Results are private to the browser that ran them: business, scan and report live in a system workspace without members (`00000000-0000-4000-8000-00000000fc02`), and the report is stored revoked, so its share link never opens.
- `free_check_completed` fires once per check, only after the result is on screen (`POST /api/free-check/shown`, a conditional UPDATE).

### Free check: limits and caps

| Limit | Value | Why |
|---|---|---|
| Turnstile | required on every deployment with real keys (previews too) | without login, a preview URL would be an open paid endpoint |
| Burst | 8 starts per IP and 5 per fingerprint in 10 min, counted even when refused | stops scripts before a siteverify call |
| Per visitor | 1 per browser cookie, 1 per device fingerprint in 30 days (`FREE_CHECKS_PER_VISITOR`) | "one check per person" without an account; a business not found on Maps does not use it up |
| Per IP | 3 starts a day, IPv6 per /64 (`FREE_CHECKS_PER_IP_PER_DAY`) | unchanged value, now also bounding failed attempts |
| Repeats | the same business + city + country once a day, by anyone | saves cost on repeated look-ups |
| Input | `lib/free-check-input.ts`: lengths, letters, no URLs/emails/markup/prompt text, no junk | refuse before any paid call |
| Daily budget | $3 (`COST_DAILY_FREE_CAP_USD`, unchanged) | about 100 checks a day at an estimated ~$0.03 each (ChatGPT and Gemini per-answer costs were measured on 18 Nov; Perplexity and the Maps lookups are from published prices) |
| Monthly budget | $30 (`COST_MONTHLY_FREE_CAP_USD`, new) | hard ceiling of about one third of a month at the daily cap |
| Per check | $0.11 reserved while running ($0.10 AI cap + 2 Maps lookups), max 2 attempts | the claim (`free_check_claim`) counts running checks at this bound, under an advisory lock |

Trade-off of the fingerprint: visitors behind one network with the same browser and language (an agency office, some mobile carriers) share one free check for 30 days; they see "This device or network has already had a free check".

When a cap is reached the visitor is told so ("Today's free checks are used up…"), the check waits, and nothing is called. Maps spend on failed checks is logged too (it was not before). Retention (daily cron): results 90 days, hashed records 180 days, result-only email addresses 30 days after sending.

### Search pages

New: `/local-rank-tracker`, `/blog/brightlocal-pricing`, `/alternatives/peec-ai`, `/alternatives/profound`, `/alternatives/otterly`, `/alternatives/local-viking`, `/blog/peec-ai-pricing`, `/blog/profound-pricing`, `/blog/otterly-pricing`, `/peec-ai-vs-profound`, `/semrush-ai-visibility`. Improved: all ten existing search pages. Close variants 301 to one canonical (`next.config.ts`). Not built: `/alternatives/places-scout` (placesscout.com 301s to yext.com; no product page to compare), BrightLocal vs Whitespark/Moz, any Semrush alternative/pricing page, any geogrid construction page.

Competitor facts: `lib/competitors.ts`, each cell read on the vendor's own page on 20 Nov 2026 with that page linked. Not verifiable that day and marked so on the pages: Profound prices (not published), Otterly's billing basis for the displayed prices, Semrush AI Visibility Toolkit monthly-billing price, Local Viking prices (its pricing link redirects to LocalOptics), whether BrightLocal's AI tracker uses a grid (its page says per location).

### Conversion tracking

GA4 + Google Ads for `free_check_completed`, `sign_up`, `purchase` (value before tax, tax, currency, order id), stubbed behind empty `NEXT_PUBLIC_*` IDs. Consent Mode v2 (basic) on the existing `rb_consent` banner, plus a separate `rb_consent_ads` question once an Ads ID exists; "Cookie choices" in the footer. UTMs and gclid/gbraid/wbraid kept within consent (`rb_attr`), stored on `profiles.attribution` at signup and `orders.attribution` at purchase; both reported once (`*_reported_at`).

### Verified

- `pnpm test`: all suites pass, including `tests/db/free-check-public.test.ts` (visitor/device/IP/IPv6/repeat limits, daily and monthly caps, 6 concurrent claims with room for 2 → exactly 2, attempts, result privacy, email once, withdrawal, retention), `tests/db/free-check-route.test.ts` (Turnstile required, missing token rejected, burst limit), `tests/db/conversions.test.ts`, `tests/unit/google-tags.test.ts` (EEA denied state loads nothing).
- Local run in a browser (mock vendors): form → result without login; second check refused with a link to the result; `/free-check/run` still gated.
- Turnstile with Cloudflare's always-pass test keys on a production build: the widget renders on a full load and again on a form that mounts after a client-side navigation (it is now rendered explicitly, `components/marketing/turnstile-widget.tsx`); the token reaches the server, siteverify accepts it, and the result appears. A start without a token answers 400. `/free-check` answers `Cache-Control: private, no-store` with or without a result cookie.
- Regional pages (`/ai/...`) no longer count free-check scans (`lib/regional.ts`, test in `tests/db/regional.test.ts`). They did before for the signed-in free check; without login, any looked-up business could otherwise have reached an indexed page. The six published pages rest on credit-funded scans, so they keep their samples.
- All 21 search pages: 200, phrase in H1 and first paragraph, unique title, canonical, Twitter tags, FAQPage, links to /pricing and the free check; 9 variants answer 301. Production build: new pages are static; CLS 0, LCP and HTML size below the homepage's (localhost, unthrottled).

### Needs the operator

1. Apply migration 0013 to Neon `preview` and `main` (`node scripts/db.mjs migrate --url …`), then refresh both Data API schema caches.
2. Turnstile keys on the preview environment, or the free check stays closed there.
3. Before ads: create GA4 and Google Ads conversion actions and set `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID` and the three `NEXT_PUBLIC_GOOGLE_ADS_LABEL_*` values (Production), then redeploy.
4. [CONFIRM] Terms §6 and the privacy page changed (free check without an account, email, Google tags, campaign parameters, Brevo as the email processor).
5. [CONFIRM] The homepage still shows Semrush Map Rank Tracker at €112/mo (operator-verified, 17 Nov); Semrush's Local pricing page showed $30/mo per location billed yearly on 20 Nov (US). The search pages use the latter, with source and date.

## M6 — REST API and MCP server (17 Nov 2026)

**Status: built and tested, including with the official MCP client library. Connecting from the Claude Desktop or Cursor apps themselves is left for the operator (it needs a key on a reachable deployment).**

### Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| OpenAPI validates | **Pass** | `tests/db/api-v1.test.ts`: `/api/v1/openapi.json` is valid OpenAPI 3.1 (schema validator), and every documented endpoint is served by the router and nothing undocumented is |
| API key create and revoke work; the key is shown once | **Pass** | Format `rbai_live_` + 32 characters; only sha256(key + pepper) and an 18-character prefix are stored; the owner can read names and prefixes but not the hash; a revoked key stops working at once; five active keys per workspace |
| Rate limit returns 429 | **Pass** | Requests 61 and 62 inside a minute answer 429 with `Retry-After`; another key is unaffected |
| MCP: tools list loads; `estimate_scan` → `run_ai_scan {confirm: true}` → `get_scan` works end to end | **Pass with the official MCP client library; not yet from the desktop apps** | The test connects `@modelcontextprotocol/client` over Streamable HTTP to the real route: 13 tools with descriptions and schemas, then estimate → run → result with 9 points and 27 answers |
| Paid tools without `confirm` refuse | **Pass** | `run_ai_scan`, `run_maps_scan`, `run_audit`, `create_prospect_batch` and `add_business` (by name) return `confirm_required` with an estimate; no scan, audit, batch or business is created and nothing is scheduled |

### Built

- **API keys** (`/app/developers`): create (shown once), list with prefix and last use, revoke. Owner only.
- **REST** under `/api/v1`: businesses (list, add, get), scans (estimate/run, get, points, compare), audits (estimate/run, get, Fix Kit), prospect batches (estimate/start, get), usage. Bearer key, 60 requests a minute per key, JSON errors with stable codes.
- **MCP** at `/api/mcp` (Streamable HTTP, stateless, SDK v2): `list_businesses`, `add_business`, `estimate_scan`, `run_ai_scan`, `run_maps_scan`, `get_scan`, `compare_scans`, `run_audit`, `get_audit`, `get_fix_kit`, `create_prospect_batch`, `get_prospect_batch`, `get_usage`. Tool descriptions carry short guidance on what the numbers mean and what to do next.
- **One implementation**: REST routes and MCP tools call the same functions (`src/lib/api-v1/core.ts`), so they cannot drift apart.
- **Docs**: OpenAPI at `/api/v1/openapi.json`, a reference in the app (`/app/api/reference`) and the public `/docs/api` page, both rendered from the OpenAPI document; copy-paste setup for Claude Code, Cursor and Claude Desktop.

### Worth knowing

- An API key acts as the workspace owner. Reads go through row-level security with the owner's identity; a key from one workspace gets 404 for another workspace's ids (tested for every resource).
- The estimate step never calls a vendor. For a prospect batch the search itself is paid, so the estimate is given for the requested number of reports before any search runs.
- `get_prospect_batch` was added to the brief's tool list: without it an agent could start a batch but not read it.

### [CONFIRM] items closed here

- MCP SDK: built on `@modelcontextprotocol/server` 2.4 (the current line), not the v1 package the brief named.
- Client config formats: Claude Code (`--transport http` + `--header`), Cursor (`url` + `headers`), Claude Desktop (`mcp-remote`; the app's own "custom connector" screen also accepts the URL and a fixed header, which I read in the support article but did not see in the app).

### Needs the operator

1. Create a key on the preview, paste a snippet into Claude Desktop or Cursor, and confirm the tools appear. The preview's login wall has to be off for this (Vercel → Deployment Protection), or use the live site.

## Deployments (17 Nov 2026)

| What | Address | State |
|---|---|---|
| **Production** | **https://rankbyai.live** | Live with a valid certificate, on the Neon `main` branch. Approved by the operator on 17 Nov 2026. `www` redirects to it. DNS: an A record and a `www` CNAME at Spaceship; the existing SPF and DMARC records and Spaceship's nameservers (DNSSEC) were left alone |
| Preview | https://rankbyai-preview.vercel.app | On the Neon `preview` branch, behind Vercel's login wall |

- Works on production now: the site, pricing from the live counter, Google sign-in (Neon's shared Google app), the dashboard, the REST API and the MCP server.
- Not switched on yet, each waiting for a key only the operator can add: **checkout** (Stripe live keys; the app refuses test keys on production), the **free check** and the **removal form** (Cloudflare Turnstile; they refuse to run without it on production), **included scans** (house API keys).
- The legal pages show the operator "Top of the World", its address and KVK number. The contact email is still marked "not set" (`LEGAL_EMAIL`).
- The Vercel project is not connected to Git: a push does not deploy. The timer runs once a day (Hobby plan; see docs/SETUP.md).
- The first `vercel deploy` of the new project became a production deployment by Vercel's default, before production was approved. It had no settings and no domain. It has since been replaced by the approved deployment.

### Real vendor check (17 Nov 2026, DataForSEO house login, $0.04 spent)

`LIVE_DFS=1 pnpm vitest run tests/live/dataforseo-live.test.ts`: the login is valid; "dentist in Austin, TX" returned 100 businesses for $0.002 (M5 criterion: at least 20); a 3×3 Maps grid stored 9 real ranks for $0.018, exactly the estimate (M2 criterion b, small grid); an audit of a real practice returned score 50, 19 of 23 checks ran, 9 findings with evidence, for $0.022 against an estimate of $0.028 (M4 criterion). The AI checks were "not checked" because no AI key is set. The area lookup timed out on the public OpenStreetMap server; it now starts earlier, waits longer and tries mirrors.

## M7 — search pages, regional pages, remaining screens (17 Nov 2026)

**Status: built, tested and deployed.**

### Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| `/ai/...` pages render with schema and the indexability rule | **Pass** | `tests/db/regional.test.ts`: own-key scans stay private unless the workspace opts in; scans on our keys count; a page becomes public at 27 answers from 2 scans and not before (row-level security hides thinner pages completely, so they are neither reachable nor in the sitemap); no page row carries a workspace, user or business id. The page has BreadcrumbList, ItemList of LocalBusiness, Dataset and FAQPage with three data-derived answers, and a removal link |
| OG images generate | **Pass** | Every search page and regional page has its own 1200×630 image (checked: 200, image/png) |
| Lighthouse ≥ 90 on `/` and `/pricing` | **Pass** | Mobile, production build: 100 / 100 / 100 / 100 on `/`, `/pricing` and `/ai-visibility-tracker` |
| All analytics events fire | **Pass by code search** | All 23 event names from the brief are sent from at least one place (`landing_view` was missing and was added). Not verified in PostHog itself: no PostHog key is set |
| Optional retro pricing skin | **Left off** | Optional in the brief |
| Early-access banner removed if M3–M6 shipped | **Pass** | The banner only shows when `EARLY_ACCESS_NOTE` is set; it is not set |
| First competitor-watch add-on | **Not done** | The watch log lives outside this repository |

### Built

- **Ten search pages** from one content registry (`src/lib/seo-pages.ts`) and one template: `/alternatives/local-falcon`, `/alternatives/brightlocal`, `/ai-visibility-tracker`, `/local-falcon-vs-brightlocal`, `/blog/semrush-map-rank-tracker`, `/ai-rank-tracker`, `/local-seo-software`, `/blog/local-falcon-pricing`, `/map-rank-tracker`, `/blog/how-to-show-up-in-chatgpt`. Each opens with the answer, uses question headings, has an FAQ with FAQPage schema, a breadcrumb, a canonical address, a social image, one call to action ("Run a free check") and links to related pages. Unknown addresses answer a real 404.
- **Comparison tables** show only the competitor prices verified on 17 Nov 2026, with that date and source; where we hold no verified fact the cell says "See their site". Each page says what the other tool does well, and none claims RankbyAI was first.
- **`/pricing`** as its own page; **regional pages** `/ai` and `/ai/{niche}/{city}` rebuilt by the timer; an opt-in under Settings → Branding.
- **Clients** (group businesses, add and delete) and **Requests** (ask, vote once per person, changelog): the last two placeholder screens are now real.

### Found and fixed on the way

- **Included 3×3 AI scans were cut short.** Fifteen answers are requested at once, and their combined worst-case cost reservations alone exceeded a one-credit cap, so later answers were skipped for good and the scan refunded itself, although the real cost was a third of the cap. Reservations now wait for calls in flight to settle; an answer is skipped only when settled costs leave no room. Regression test in `tests/db/scan-engine.test.ts`.

## M5 — prospect mode, PDF export, scan packs (17 Nov 2026)

**Status: built and tested with simulated vendors. A real "dentist / Austin, TX" search and a test-mode pack purchase need real keys.**

### Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| "dentist / Austin, TX" lists ≥ 20 businesses | **Pass with simulated vendors; needs a real key** | `tests/db/prospects.test.ts`: the search returns 20+ businesses, each with a map location. The real call is one Google Maps search with depth 100 |
| A 5-business batch on credits deducts 10 credits and completes | **Pass** | Same file: balance 12 → 2, five reports, ten scans (Maps 5×5 standard + AI 3×3 each) with no further credit taken, five audits |
| A 20-row CSV resolves ≥ 80% | **Pass with simulated vendors** | 18 of 20 rows matched; the 2 unmatched rows are listed with a reason, never guessed |
| Zip of PDFs and CSV export open cleanly | **Pass** | The zip is unpacked in the test: one valid PDF per report (`%PDF-` … `%%EOF`), unique file names for businesses that share a name. The CSV parses back with the eight columns from the brief plus a status column. A sample PDF was rendered and read by eye |
| Pack purchase (test mode) grants credits | **Pass at the webhook; a real test purchase needs Stripe test keys** | `tests/db/webhook.test.ts`: a signed pack event grants credits once, also when delivered twice; packs require lifetime access |
| Unit test: every product price > max delivery cost + fees | **Pass** | `tests/unit/pricing.test.ts`: packs, lifetime at every tier, each credit-funded action, and an audit with its Fix Kit at twice the estimate |

### Built

- **Find businesses**: search a service and a city (one Google Maps search, first 100 results; businesses already in the top 3 start unticked), or upload a CSV of up to 200 rows (name and city required; quoted fields, semicolons and common header names are understood).
- **Prospect report** per business: Google Maps 5×5 grid on the standard queue, AI 3×3 grid, a quick audit (homepage only, P0 and P1 findings), and an opener. 2 credits each or your own keys; a report that fails gives its credits back.
- **Opener**: one or two sentences built only from the report's numbers ("At 7 of 9 spots around Austin, AI assistants named Smile Dental and not …"). When a business does well everywhere there is no opener; it is not padded.
- **Batch page**: progress, per-row status, link to each live report, PDF per report, "Download all PDFs (zip)", "Export CSV".
- **PDF** (`src/lib/pdf/report-pdf.tsx`): the content of the live report on one A4 page: heatmaps as vector shapes, audit findings, white-label footer with "Get this fixed by {agency}", the "AI answers vary" line and a QR code to the live link. Also available from a business's share link card.
- **Batches survive restarts**: one worker holds a batch at a time (claimed in the database), every step can be repeated, and cron continues batches that are waiting for the Maps queue.

### Worth knowing

- Lookups cost money before any report exists. On your own DataForSEO key they are rate limited (60 an hour). On included scans they also need a balance that could pay for a report and are limited to 10 searches or 3 CSV checks a day, so they cannot be used as a free search service.
- The PDF is light on white paper for printing and email; the site and the live report stay dark.
- No email addresses are collected and nothing is sent from RankbyAI (brief 7.7). Spreadsheet formulas in exported names are neutralised.

### Needs the operator

1. A DataForSEO login (and AI keys) to run a real search and a real batch.
2. Stripe test keys for one test pack purchase.

## M4 — Local AI Audit and Fix Kit (17 Nov 2026)

**Status: built and tested with simulated vendors. A run on a real business with real keys, and a look at the screens in a signed-in browser, are still open.**

### Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| An audit returns a score, category scores, "% of checks ran", and findings per priority only when evidence exists | **Pass with simulated vendors; needs real keys** | `tests/db/audit.test.ts`: score 0–100, six category scores that equal the share of passed checks among those that ran, a finding for every failed check and for nothing else, each with evidence, a fix and a P0–P3 priority; checks that could not run carry a reason and are not findings |
| Review maths matches a hand calculation | **Pass** | You 38, competitors 96 / 112 / 205 → median 112, gap 74, ÷ 3 months = 25 a month; ÷ 6 months = 13. Same numbers in the finding, its evidence and on the page |
| The service-gap list cites competitor URLs | **Pass** | Every missing service carries a URL that starts with a competitor's site and came from that site's own links; the model (when used) can only pick URLs from the list it was given |
| Page maths CSV downloads | **Pass (content); browser click not exercised** | 6 services × 4 areas = 24 rows + header, with suggested slug and title; lists are editable and the CSV follows the saved lists. The route answers 401 when signed out. Clicking the download in a browser waits for a Google sign-in |
| Fix Kit JSON-LD validates in the schema validator | **Pass** | validator.schema.org on the generated markup: `Dentist` 0 errors, 0 warnings; `FAQPage` 0 errors, 0 warnings. Structure also asserted in `tests/unit/fixkit.test.ts` |
| No finding contains a number absent from stored inputs | **Pass** | For every stored finding, each number in its title and fix appears in its evidence (`tests/db/audit.test.ts`, and per check in `tests/unit/audit-checks.test.ts`) |

### Built

- **Audit runner** (`src/lib/audit/run.ts`): estimate → confirm → run. Reuses the business's latest Maps and AI scans; when there is none it runs one Maps lookup and one 1×1 AI check itself. Competitors are the three businesses that hold the map pack most often around the business. One audit = 1 credit on included scans, with the credit returned if the audit fails.
- **Checks and score** (part 1): six weighted categories; a check without its input is "not checked" and leaves the score's denominator.
- **Screens** (`/app/audit`, `/app/audit/{id}`): score ring with the change since the previous audit, category bars with "n of m checks ran", findings grouped P0–P3 with evidence rows and source links, a "you and the map pack" table, review maths with a months selector, the editable page plan with CSV download, passed and not-checked lists, cost.
- **Fix Kit** (`src/lib/audit/fixkit.ts`): LocalBusiness schema (right subtype, name/address/phone from the Google profile), FAQPage schema, llms.txt draft and checklist are assembled in code from stored facts. Only the description and the 8 FAQs come from one model call, and any sentence or answer containing a number that is not in the source text is dropped. Copy button per block. No ratings or opening hours are put in the schema, because we hold no verified values for them.
- **API**: `POST /api/audits`, `GET/PATCH /api/audits/{id}`, `GET /api/audits/{id}/pages.csv`, `GET/POST /api/audits/{id}/fix-kit`. Cron closes audits whose worker died.

### Worth knowing

- Without an OpenAI key the audit still runs: services are read from page addresses and navigation, and the Fix Kit gives schema, llms.txt and checklist with a note that the description and FAQs need a key.
- The website fetcher only connects to public addresses (no internal hosts), follows redirects by hand and stops at 2 MB per page.
- The share link already shows the audit score and top findings (built in M3, now fed by real audits).
- An audit has a time budget: the AI check runs alongside the rest, the website crawl stops after 75 seconds and keeps the pages it has, and a check that ran out of time is "not checked", never "missing". This keeps a slow site from running into the 300-second function limit.
- A Fix Kit whose model call failed can be built again, also on included scans.

### Needs the operator

1. **Real keys** (DataForSEO at least; OpenAI for service extraction and the Fix Kit text) to run an audit on a real business and confirm the cost estimate.
2. **Sign in with Google once** on a deployment or locally, so the signed-in screens can be reviewed in a browser. Password sign-in is off on purpose.

## Platform switch — Neon and Google sign-in (17 Nov 2026)

**Status: done and verified locally and against the Neon gateway. Storage credentials and a Google OAuth client of your own are left for the operator.**

M1–M3 were built on Supabase. The operator asked for Neon and Google sign-in, so the database layer, sign-in and file storage were replaced. Nothing else changed: same schema, same policies, same functions.

### What was re-verified after the switch

| Check | Result | Evidence |
|---|---|---|
| Whole test suite on the new local stack (Postgres 17 + PostgREST in Docker) | **Pass** | `pnpm test`: 201 tests. This re-runs every M1–M3 database criterion (RLS, ladder, concurrent checkout, webhook replay, scan engine, free-check limits, schedules, share links) |
| RLS on every table | **Pass** | `tests/db/rls.test.ts` (77 checks) locally. On Neon: 31 of 31 tables have RLS on, 53 policies |
| RLS through the real Neon gateway | **Pass** | `node scripts/cloud-check.mjs`: 57 checks, on both branches. Forged, expired and wrong-audience tokens rejected; a request with no token rejected; visitors read the price ladder only; two users cannot read or change each other's rows; a user cannot upgrade their plan, grant credits, create orders or read key ciphertext; the sign-in schema is not reachable. The script removes everything it creates |
| Sign-in end to end | **Pass, up to the Google consent screen** | Locally: the Google button reaches `accounts.google.com`. With a throwaway account: session → first-visit workspace → dashboard → sign-out, and a non-admin is sent away from `/admin`. The throwaway account was deleted and email-and-password sign-in is now off. **Not done:** a sign-in with a real Google account (needs a person) |
| No secrets in client bundles | **Pass** | `pnpm check:secrets` after `pnpm build` |

### How it works now

- The running app never opens a Postgres connection. The server signs a five-minute token naming a role (`anonymous`, `authenticated` + user id, `service_role`) and calls the Data API; the database switches to that role and RLS decides. The gateway only holds the public key (`public/.well-known/jwks.json`).
- `service_role` has no "bypass RLS" attribute. It gets its access from one explicit policy per table, so RLS stays on for every role.
- First sign-in creates the profile and a personal workspace in one database function (`ensure_user`).
- Free check: the emailed link is gone. The visitor enters business and city, signs in with Google, and the check runs. One check per Google account, three per network per day, daily budget as before.
- Claiming a scan for processing is one SQL function (`claim_scan`) that uses the database clock.

### Three things found by testing against Neon (all fixed)

1. **A signed-in request could arrive without its identity.** The first request on a newly opened gateway connection runs as `authenticated` but without the token's claims. RLS then matches nothing and the request "succeeds" with an empty result, which looks exactly like "no data yet". It never returned another user's data. Fix: the database now refuses such a request with error `RB001` before touching any row, and the server sends it again (up to eight times; four was too few: on 18 Nov 2026 a first sign-in on production was refused five times in a row and showed an error page). On a cold start 22 of 60 parallel requests needed the retry; all then returned the right data. Tests: `tests/db/rls.test.ts`, `tests/unit/db-retry.test.ts`, and the 60-request check in `scripts/cloud-check.mjs`.
2. **The API roles cannot use Neon's `auth` schema**, so policies that asked for the user id directly failed with "permission denied". The user-id function now runs with its owner's rights.
3. **The gateway keeps its own copy of the schema.** After a migration it must be refreshed (Neon console, CLI or API); `notify pgrst` alone is not enough. This is in `docs/SETUP.md`.

### Needs the operator

1. **Vercel environment variables for the database and sign-in.** The values are in `.env.neon.local` on the build machine (gitignored): `DATA_API_URL`, `DATA_API_JWT_PRIVATE_JWK`, `NEON_AUTH_BASE_URL`, plus a new `NEON_AUTH_COOKIE_SECRET`.
2. **Storage credential** (Neon console → Connect → Storage): the five `STORAGE_*` variables. The private bucket `rankbyai-files` exists. Until then logo upload is off and raw AI answers are not archived.
3. **Your own Google OAuth client** before real users sign in. Neon's shared test credentials show Neon's name on the consent screen.
4. **Trusted domain**: add the deployed origin in Neon Auth before testing sign-in on a deployment.
5. **Two Neon branches.** `main` = production (values in `.env.neon.local`), `preview` = preview deployments and Stripe test mode (values in `.env.neon.preview.local`). Put the preview values in Vercel's Preview environment and the production values in Production. Test purchases only ever go to `preview`: on production the webhook ignores test-mode events and checkout refuses a test key (`tests/unit/stripe-mode.test.ts`).
6. **Public key address.** The Data API reads the public key from the GitHub address of `public/.well-known/jwks.json`. Do not rename the repository, make it private or move that file without first pointing the Data API at another address (see docs/SETUP.md). After go-live, switch it to the site's own domain.
7. **An empty bucket to remove or keep.** I created a public-read bucket `rankbyai-public` in Neon Object Storage while looking for a home for the public key, and ended up not using it. It is empty. Delete it in the Neon console, or keep it for public assets.

### Also checked after the review

- The cloud check now uses the app's own database client against Neon (57 checks, both branches): single-row inserts and updates, the session query with its embedded workspace, scalar function results (`use_credits` returns a bare true/false), upsert, counts and combined filters.

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
| e | Free check: second attempt with the same email refused, 4th from the same IP/day refused, daily cap queues | **Pass** | `tests/db/free-check.test.ts` (since the platform switch the email is the verified Google account; a second request by the same account shows the first report and runs nothing) |
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
- Sign-in (`/login`, `/signup`; magic link at the time, Google since the platform switch), app shell with the sidebar, dashboard, billing page.
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
2. ~~A hosted Supabase project.~~ Replaced by Neon; see "Platform switch" above.
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
