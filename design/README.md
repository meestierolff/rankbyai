# Handoff: RankbyAI landing page (rankbyai.live)

Written for **Fable 5.2**, or any developer or coding agent implementing the page.

## Overview
This is the marketing landing page for **RankbyAI**. RankbyAI is local AI visibility software that customers pay for once. It shows whether ChatGPT, Claude, Perplexity and Gemini recommend a local business for prompts like "best {service} in {area}". It checks this at every point on a map grid and shows the Google Maps rank on the same grid.

The page has five jobs:
1. Explain the product.
2. Show it working, through an auto-playing product tour and an interactive grid.
3. Make the pay-once pricing argument with a price counter, a calculator and a comparison table.
4. Answer objections in the FAQ.
5. Drive clicks on "Get lifetime access".

**Audience:** local-marketing agencies and freelancers in the US and UK. Copy is in English with US spelling. Prices are in USD.

## About the design files
`RankbyAI Landing v2.dc.html` is a **design reference built in HTML**. It shows the intended look, copy and behavior. It is not production code to ship as-is. It runs on a small prototype runtime (`support.js`) that uses `{{ }}` template holes and a logic class.

**Your task:** rebuild the page in the target codebase using its usual patterns. If there is no codebase yet, the recommended stack is:
- **Next.js (App Router)** or **Astro**, both good for a static-first marketing page.
- **Tailwind CSS**, with the tokens below set up in `tailwind.config`.
- Interactive parts as client components: the tour, the grids, the Fix Kit tabs, the calculator and the sticky bar.

To view the reference, open `RankbyAI Landing v2.dc.html` in a browser with `support.js` and `assets/` next to it. Treat its copy as the source of truth for any text not quoted below.

## Fidelity
**High-fidelity.** Colors, type, spacing, copy and interactions are final. Recreate them pixel-close. All business names in the mock screens (Lone Star Plumbing, Capitol City Plumbing, and so on) are **sample data**. Keep them labeled "Sample data" where the design does.

---

## Design tokens

### Colors (dark theme only)
| Token | Hex | Use |
|---|---|---|
| `bg` | `#0B0B0B` | Page background |
| `bg-alt` | `#111111` | Alternating section bands, mock frames |
| `surface` | `#141414` | Cards |
| `surface-2` | `#161616` | Highlighted card / table column, popovers |
| `inset` | `#0E0E0E` | App windows, inputs, segmented-control wells |
| `line` | `#1C1C1C` | Section borders, window dividers |
| `border` | `#262626` | Card borders |
| `border-strong` | `#2E2E2E` | Pills, chips, secondary buttons |
| `fg` | `#F5F5F5` | Primary text, primary button background |
| `fg-2` | `#D4D4D4` | Body text inside dark code/cards |
| `muted` | `#A1A1A1` | Secondary text |
| `dim` | `#8A8A8A` | Tertiary text, captions |
| `faint` | `#6B6B6B` | Sidebar section labels, empty grid cells text |
| `danger` | `#EF5B5B` | Scarcity dot, "seats left", ✕ marks |
| `danger-ring` | `rgba(239,91,91,.15)` | 4px halo around danger dot |

**Data colors**, written as OKLCH. Hex values are close sRGB equivalents for fallback.
| Token | OKLCH | ≈Hex | Use |
|---|---|---|---|
| `g1` | `oklch(0.72 0.16 150)` | `#3FBF6A` | AI #1 cell, Maps rank 1–3, positive deltas, "your business" highlight |
| `g2` | `oklch(0.55 0.12 150)` | `#2E8A4E` | AI #2 cell |
| `g3` | `oklch(0.40 0.08 150)` | `#2A5A38` | AI #3 cell |
| `none` | `#232323` | | AI cell, business not mentioned |
| `amber` | `oklch(0.80 0.15 85)` | `#E6B23A` | Maps 4–10, P2 badge, audit 50–69 |
| `orange` | `oklch(0.70 0.17 50)` | `#E57F35` | Maps 11–20, P1 badge, negative delta, audit <50 |
| `red` | `oklch(0.60 0.19 25)` | `#D9473C` | Maps 20+, P0 badge |
| `copied` | `oklch(0.62 0.15 150)` | `#2FA35A` | "Copied" button state |

Window dots in the app mocks use `#FF5F57`, `#FEBC2E` and `#28C840`.

### Typography
- **Geist** (400/500/600/700) for all UI and display text. Load from Google Fonts or `next/font`.
- **Geist Mono** (400/500/600) for numbers, prices, prompts, URLs and code.
- Turn on `-webkit-font-smoothing: antialiased`.

| Role | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|
| H1 (hero) | `clamp(44px, 6.6vw, 88px)` | 600 | 1.02 | -0.045em |
| H2 (section) | `clamp(34px, 4.4vw, 58px)` | 600 | 1.05–1.08 | -0.035em |
| H3 (feature) | `clamp(32px, 4vw, 52px)` | 600 | 1.06 | -0.035em |
| Final CTA H2 | `clamp(44px, 6vw, 80px)` | 600 | 1.0 | -0.045em |
| Lead paragraph | `clamp(17px, 1.4vw, 20px)` | 400 | 1.6 | 0 |
| Eyebrow | 14px uppercase | 600 | 1 | 0.06em |
| Body | 15–17px | 400–500 | 1.5 | 0 |
| Caption | 13–14px | 400 | 1.5 | 0 |
| Big stat (mono) | `clamp(36px, 4vw, 52px)` | 600 | 1 | -0.03em |
| Price (hero card) | `clamp(64px, 8vw, 96px)` | 600 | 1 | -0.05em |

Use `text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs.

### Spacing, radius, shadow
- **Container:** `max-width: 1200px`, centered, side padding `clamp(20px, 4vw, 40px)`. The tour uses `max-width: 1080px`.
- **Section vertical padding:** `clamp(80px, 10vw, 128px)`. Stat bands use `clamp(48px, 6vw, 72px)`.
- **Gaps:** use flex or grid `gap` everywhere. Common values are 8, 12, 14, 16, 18, 22, 24 and 28px.
- **Radius:**
  - 7–10px: buttons and small controls
  - 12px: app windows
  - 14–16px: cards
  - 18–22px: big cards and the tour frame
  - 24px: mock frames
  - 999px: pills
- **Shadows:**
  - Tour frame: `0 40px 120px -40px rgba(0,0,0,.9)`
  - Popover: `0 30px 60px -20px rgba(0,0,0,.8)`
  - Price card glow: `0 40px 100px -40px rgba(255,255,255,.08)`
  - Caption pill: `0 10px 30px rgba(0,0,0,.5)`

### Buttons
- **Primary:** `#F5F5F5` background, `#0B0B0B` text, weight 600. Hover changes the background to `#FFFFFF`.
  - Header size: 9×14px padding, 15px text, radius 9px.
  - Hero and final CTA size: 17×26px padding, 18px text, radius 12px.
- **Label format:** always `Label — $149 →`. Keep the label text and the price in **one** inline element. The arrow is a separate element with an 8–10px gap.
- **Secondary:** 1px `#2E2E2E` border, transparent background.
- **Segmented controls:** an `#0E0E0E` well with a 1px `#262626` border, radius 12px and 5px padding. The active segment has an `#F5F5F5` background with `#0B0B0B` text. Inactive segments are transparent with `#A1A1A1` text.

---

## Page structure, top to bottom
Sections alternate between `bg` and `bg-alt`. Each band change has a 1px `line` border on top and bottom.

### 0. Header (sticky)
- **Bar:** `position: sticky; top: 0`. Background `rgba(11,11,11,.82)` with `backdrop-filter: blur(12px)`, and a 1px `#1C1C1C` bottom border.
- **Left:** the logo image `assets/logo-80.png` at 34px tall. Next to it, a two-line wordmark:
  - "rankbyai" in 600 17px plus ".live" in `#8A8A8A`.
  - Below that, "AI VISIBILITY" in Geist Mono 500 10px, letter-spacing 0.12em, `#8A8A8A`.
- **Center nav** (15px, `#A1A1A1`, hover `#F5F5F5`):
  - Features → `#features`
  - How it works → `#how`
  - Pricing → `#pricing`
  - FAQ → `#faq`
- **Right:** "Log in" text link, then the primary button "Get lifetime access — $149 →".
- **Mobile:** the row wraps. Consider collapsing the nav into a menu below about 760px.

### 1. Hero (`#top`)
Centered column with a 28px gap.
1. **Scarcity pill:** 999px radius, `#111` background, `#262626` border, 8×16px padding. Contents: a red dot with halo, then "**3 left at $149**" (fg, 600, `nowrap`), then "· then $159" (muted).
2. **H1:** "Local AI visibility software you pay for once." Max width 980px.
3. **Lead** (max 760px): "See if ChatGPT, Claude, Perplexity and Gemini recommend a business at every point on a map grid, next to its Google Maps rank. **Pay once, not every month.** A 7×7 scan costs about 10¢ on your own DataForSEO key." The bold sentence is set in `fg`.
4. **Savings strip card:** max 860px, `#111`, radius 18px.
   - Caption: "One year of monthly 7×7 scans on all four AI engines, for 10 clients".
   - Three centered columns (auto-fit, min 170px), each a mono number above a label:
     - **$1,188** in `#7A7A7A`, struck through in `#EF5B5B` (2px), label "A $99/month tracker".
     - **$161**, label "RankbyAI, year one".
     - **$12** in `g1`, label "Every year after, on your keys".
5. **Primary CTA:** "Get lifetime access — $149 →".
6. **Small print** (14px, dim): "One payment. No monthly fee. No credits. 14-day refund, no questions."
7. **Text link:** "See how it works ↓", linking to `#tour`.

### 2. Product tour (`#tour`), auto-playing
- **Frame:** `#0E0E0E`, 1px `#262626` border, radius 22px.
- **Window bar:** three dots plus a URL pill. The URL changes per step:
  - `rankbyai.live/app/ai-grid`
  - `rankbyai.live/app/compare`
  - `rankbyai.live/app/auditor`
  - `rankbyai.live/app/reports`
- **Body:** min height 440px, 96px bottom padding to leave room for the caption pill.
- **Caption pill:** absolutely positioned, bottom 22px, centered. White background, dark text. Contains a 30px black circle with the step number, then the caption.

**Steps.** Each lasts 6s with linear progress. They auto-advance and loop.

| # | Label | Caption | Content |
|---|---|---|---|
| 01 | Scan | Scan the AI answers across a map grid | Title "Lone Star Plumbing". Subtitle "Sample data · "best plumber in Austin, TX" · 7×7 grid". Engine tabs (ChatGPT / Claude / Perplexity / Gemini, each with its coverage %). Two 7×7 grids side by side: "{Engine} recommends you" with "hits/49", and "Google Maps rank" with "top-3 at N/49". |
| 02 | Compare | Compare any two scans, point by point | "Compare scans · 14 Oct → 14 Nov 2026 · points recommended out of 49". Five stat cards: ChatGPT **+9** (22→31), Claude **+6** (15→21), Perplexity **+4** (18→22), Gemini **−2** (19→17, orange), Maps top-3 **+2** (16→18). Note card below. |
| 03 | Audit | Get fixes ranked P0 to P3, with evidence | Score ring 64/100 (`g1` conic fill at 64%), "5 fixes, highest impact first", chips Profile / Website / Schema / AI answers. Four issue rows: P0, P0, P1, P2. |
| 04 | Share | Send a white-label report with a live link | "Client report" popover, centered, max 560px. Read-only field `youragency.com/r/lone-star`. "Copy link" button: on click it shows "✓ Copied" on `copied` green for 1.8s, then reverts. Chips: "White-label · your logo" and "↓ Download PDF". |

**Step bar** under the frame: four equal columns.
- Each column has a 2px track (`#262626`) with a fill (`#F5F5F5`), a mono "01" in dim, and the label (600, `clamp(14px, 1.6vw, 18px)`).
- Fills: steps before the current one are 100%. The current step animates 0→100% over 6s, linear. Later steps are 0%.
- The label is at opacity 1 when active and 0.55 otherwise.
- Clicking a column jumps to that step and restarts its progress.
- Implement the timing with a CSS keyframe on the fill element, re-keyed per step. Advance on `animationend`.

### 3. Cost band (`bg-alt`)
Three stat columns (auto-fit, min 240px):
- **~$0.002**, "per grid point", "Maps + four AI engines, billed to your DataForSEO key"
- **~$0.10**, "for a full 7×7 scan", "49 points, one prompt, four engines"
- **$0**, "markup from us", "No monthly fee. No usage cap."

Footnote (13px, dim): "Rates are DataForSEO's and can change. You see the estimate before every scan."

### 4. The problem
Two columns (auto-fit, min 420px).
- **Left:**
  - Eyebrow "The problem".
  - H2 "You're renting a feature you could own."
  - Lead: "AI visibility tracking now lives inside monthly SEO plans. Good tools, but the meter never stops: a plan for the tracker, credits for the scans, another tool for the reports you use to win clients."
- **Right:** four cards, each with a red "✕" and 17px text:
  - Credits run out. Your clients' customers keep asking ChatGPT.
  - Bigger grid, more engines, bigger bill. So you scan less often.
  - Tracking in one tool, fixes in another, prospect reports in a third.
  - The plan renews whether you won a client that month or lost one.
- **Pull quote** below the cards: 2px left border in `fg`, weight 500, `clamp(20px, 2vw, 26px)`. Text: "A 7×7 scan costs about a dime. You've been paying for the meter."

### 5. The fix (`bg-alt`, centered)
- Eyebrow "The fix".
- H2 "Own your AI visibility software. Bring the key. Pay cost."
- Lead: "RankbyAI connects to your own DataForSEO account. Every AI answer and Maps lookup runs on your key at DataForSEO's price. We never touch your usage, so we never need to cap it or charge you for it."
- **Three cards** joined by 28px × 1px connector lines (`#333`). Each card has a mono number, a 19px title and body text:
  - 01 **RankbyAI**: "Paid once. Runs the scans, audits, Fix Kits and reports."
  - 02 **Your DataForSEO key**: "Pay-as-you-go. You see every cent." This card is highlighted with a 1px `fg` border and a `0 0 0 6px #1C1C1C` outer ring.
  - 03 **At cost**: "About $0.10 per 7×7 scan. Or buy included scan packs."

### 6. Features (`#features`)
Eyebrow "Four tools, one payment". H2 "Track it. Fix it. Report it. Sell it."

**Each feature block contains:**
- A pill (mono number) followed by "Name · Subtitle".
- An H3 and a lead paragraph.
- A flex-wrap row:
  - The mock (`flex: 1 1 560px`) in a `#111` frame with radius 24px, padding `clamp(16px, 3vw, 40px)`, no bottom padding. The app window inside has a 12px top radius and no bottom border.
  - A checklist (`flex: 1 1 300px`), aligned to the bottom. Each item has a 26px `#1F1F1F` circle with "✓" and 17px muted text.

**App mock sidebar** (170px, right border):
- Logo at 18px plus "rankbyai.live".
- Nav items: Dashboard, Businesses, AI Grid, Auditor, Fix Kit, Prospect reports. The active item has a `#1C1C1C` background and `fg` text.
- Then "Developers" (12px, faint) and "API & MCP".

**Feature blocks:**
- **01 Track · AI Grid Tracker.**
  - H3: "See where AI recommends you, point by point."
  - Mock: 4 engine tabs, a 7×7 AI grid (cells clickable), and a side panel. The panel shows the selected point (e.g. "Point D4", "At the business pin" or "1.2 mi NE of the pin"), "{Engine} recommends" with the top 3 names (the user's business highlighted in `g1` with a green-tint background), and the Maps rank.
  - Checklist:
    - ChatGPT, Claude, Perplexity and Gemini on the same grid, one tab each
    - Google Maps rank on the same points, side by side
    - Click any point to see who AI recommends there instead
    - Every scan kept. Compare any two, point by point
- **02 Audit · AI Visibility Auditor.**
  - H3: "Find out why AI skips the business, in priority order."
  - Mock: score card (amber ring, 64) and three expandable issue rows built with `<details>`, the first one open. Each row shows **Evidence:** and **Fix:** lines.
- **03 Fix · Fix Kit.**
  - H3: "The fixes, written and ready to paste."
  - Mock: four pill tabs (AI-ready profile / FAQ / Schema / llms.txt) above a code window. The window header shows the filename: `profile.txt`, `faq.md`, `localbusiness.jsonld` or `llms.txt`.
- **04 Sell · Prospect reports.**
  - H3: "Turn a niche and a city into a pipeline."
  - Mock: filter chips (niche: plumbers / city: Austin, TX / grid: 5×5), "25 reports ready" in `g1`, and a five-row table: Business / AI cover / Maps avg / Audit (colored chip) / Report link · pdf.
  - The table scrolls horizontally below 620px.

### 7. How it works (`#how`, `bg-alt`)
H2 "From signup to first AI grid in about five minutes." Three cards, each with a 44px circle containing a number (2px `fg` border):
1. **Connect your key.** "Paste your DataForSEO login and we test it. No account yet? Sign-up takes a few minutes, or buy a scan pack and skip this step."
2. **Add a business.** "Search it by name and confirm the Google listing."
3. **Run a scan.** "Pick a prompt, grid size and engines, see the cost, hit run. The grid fills in point by point."

### 8. Key security
Left: H2 "Your key stays your key." Right: a 2×2 card grid with mono labels /01–/04:
- **Encrypted at rest**: "Your key is encrypted before it reaches the database."
- **Write-only**: "Replace or delete it any time. Nobody can read it back, including you."
- **Server-side only**: "Every request runs on the server. The key never reaches a browser."
- **Cost before, cost after**: "Estimate shown before every scan, actual cost logged after."

⚠ Only ship these if they are true of the product.

### 9. API + MCP (`bg-alt`)
- **Left:** H2 "Hand it to your AI agent." Lead: "Every feature is available over a REST API and an MCP server. Connect Claude, ChatGPT or your own scripts and let the agent run scans, audits and prospect reports for you."
- **Right:** a chat card set in mono 14px, with header "MCP · rankbyai.live":
  - you › Scan every dentist in Bristol for "best dentist in Bristol" and draft reports for the five weakest.
  - → runs 25 AI grid scans on your key
  - → audits the 5 lowest scores
  - → builds 5 white-label reports
  - agent › None of the five are recommended by ChatGPT outside the city centre. Reports and share links are ready.

### 10. Pricing (`#pricing`), lifetime deal
- Eyebrow "Lifetime deal". H2 "$149 once. The price goes up $10 every 5 sales."
- **Price card** (2px `#3A3A3A` border, radius 22px):
  - "$149 one-time", with "Next: **$159**" (danger) on the right.
  - Five segment bars, 14px tall. Sold segments are `#3A3A3A`. Remaining segments have an `rgba(239,91,91,.18)` fill and a 1px `#EF5B5B` border.
  - "● **3 of 5** left at **$149**".
  - **Price ladder:** seven bars, from price−2·step to price+4·step.
    - Labels: GONE, GONE, NOW, NEXT, LATER, LATER, LATER.
    - Heights: 36px + 12px per step.
    - GONE bars have a dashed border and struck-through price. The NOW bar has a 2px `fg` border and a red tag. The rest are `#1A1A1A`.
  - Full-width CTA "Lock in $149 now →".
  - Caption: "The counter sets the price, not a timer. When these 3 go, it's $159."
  - Refund box: "14-day refund, no questions." / "Connect your key and scan real clients. If it isn't for you, email us within 14 days and get your money back."
- **Right column:**
  - **"Everything included"** checklist:
    - AI Grid Tracker: ChatGPT, Claude, Perplexity and Gemini next to Google Maps rank
    - Unlimited scans on your own key (no caps from us)
    - Scan history and compare any two scans
    - AI Visibility Auditor: 0–100 score, P0–P3 fixes with evidence
    - Fix Kit: profile text, FAQ, schema, llms.txt
    - Bulk white-label prospect reports, live links and PDFs
    - REST API + MCP server
    - No DataForSEO account? Included scans in packs, optional
  - **"The math"** card:
    - A typical $99/month tracker: $1,188 /yr
    - RankbyAI, once + about $0.10 per 7×7 scan on your key: $149
    - Footer line: "Scan 10 clients monthly on a 7×7 across all four engines for a year and you've spent about $12 on data."

### 11. Compare (can be toggled off)
- Eyebrow "Compare". H2 "The same AI grids, without the subscription."
- Lead: "We're not the only AI visibility tracker, and won't pretend to be. The difference is how you pay."
- **Table:** min width 760px, scrolls horizontally on small screens. The RankbyAI column has a `#161616` background.

| | RankbyAI ($149 once + your DataForSEO key) | Local Falcon (Geo-grid AI scans) | BrightLocal (Track plan) |
|---|---|---|---|
| AI visibility | ChatGPT, Claude, Perplexity, Gemini on a grid, next to Maps rank | ChatGPT, Gemini, AI Overviews, AI Mode and Grok on a geo-grid | Local AI Visibility Tracker |
| How you pay | Once, then data at cost | Monthly plans and credits | Monthly plan |
| Monthly fee | — None | Yes | Yes |

Footnote: "From public product pages, checked 17 Nov 2026. Both are strong products. If you want a fully managed subscription, they're a good choice."

⚠ **Legal and honesty rule:** never claim RankbyAI is the first or only tool. Re-check competitor facts before every publish, and update the date.

### 12. Run your own numbers (`bg-alt`), calculator
- **Left, "Your numbers":**
  - Keywords slider, 1–100, default 10.
  - Grid size segmented control: 3×3 / 5×5 / 7×7 / 9×9, default 7×7.
  - AI engines: four toggles, all on.
  - How often: Weekly / Monthly, default Monthly.
- **Right:**
  - "Estimated data cost on your DataForSEO key", shown as a big mono value "$X / year".
  - Formula line in mono, e.g. `120 scans × 49 points × ~$0.0020`.
  - Two bars:
    - "Typical $99/month plan" with its annual value. Bar color `#4A4A4A`, caption "every year".
    - "RankbyAI: $149 once + data" with year-one total. Bar color `fg`, caption "year one, then data only".
    - Bar widths are relative to the larger value. Animate width over 0.3s with ease.
  - Note text (14px, dim).

### 13. FAQ (`#faq`)
Left: H2 "Straight answers about AI visibility tracking." Right: an accordion built with `<details>`. Each row has a 1px `#262626` bottom border, 24px vertical padding, an 18px/500 question and a chevron. Answers are 16px muted. Questions:
1. What's the catch with "pay once"?
2. Why does the price keep going up?
3. Do I need a DataForSEO account?
4. What does a scan really cost?
5. Where do the AI answers come from?
6. Is RankbyAI the only tool that does this? (Answer: **No**, followed by the differences.)
7. Can my clients see the results?
8. Can I use it with Claude or ChatGPT?

Take the exact answers from the HTML file. The price, step and tier values inside answers are dynamic.

### 14. Final CTA
- H2 "3 left at $149."
- "The next 5 buyers pay **$159**. You'll pay for the data either way. Stop paying for the meter."
- Primary CTA.
- Small print: "One payment · Your own key · 14-day refund".

### 15. Footer
- **Left:** logo (30px) with "rankbyai.live", then "Not endorsed by OpenAI, Anthropic, Perplexity, Google or DataForSEO."
- **Right:** Terms / Privacy / Refund policy / Contact.
- **Bottom padding:** 120px, so the sticky bar never covers the footer.

### 16. Sticky buy bar
- Fixed to the bottom. Background `rgba(11,11,11,.9)` with blur, 1px top border.
- **Left:** a red dot, then "**$149** lifetime" with "**3** left, then $159" below (the 3 in danger).
- **Right:** primary button "Lock it in →".
- Hidden (`translateY(110%)`) until `scrollY > 640`, then slides in over 0.3s with ease.

---

## Interactions & behavior (summary)
- **Grid cells** (tour step 01 and feature 01) are buttons. Clicking one selects that point and draws a ring: `0 0 0 2px #0E0E0E, 0 0 0 4px #F5F5F5`. Selection is shared between both grids. The default selection is the center cell.
- **Grid reveal:** on load and each time the tour loops back to step 01, cells fade and scale from 0.5 to 1 over 0.35s with ease. Each cell is delayed by `(row + col) × 28ms`, so the grid fills in as a diagonal sweep.
- **Engine tabs** switch the AI grid, the coverage stat and the side-panel recommendations.
- **Copy link** in tour step 04 shows the copied state for 1.8s. In production, use `navigator.clipboard`.
- **Fix Kit tabs** swap the code window content.
- **Calculator:** all outputs update live.
- **FAQ and audit rows** use native `<details>`. You can rotate the chevron on `[open]`.
- **Hover:** primary buttons go to pure white. Nav links go from muted to fg.
- **Smooth scrolling** for anchor links. Anchor targets need about 70–90px `scroll-margin-top` to clear the sticky header.
- **Reduced motion:** with `prefers-reduced-motion`, skip the grid reveal and stop the tour from auto-advancing (keep it clickable).

## State and data
**Pricing counter.** In production these values must come from the backend. They are props in the prototype.
- `price` (149)
- `priceStep` (10)
- `tierSize` (5)
- `seatsLeft` (3)
- `nextPrice = price + priceStep`
- `refundDays` (14)
- `monthlyPlan` (99)
- `showCompare` (true)

All of these appear in the header, hero pill, CTAs, pricing card, ladder, final CTA and sticky bar. Render them from one source.

**Cost model.** `DataForSEO cost per grid point = maps + Σ(selected engines)`, which is about $0.002 with all four engines. The prototype uses $0.0004 for Maps and for each engine. Formulas:
- `scan7x7 = 49 × costPerPoint`, about $0.10.
- Hero strip: `yearData = 10 clients × 12 months × scan7x7`. Year one is `price + yearData`. Every later year is `yearData`. The plan cost is `monthlyPlan × 12`.
- Calculator: `scansPerYear = keywords × (52 | 12)`. `dataPerYear = scansPerYear × gridPoints × costPerPoint`.

Confirm the real DataForSEO rates and keep them in one config file.

**Demo grid data.** This is deterministic sample data. Port `point()` from the logic class, or replace it with a captured real scan.
- Distance from the center is normalized to 0–1.
- A seeded hash noise (`sin`-based) gives each engine a different recommendation threshold: ChatGPT .52, Claude .46, Perplexity .62, Gemini .40.
- Maps rank is about `1 + d^1.3 × 21 ± noise`. Anything above 20 shows as "20+".

**Local UI state:** tour step and cycle; selected engine; selected cell; copied flag; Fix Kit tab; calculator inputs; sticky bar visibility.

## SEO and meta (suggested)
- `<title>`: RankbyAI — Local AI visibility software you pay for once
- Meta description: See if ChatGPT, Claude, Perplexity and Gemini recommend a local business at every point on a map grid, next to its Google Maps rank. Pay once. Runs on your own DataForSEO key.
- Set OG and Twitter image, canonical URL `https://rankbyai.live/`, and a favicon (cut from `assets/logo.png`).
- Add FAQPage JSON-LD for section 13, and SoftwareApplication JSON-LD with `offers.price` matching the live price.

## Accessibility
- Grid cells are buttons. Give them `aria-label`s, e.g. "Point D4, ChatGPT rank 2, Maps rank 5".
- The tour needs a pause button for WCAG 2.2.2, because it auto-advances.
- All text meets 4.5:1 contrast on its background. Keep `#8A8A8A` as the dimmest text color used on `#0B0B0B`.
- Use one `<h1>`, then `h2` for sections and `h3` for features.

## Assets
- `assets/logo.png`: 997×539 transparent PNG, the folded street map with colored rank dots. It was cut from the user-supplied JPEG, which had a fake checkerboard; panel interiors were flattened to `#0E0E0E`. The logo is designed for dark backgrounds only.
- `assets/logo-80.png`: 148×80 version for the header (34px), footer (30px) and app mocks (18px).
- No icon font is used. Glyphs are plain text: ✓ ✕ → ↓ ↻ ⌄. Lucide icons can replace them if you prefer.
- No photography.

## Open items to confirm before launch
1. Real DataForSEO per-point rates, and whether Claude is covered at the same price.
2. Launch price, step, tier size, live seat counter source, and the refund window.
3. That the key security claims (section 8) and "estimate before every scan" are true.
4. Scan packs: pricing and pack sizes. The page currently only says "Or buy included scan packs".
5. Competitor facts, re-checked on the publish date.
6. Real Terms / Privacy / Refund / Contact URLs and the Log in URL.
7. Checkout target for all "Get lifetime access" / "Lock in" CTAs (e.g. Stripe or Lemon Squeezy).

## Files in this bundle
- `RankbyAI Landing v2.dc.html`: the full design reference, with all copy and interactions.
- `support.js`: prototype runtime, needed only to open the reference locally.
- `assets/logo.png`, `assets/logo-80.png`: logo files.
