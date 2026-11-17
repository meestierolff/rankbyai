# Setup

Variable names follow `.env.example`. Secrets live only in server code; `pnpm check:secrets` scans the client bundles after a build. Every feature fails with a clear message that names the missing variables.

## 1. Supabase

1. Create a project (EU region recommended for an EU operator).
2. Apply the schema: `supabase link --project-ref <ref>` then `supabase db push`.
3. Auth → URL configuration: set the Site URL to the deployed origin and add `<origin>/**` to the redirect allow list.
4. Auth → Email templates: paste `supabase/templates/magic_link.html` into both **Magic Link** and **Confirm signup**. The link must point at `/auth/confirm?token_hash=…` so it works when opened on another device.
5. Auth → SMTP: use Resend (custom SMTP) so sign-in emails come from your domain.
6. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the anon or publishable key) and `SUPABASE_SERVICE_ROLE_KEY` (the service-role or secret key).

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
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Bot protection on signup, free check and the removal form |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Analytics (cookieless until consent in the EU/EEA/UK/CH) |
| `SOD_TRACKER_SNIPPET_SRC` | Ship or Die tracker script URL, loaded on every page |
| `EARLY_ACCESS_NOTE` | Banner text with true ship dates; hidden when empty |
| `ADMIN_USER_IDS` | Comma-separated auth user ids allowed into `/admin` |
| `LEGAL_ENTITY_NAME`, `LEGAL_ADDRESS`, `LEGAL_EMAIL`, `LEGAL_KVK` | Operator identity shown in the footer and legal pages |
