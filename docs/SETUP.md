# Setup

Variable names follow `.env.example`. Secrets live only in server code; `pnpm check:secrets` scans the client bundles after a build. Every feature fails with a clear message that names the missing variables.

## 1. Neon (database, sign-in, files)

Everything lives in one Neon project. Locally, `pnpm db:setup` starts Postgres and PostgREST in Docker instead and fills in the three database variables.

1. **Project.** Create a Neon project (EU region for an EU operator), Postgres 17.
2. **Sign-in.** Enable Neon Auth on the branch and turn on the Google provider. Neon's shared Google credentials work for testing; for production create your own Google OAuth client (Google Cloud console → APIs & Services → Credentials) and enter its client id and secret in the Neon console, so the consent screen shows your name. Turn email and password sign-in off. Add the deployed origin as a trusted domain.
   - `NEON_AUTH_BASE_URL`: the Auth URL from the Neon console.
   - `NEON_AUTH_COOKIE_SECRET`: `openssl rand -base64 48`.
3. **Signing key.** `node scripts/db.mjs keys` prints a private key (one line, goes in `DATA_API_JWT_PRIVATE_JWK`, server only) and the matching public key set. The public key set of this deployment is committed at `public/.well-known/jwks.json`; replace it if you generate a new key.
4. **Data API.** Enable the Data API on the branch with an external provider: JWKS URL = the public address of `jwks.json`, audience = `rankbyai-data-api`, schema `public`, default grants off. Its URL goes in `DATA_API_URL`.
5. **Schema.** `node scripts/db.mjs migrate --url "<direct connection string>"` applies `db/migrations` (tracked in `private.schema_migrations`). Run it after enabling the Data API, because the Data API creates the `authenticator`, `authenticated` and `anonymous` roles the schema grants to. After every migration, refresh the Data API schema cache (Neon console → Data API → refresh, or `neon data-api update`).
6. **Check it.** `node scripts/cloud-check.mjs` runs the security checks through the real gateway (row-level security between two throwaway users, rejected tokens, claim-style updates) and deletes what it created. The test suite itself never runs against a hosted database.
7. **Files (optional).** Create a private bucket in Neon Object Storage and a credential with `storage:read` and `storage:write`. Set `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION`. Without these, logo upload is switched off and raw AI answers are not archived; everything else works.

One behaviour to know about: the Neon gateway can run the first request on a newly opened connection without the user's identity. The database refuses that request with error `RB001` (migration `0004_identity_guard.sql`) and the server retries it, so users never see it. If `RB001` ever shows up in logs as a final error, the retry limit in `src/lib/db/clients.ts` was exhausted.

How requests reach the database: the app never opens a Postgres connection at runtime. The server signs a token that lives five minutes and names a role (`anonymous`, `authenticated` plus the user id, or `service_role`), and sends it to the Data API. The Data API switches to that role, and row-level security decides what the request can see. The browser never receives one of these tokens.

## 2. App secrets

```bash
openssl rand -base64 32   # KEY_ENCRYPTION_SECRET (exactly 32 bytes; do not lose it: it decrypts every stored API key)
openssl rand -hex 32      # HASH_PEPPER
openssl rand -hex 32      # CRON_SECRET
openssl rand -hex 32      # DATAFORSEO_PINGBACK_SECRET
```

## 3. Stripe (test mode first)

Use the dedicated RankbyAI Stripe account.

```bash
STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
```

The script creates the lifetime product and the two pack prices (idempotent) and prints `STRIPE_PRODUCT_LIFETIME`, `STRIPE_PRICE_PACK_25`, `STRIPE_PRICE_PACK_100`, `STRIPE_TAX_CODE_SAAS`. Then:

- Enable Stripe Tax and add your registrations.
- Add a webhook endpoint `<origin>/api/webhooks/stripe` with: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
- Set `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

Switching to live keys is a deliberate, manual step by the operator.

## 4. Price ladder

The ladder terms live in the database row `ladder_lock` (seeded: $29 base, +$10 every 5 sales, closes 16 Dec 2026 13:00 UTC). They can be changed before the first sale and are frozen by a trigger afterwards. The `LADDER_*` variables document the intended terms.

## 5. Everything else

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical origin, e.g. `https://rankbyai.live` |
| `HOUSE_*` | House API keys, used only for free checks, included-scan packs and the operator's own demos |
| `OPENAI_MODEL`, `PERPLEXITY_MODEL`, `GEMINI_MODEL`, `LLM_FIXES_MODEL` | Optional model overrides |
| `COST_*`, `FREE_CHECKS_*` | Cost guard caps and free-check limits |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Bot protection on the free check and the removal form |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Analytics (cookieless until consent in the EU/EEA/UK/CH) |
| `SOD_TRACKER_SNIPPET_SRC` | Ship or Die tracker script URL, loaded on every page |
| `EARLY_ACCESS_NOTE` | Banner text with true ship dates; hidden when empty |
| `ADMIN_USER_IDS` | Comma-separated user ids (from Neon Auth) allowed into `/admin` |
| `LEGAL_ENTITY_NAME`, `LEGAL_ADDRESS`, `LEGAL_EMAIL`, `LEGAL_KVK` | Operator identity shown in the footer and legal pages |
