#!/usr/bin/env node
/**
 * Sets up Stripe for RankbyAI in YOUR account, in one command. It is safe to run again: products,
 * prices and the webhook endpoint are looked up before anything is created.
 *
 * The key is read from STRIPE_SECRET_KEY and is never printed. Keep it in a gitignored file:
 *
 *   echo 'STRIPE_SECRET_KEY=rk_test_...' > .env.stripe.test.local
 *   node --env-file=.env.stripe.test.local scripts/stripe-setup.mjs
 *
 * Going live (a restricted key, see docs/SETUP.md for the permissions it needs):
 *
 *   node --env-file=.env.stripe.live.local scripts/stripe-setup.mjs --live \
 *     --account acct_YOURS \
 *     --webhook https://your-site/api/webhooks/stripe \
 *     --vercel production
 *
 * Flags
 *   --live              required for a live key (sk_live_ or rk_live_)
 *   --account <id>      stop unless the key belongs to this account (required with --live)
 *   --webhook <url>     create the webhook endpoint for this address if it does not exist
 *   --vercel <env>      store every value in this Vercel environment (production | preview)
 *   --save <file>       also write the values to this file (name must start with .env)
 *   --no-preflight      skip the test session that checks permissions and Stripe Tax
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import Stripe from "stripe";

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
};
const stop = (message) => {
  console.error(`\nStopped: ${message}\n`);
  process.exit(2);
};

const key = (process.env.STRIPE_SECRET_KEY || "").trim();
if (!key) stop("STRIPE_SECRET_KEY is not set. Put it in a gitignored file and pass it with node --env-file=<file>.");
const mode = /^(sk|rk)_live_/.test(key) ? "live" : /^(sk|rk)_test_/.test(key) ? "test" : null;
if (!mode) stop("STRIPE_SECRET_KEY is not a Stripe secret or restricted key (sk_… or rk_…).");
const live = mode === "live";
if (live && !flag("--live")) stop("This is a LIVE key. Add --live if you mean it.");
if (!live && flag("--live")) stop("--live was given but the key is a test key.");

const expectedAccount = value("--account");
const webhookUrl = value("--webhook");
const vercelEnv = value("--vercel");
const saveFile = value("--save");
if (live && !expectedAccount) stop("With a live key, name the account it must belong to: --account acct_…");
if (vercelEnv && !["production", "preview"].includes(vercelEnv)) stop("--vercel takes production or preview.");
// Same rule the site enforces: the live site sells with a live key, every other site with a test key.
if (vercelEnv === "production" && !live) stop("Production needs a live key. A test key there would take payments that are never delivered.");
if (vercelEnv === "preview" && live) stop("Preview must use a test key, so a test purchase can never count as a real sale.");
if (saveFile && !basename(saveFile).startsWith(".env")) stop("--save needs a file name that starts with .env, so git ignores it.");
if (webhookUrl && !vercelEnv && !saveFile) stop("Stripe shows a webhook's signing secret only once. Add --vercel <env> or --save <file> so it has somewhere to go.");
if (webhookUrl && !/^https:\/\/[^/]+\/api\/webhooks\/stripe$/.test(webhookUrl)) stop("--webhook must look like https://your-site/api/webhooks/stripe");

const stripe = new Stripe(key, { appInfo: { name: "RankbyAI setup" } });
const TAX_CODE = process.env.STRIPE_TAX_CODE_SAAS || "txcd_10103001"; // SaaS, business use (docs.stripe.com/tax/tax-codes)

/** Stripe's own message says which permission a restricted key is missing; pass it on untouched. */
const explain = (err) => (err && typeof err.message === "string" ? err.message.replace(/(sk|rk)_(live|test)_[A-Za-z0-9*]+/g, "$1_$2_…") : "unknown error");
async function step(label, run) {
  try {
    return await run();
  } catch (err) {
    stop(`${label} failed.\n  Stripe said: ${explain(err)}`);
  }
}

/** Which account does this key belong to? A key without that permission still names its account in the refusal. */
async function accountOfKey() {
  try {
    return (await stripe.accounts.retrieveCurrent()).id;
  } catch (err) {
    return /acct_[A-Za-z0-9]+/.exec(String(err?.message ?? ""))?.[0] ?? null;
  }
}

const account = await accountOfKey();
if (expectedAccount) {
  if (!account) stop(`Could not confirm which account this key belongs to, so nothing was changed. Expected ${expectedAccount}.`);
  if (account !== expectedAccount) stop(`This key belongs to ${account}, not ${expectedAccount}. Nothing was changed.`);
}
console.log(`\nStripe ${mode.toUpperCase()} mode, account ${account ?? "unknown"}${expectedAccount ? " (matches --account)" : ""}.`);

async function ensureProduct(slug, name, description) {
  const found = await stripe.products.search({ query: `metadata['rankbyai_key']:'${slug}'` });
  const active = found.data.find((p) => p.active);
  if (active) return { product: active, created: false };
  return { product: await stripe.products.create({ name, description, tax_code: TAX_CODE, metadata: { rankbyai_key: slug } }), created: true };
}
async function ensurePrice(product, cents, slug) {
  const list = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const hit = list.data.find((p) => p.unit_amount === cents && p.currency === "usd" && !p.recurring);
  if (hit) return { price: hit, created: false };
  return { price: await stripe.prices.create({ product: product.id, unit_amount: cents, currency: "usd", tax_behavior: "exclusive", metadata: { rankbyai_key: slug } }), created: true };
}
const note = (created) => (created ? "created" : "already there");

const lifetime = await step("Lifetime product", () =>
  ensureProduct("lifetime", "RankbyAI lifetime access", "One-time payment. AI visibility + Maps grid tracking, audits, prospect reports, API and MCP on your own API keys."),
);
const pack25Product = await step("Pack 25 product", () => ensureProduct("pack_25", "RankbyAI scan pack 25", "25 included scan credits. Credits never expire."));
const pack100Product = await step("Pack 100 product", () => ensureProduct("pack_100", "RankbyAI scan pack 100", "100 included scan credits. Credits never expire."));
const pack25 = await step("Pack 25 price", () => ensurePrice(pack25Product.product, 1900, "pack_25"));
const pack100 = await step("Pack 100 price", () => ensurePrice(pack100Product.product, 5900, "pack_100"));
console.log(`  Lifetime product   ${lifetime.product.id}  (${note(lifetime.created)})`);
console.log(`  Pack 25 price      ${pack25.price.id}  (${note(pack25.created)})`);
console.log(`  Pack 100 price     ${pack100.price.id}  (${note(pack100.created)})`);

/**
 * Preflight: open a checkout page exactly as the site does, then close it at once. Nobody is
 * charged and no customer is created. It proves the key may create sessions, Stripe Tax is
 * switched on, and the product exists.
 */
if (!flag("--no-preflight")) {
  const session = await step("Preflight (opening a checkout page the way the site does)", () =>
    stripe.checkout.sessions.create({
      mode: "payment",
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      invoice_creation: { enabled: true },
      allowed_payment_method_types: ["card", "link"], // keep in step with baseParams() in src/lib/checkout.ts
      allow_promotion_codes: false,
      customer_email: "preflight@example.com",
      customer_creation: "always",
      metadata: { rankbyai_preflight: "1" },
      success_url: "https://example.com/ok",
      cancel_url: "https://example.com/cancel",
      line_items: [{ quantity: 1, price_data: { currency: "usd", product: lifetime.product.id, unit_amount: 2900, tax_behavior: "exclusive" } }],
    }),
  );
  await step("Preflight (closing the checkout page again)", () => stripe.checkout.sessions.expire(session.id));
  console.log("  Preflight          a checkout page opened and was closed again. Nobody was charged.");
}

const SECRET_NAMES = new Set(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
const values = {
  STRIPE_SECRET_KEY: key,
  STRIPE_PRODUCT_LIFETIME: lifetime.product.id,
  STRIPE_PRICE_PACK_25: pack25.price.id,
  STRIPE_PRICE_PACK_100: pack100.price.id,
  STRIPE_TAX_CODE_SAAS: TAX_CODE,
};
const writeEnvFile = (file, entries) => writeFileSync(file, Object.entries(entries).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
/** The value goes in on stdin, so it never appears in the process list or in this output. */
function storeInVercel(name, v) {
  const r = spawnSync("vercel", ["env", "add", name, "--environment", vercelEnv, "--force", "--yes", SECRET_NAMES.has(name) ? "--sensitive" : "--no-sensitive"], { input: v, encoding: "utf8" });
  return r.status === 0 ? null : (r.stderr || "").trim().split("\n").pop() || "unknown error";
}

/**
 * The webhook endpoint comes last, after everything that can fail, and its signing secret is
 * stored the moment it exists: Stripe shows it only in the response that creates the endpoint.
 */
const stored = new Set();
if (webhookUrl) {
  const existing = await step("Listing webhook endpoints", async () => (await stripe.webhookEndpoints.list({ limit: 100 })).data.find((e) => e.url === webhookUrl));
  if (existing) {
    const missing = WEBHOOK_EVENTS.filter((e) => !existing.enabled_events.includes(e) && !existing.enabled_events.includes("*"));
    console.log(`  Webhook endpoint   ${existing.id}  (already there, status ${existing.status})`);
    if (missing.length) console.log(`    It does not listen for: ${missing.join(", ")}. Add them in the dashboard.`);
    console.log("    Its signing secret cannot be read again. If STRIPE_WEBHOOK_SECRET is not stored yet, delete this endpoint in the dashboard and run this command again.");
  } else {
    const created = await step("Creating the webhook endpoint", () =>
      stripe.webhookEndpoints.create({ url: webhookUrl, enabled_events: WEBHOOK_EVENTS, api_version: stripe.getApiField("version"), description: "RankbyAI purchases and refunds" }),
    );
    if (!created.secret) stop(`Stripe created ${created.id} but returned no signing secret. Delete that endpoint in the dashboard and run this command again.`);
    values.STRIPE_WEBHOOK_SECRET = created.secret;
    console.log(`  Webhook endpoint   ${created.id}  (created, signing secret captured, not shown)`);
    if (saveFile) writeEnvFile(saveFile, values);
    if (vercelEnv) {
      const problem = storeInVercel("STRIPE_WEBHOOK_SECRET", created.secret);
      if (!problem) stored.add("STRIPE_WEBHOOK_SECRET");
      else if (!saveFile) {
        const rescue = `.env.stripe.webhook.${mode}.local`;
        writeEnvFile(rescue, { STRIPE_WEBHOOK_SECRET: created.secret });
        stop(`Vercel refused STRIPE_WEBHOOK_SECRET (${problem}).\n  The signing secret is safe in ${rescue} (git ignores it). Fix the Vercel problem, then add it with:\n  vercel env add STRIPE_WEBHOOK_SECRET --environment ${vercelEnv} --sensitive`);
      }
    }
  }
}

if (saveFile) {
  writeEnvFile(saveFile, values);
  console.log(`\nSaved ${Object.keys(values).length} values to ${saveFile} (git ignores it).`);
}

if (vercelEnv) {
  console.log(`\nStoring values in Vercel (${vercelEnv}):`);
  for (const [name, v] of Object.entries(values)) {
    if (!stored.has(name)) {
      const problem = storeInVercel(name, v);
      if (problem) stop(`Vercel refused ${name}. Run "vercel link" in this folder first, then run this command again.\n  ${problem}`);
    }
    console.log(`  ${name}`);
  }
  console.log(`\nDone. The site picks these up on the next deploy:${vercelEnv === "production" ? "  vercel deploy --prod" : "  vercel deploy"}`);
} else {
  console.log("\nValues for your environment (the two secrets are not shown):\n");
  for (const [name, v] of Object.entries(values)) console.log(SECRET_NAMES.has(name) ? `${name}=<not shown>` : `${name}=${v}`);
  if (!webhookUrl) {
    console.log("\nNo webhook endpoint was set up. Run again with --webhook https://your-site/api/webhooks/stripe");
    console.log(`It must listen for: ${WEBHOOK_EVENTS.join(", ")}`);
  }
}
console.log("");
