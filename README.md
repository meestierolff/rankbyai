# RankbyAI

**AI visibility software you pay for once.** RankbyAI shows whether ChatGPT, Perplexity and Gemini recommend a local business for "best {service} near me" prompts, point by point across a map grid, next to its Google Maps rank on the same grid. Scans run on the user's own API keys at cost, or on optional included-scan packs.

Live site: https://rankbyai.live · Built in public for the Ship or Die $100K Hackathon (16 Nov – 16 Dec 2026).

> Not affiliated with or endorsed by OpenAI, Perplexity, Google or DataForSEO. RankbyAI is not the first or only AI visibility grid tool; Local Falcon and BrightLocal also offer one. The difference is how you pay.

## Stack

- Next.js 16 (App Router, Cache Components, TypeScript strict), Tailwind CSS v4, shadcn/ui
- Supabase (Postgres, Auth magic links, Storage) with row level security on every table
- Stripe Checkout (one-time payments, Stripe Tax)
- Official APIs only: DataForSEO (Google Maps results), OpenAI, Perplexity, Gemini
- Vitest for unit and database tests

## Repository map

| Path | What it holds |
|---|---|
| `design/` | Design handoff (source of truth for the look) |
| `src/styles/tokens.css`, `src/app/globals.css` | Design tokens and the Tailwind theme |
| `src/components/ui`, `src/components/brand` | shadcn/ui primitives and the brand component library |
| `src/components/marketing`, `src/app/(marketing)` | Marketing site |
| `src/app/app`, `src/components/app` | The dashboard |
| `src/lib/pricing-constants.ts`, `src/lib/cost` | Vendor price constants and cost maths (one source for site and app) |
| `src/lib/ladder.ts`, `src/lib/checkout.ts`, `src/lib/stripe-webhook.ts` | Lifetime price ladder, checkout, webhook |
| `supabase/migrations` | Schema, RLS policies, functions |
| `tests/unit`, `tests/db` | Unit tests and tests that run against a real local Postgres |
| `docs/` | Setup, progress log, vendor API notes |

## Run it locally

```bash
pnpm install
pnpm db:start            # local Supabase (Docker); ports are set in supabase/config.toml
cp .env.example .env.local   # fill in the local Supabase URL and keys printed by the command above
pnpm dev                 # http://localhost:3100
```

```bash
pnpm test                # unit + database tests (local database only)
pnpm build && pnpm check:secrets   # production build, then scan client bundles for secrets
```

See [docs/SETUP.md](docs/SETUP.md) for every environment variable and the hosted setup, and [docs/PROGRESS.md](docs/PROGRESS.md) for what is built and verified.

## Rules this codebase keeps

- Row level security on every table; an automated test proves it.
- API keys are encrypted with AES-256-GCM, write-only, and used only on the server.
- No scraping. Official APIs only. Every AI result carries the "AI answers vary" disclaimer.
- No invented numbers: demo content is labelled "Sample data", estimates are labelled as estimates, competitor prices carry their source date.
- No fake urgency: the price follows a public sales counter, never a timer.
- Every sale is priced above its delivery cost (asserted in `tests/unit/pricing.test.ts`).
