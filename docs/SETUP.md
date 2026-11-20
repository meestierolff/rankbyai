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

**Two branches, on purpose.** `main` is production: the live site, live Stripe keys, real sales. `preview` is for preview deployments and Stripe test mode. A test purchase is a row in `orders`, and orders drive the public sold counter and freeze the ladder terms, so test purchases must never reach `main`. A branch created from `main` inherits the Data API and Neon Auth settings and gets its own URLs. Two guards back this up in code: the webhook ignores test-mode events on the production deployment (and live events anywhere else), and checkout refuses a test key on production. Apply every migration to both branches.

**The public key file is a production dependency.** The Data API fetches it from the JWKS URL it was given (currently the raw GitHub address of `public/.well-known/jwks.json` on `main`). If that address stops working (repository renamed, made private, file moved), database calls start failing once the gateway's key cache expires. Whoever can change that file can issue tokens the database accepts, exactly like whoever holds the private key in the hosting environment. After go-live, point the Data API at `https://<your domain>/.well-known/jwks.json` (Neon console → Data API → authentication provider) so it no longer depends on the repository. Preview and production currently trust the same key; give `preview` its own key pair and JWKS URL if other people get access to preview secrets.

One behaviour to know about: the Neon gateway can run the first request on a newly opened connection without the user's identity. The database refuses that request with error `RB001` (migration `0004_identity_guard.sql`) and the server retries it (eight times over about three seconds). The sign-in lookup additionally falls back to a server-side read, so a sign-in cannot fail on this. If `RB001` shows up in logs as a final error, the retry limit in `src/lib/db/clients.ts` was exhausted.

How requests reach the database: the app never opens a Postgres connection at runtime. The server signs a token that lives five minutes and names a role (`anonymous`, `authenticated` plus the user id, or `service_role`), and sends it to the Data API. The Data API switches to that role, and row-level security decides what the request can see. The browser never receives one of these tokens.

## Background timer (cron)

`/api/cron/tick` continues scans and prospect batches that have no open browser tab, runs weekly and monthly schedules, and closes audits whose worker died. It is safe to call at any frequency.

- `vercel.json` schedules it **once a day**, because Vercel's Hobby plan allows nothing more frequent and refuses the deployment otherwise. With a daily timer, work still continues whenever its page is open, and schedules still run (a day is precise enough for weekly and monthly). What you lose is background progress on a closed tab: a prospect batch waits until someone opens it or until the daily run.
- On Vercel Pro, change the schedule to `* * * * *` (every minute). This is the intended setting.
- Without Pro, any scheduler can call it every minute instead: `GET <origin>/api/cron/tick` with the header `Authorization: Bearer <CRON_SECRET>`.

Prices and checkout do not depend on the timer: an expired checkout hold stops counting by itself.

## 2. App secrets

```bash
openssl rand -base64 32   # KEY_ENCRYPTION_SECRET (exactly 32 bytes; do not lose it: it decrypts every stored API key)
openssl rand -hex 32      # HASH_PEPPER
openssl rand -hex 32      # CRON_SECRET
openssl rand -hex 32      # DATAFORSEO_PINGBACK_SECRET
```

## 3. Stripe (test mode first)

Use the dedicated RankbyAI Stripe account. One script does the whole setup and is safe to run again: it looks up the products, prices and webhook endpoint before creating anything.

**The key.** Use a restricted key (Developers → API keys → Create restricted key), not the full secret key. Start with these permissions and leave everything else on None. The list comes from the calls the code makes; the dashboard's names for them can differ slightly:

| Permission | Level | Used for |
|---|---|---|
| Checkout Sessions | Write | Opening the payment page (the site, on every purchase) |
| Refunds (listed with Charges) | Write | The self-serve refund button |
| Products | Write | Setup only: creating the lifetime product and the two packs |
| Prices | Write | Setup only: the two pack prices |
| Webhook Endpoints | Write | Setup only: creating the endpoint and capturing its signing secret |

After setup the last three can be set back to None. If a permission is missing, Stripe's refusal names it and the script prints that message, so add that one and run the script again.

**Proving the payment path.** `tests/live/stripe-live.test.ts` makes a real test-mode payment, has Stripe deliver the signed events to the running app, delivers one of them twice, and refunds it. Run it after any change to checkout or the webhook (instructions at the top of the file).

`tests/live/stripe-purchase-live.test.ts` is the check for the key itself: the app's own checkout call opens the page with your restricted key, you pay it with Stripe's test card, and the app's own refund call runs. Use it after creating or changing a key.

**Three things to know about a Stripe account that also serves other sites.**

- Their payment events reach this site's webhook too. Every RankbyAI checkout carries `metadata.app = rankbyai` and the webhook fulfils only those, so another product's payment can never grant access here. Other events are answered with 200 and ignored.
- Stripe allows three different API versions across an account's webhook endpoints. At that limit the setup script creates the endpoint with the newest version the account already has and says so.
- If the account has an approval rule for refunds (Stripe dashboard, Settings → Approvals), a refund from the Billing page is not instant: Stripe files an approval request that expires after 24 hours, and the refund runs when you approve it. The buyer is told the refund was requested and is approved by hand. Remove the rule if you want refunds to be instant.

Keep the key in a gitignored file, never in chat or in a command line:

```bash
echo 'STRIPE_SECRET_KEY=rk_test_...' > .env.stripe.test.local
node --env-file=.env.stripe.test.local scripts/stripe-setup.mjs
```

That creates the lifetime product and the two pack prices and prints `STRIPE_PRODUCT_LIFETIME`, `STRIPE_PRICE_PACK_25`, `STRIPE_PRICE_PACK_100`, `STRIPE_TAX_CODE_SAAS`. It ends with a preflight: it opens a checkout page the way the site does and closes it again, which proves the key's permissions, that Stripe Tax is switched on and that the product exists. Nobody is charged.

**Going live** is a deliberate step by the operator:

```bash
node --env-file=.env.stripe.live.local scripts/stripe-setup.mjs --live \
  --account acct_YOURS \
  --webhook https://rankbyai.live/api/webhooks/stripe \
  --vercel production
vercel deploy --prod
```

- `--account` stops the script unless the key belongs to that account.
- `--webhook` creates the endpoint with `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`. Stripe shows the signing secret only once, so the script requires `--vercel` or `--save` to give it somewhere to go.
- `--vercel production` stores `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and the ids in Vercel without printing the secrets. It refuses a test key on production and a live key on preview.

Before the live run: switch on Stripe Tax in the dashboard (Settings → Tax) and add your registrations. The preflight fails with Stripe's own message if Tax is not ready.

**What opens when.** Checkout opens only when the secret key, the lifetime product and the webhook secret are all set and the key matches the site (live on production, test elsewhere). Without the webhook secret a buyer would pay and receive nothing, so the site keeps checkout closed. Scan packs open only when, in addition, both pack prices, the house DataForSEO login and all three house AI keys are set, because a credit is sold as a three-engine AI grid. No publishable key is needed: checkout is a redirect to Stripe.

## 4. Price ladder

The ladder terms live in the database row `ladder_lock` (seeded: $29 base, +$10 every 5 sales, closes 16 Dec 2026 13:00 UTC). They can be changed before the first sale and are frozen by a trigger afterwards. The `LADDER_*` variables document the intended terms.

## 5. Everything else

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical origin, e.g. `https://rankbyai.live` |
| `HOUSE_*` | House API keys, used only for free checks, included-scan packs and the operator's own demos |
| `SCAN_PACKS_FOR_SALE` | Set to `0` to keep scan packs closed while the house keys are in place. Unset means packs open as soon as they can be delivered. |
| `OPENAI_MODEL`, `PERPLEXITY_MODEL`, `GEMINI_MODEL`, `LLM_FIXES_MODEL` | Optional model overrides |
| `COST_*`, `FREE_CHECKS_*` | Cost guard caps and free-check limits |
| `EMAIL_FROM` plus `BREVO_API_KEY` or `RESEND_API_KEY` | Transactional email (the purchase confirmation). `EMAIL_FROM` is `Name <address>` and must be a sender verified at the provider. Replies go to `LEGAL_EMAIL`. Without these the purchase still completes; the buyer just gets no email. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Bot protection on the free check and the removal form |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Analytics (cookieless until consent in the EU/EEA/UK/CH) |
| `SOD_TRACKER_SNIPPET_SRC` | Ship or Die tracker script URL, loaded on every page |
| `EARLY_ACCESS_NOTE` | Banner text with true ship dates; hidden when empty |
| `ADMIN_USER_IDS` | Comma-separated user ids (from Neon Auth) allowed into `/admin` |
| `LEGAL_ENTITY_NAME`, `LEGAL_ADDRESS`, `LEGAL_EMAIL`, `LEGAL_KVK` | Operator identity shown in the footer and legal pages |
| `MCP_OAUTH` | Set to `1` to switch on OAuth 2.1 for the MCP server (sign-in from Claude, ChatGPT, Cursor and other clients instead of a pasted API key). Needs migration `0012_mcp_oauth.sql` first; while unset, `/.well-known/oauth-*` and `/oauth/*` answer 404 and `/api/mcp` takes API keys only. The issuer is `NEXT_PUBLIC_SITE_URL`. Uses `HASH_PEPPER` for token hashes and consent tickets. See the README section on the MCP server. |

## 6. Custom report domains (optional)

Lifetime workspaces can send report links from their own subdomain, for example `https://reports.agency.com/r/{slug}`, under Settings → Branding. The server adds the domain to this Vercel project through the Vercel REST API and reads its verification and DNS status from there. Without the three variables below, the settings section says custom domains are not switched on and accepts nothing.

| Variable | Value |
|---|---|
| `VERCEL_API_TOKEN` | A Vercel access token. Secret: server only, never `NEXT_PUBLIC_`. `pnpm check:secrets` fails the build check if it reaches a client bundle. |
| `VERCEL_PROJECT_ID` | The project's id, `prj_…` (Project → Settings → General). Vercel sets this one itself on its deployments (a system environment variable, when "Automatically expose System Environment Variables" is on), so it usually needs setting only for local use. |
| `VERCEL_TEAM_ID` | The team's id, `team_…` (Team → Settings → General). |

**The token.** Create it under Account Settings → Tokens. Scope: open the team, then pick this project (not "All Projects"). That makes a project-scoped token (`vcp_…`) that can change nothing outside this project. Pick an expiry and note the date: when the token expires, adding, checking and removing domains stop working, but domains that are already active keep serving, because serving reads only the database. The calls it makes: add, get, verify and remove a project domain (`/v10/projects/{id}/domains`, `/v9/projects/{id}/domains/{domain}[/verify]`) and read the domain's DNS configuration (`/v6/domains/{domain}/config`). Vercel's documentation says project-scoped tokens are refused team-level resources; if "Check again" never shows a DNS record to create, the configuration read is the call being refused, and a team-scoped token (the team, "All Projects") is the fallback. That token can change every project in the team.

**Where to set them.** Production only. A preview deployment with the token would add domains to the production project.

**Database.** Apply `db/migrations/0008_custom_domains.sql` to both branches and refresh the Data API schema cache (the proxy reads `workspace_domains` through the Data API).

**How a custom domain behaves** (`src/proxy.ts`, decision in `src/lib/domains.ts`). Any host that is not `NEXT_PUBLIC_SITE_URL`'s host, its `www.`, a `*.vercel.app` address or localhost is treated as a custom domain. It serves only `/r/{slug}` (with its Open Graph image and its PDF at `/r/{slug}/pdf`), the older PDF route `/api/reports/{slug}/pdf`, Next's static files, the icons and a `robots.txt` that disallows everything, and only while the domain's row is `active` and the report belongs to that domain's workspace. `/` redirects to the agency's website when one is set; everything else answers 404. Every response carries `X-Robots-Tag: noindex, nofollow`. If the database cannot be read, a custom domain answers 503 rather than serving anything. Domain lookups are cached for a minute per server instance.

**If the main domain changes,** update the host list in the matcher at the bottom of `src/proxy.ts` (it has to be written out literally). Until then the main site still works, but the proxy runs on every one of its requests.

**Limits.** The Hobby plan allows 50 domains per project, and `rankbyai.live` and `www` count toward that. Vercel's API allows 100 project-domain changes per minute.

**Checking it after a deploy.** With an active test domain: `curl -sI https://<domain>/r/<slug>` answers 200 with `x-robots-tag: noindex, nofollow`; a slug from another workspace, `/app` and `/api/scans` answer 404; `/` answers 302 to the agency's website, or 404 when none is set.

Removing a domain in the app removes it from the Vercel project. Tell the agency to delete its CNAME record too: a record that still points here could later be connected by someone else.
