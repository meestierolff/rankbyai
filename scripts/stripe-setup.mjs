#!/usr/bin/env node
/**
 * Creates the RankbyAI product and pack prices in YOUR Stripe account and prints the env values.
 * Run it yourself with a TEST key first:
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
 *
 * It refuses live keys unless you pass --live, and it never stores or prints the key.
 * It is idempotent: products/prices are looked up by metadata before anything is created.
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY (a test key, sk_test_...) in the environment for this one command.");
  process.exit(2);
}
if (key.startsWith("sk_live_") && !process.argv.includes("--live")) {
  console.error("Refusing to run against a LIVE key without --live. Use a test key first.");
  process.exit(2);
}
const stripe = new Stripe(key);
const TAX_CODE = process.env.STRIPE_TAX_CODE_SAAS || "txcd_10103001"; // SaaS, business use (docs.stripe.com/tax/tax-codes)

async function findProduct(slug) {
  const res = await stripe.products.search({ query: `metadata['rankbyai_key']:'${slug}'` });
  return res.data[0];
}
async function ensureProduct(slug, name, description) {
  return (await findProduct(slug)) ?? stripe.products.create({ name, description, tax_code: TAX_CODE, metadata: { rankbyai_key: slug } });
}
async function ensurePrice(product, cents, slug) {
  const list = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const hit = list.data.find((p) => p.unit_amount === cents && p.currency === "usd" && !p.recurring);
  return hit ?? stripe.prices.create({ product: product.id, unit_amount: cents, currency: "usd", tax_behavior: "exclusive", metadata: { rankbyai_key: slug } });
}

const lifetime = await ensureProduct("lifetime", "RankbyAI lifetime access", "One-time payment. AI visibility + Maps grid tracking, audits, prospect reports, API and MCP on your own API keys.");
const pack25Product = await ensureProduct("pack_25", "RankbyAI scan pack 25", "25 included scan credits. Credits never expire.");
const pack100Product = await ensureProduct("pack_100", "RankbyAI scan pack 100", "100 included scan credits. Credits never expire.");
const pack25 = await ensurePrice(pack25Product, 1900, "pack_25");
const pack100 = await ensurePrice(pack100Product, 5900, "pack_100");

console.log(`\nAdd these to your environment (${key.startsWith("sk_live_") ? "LIVE" : "TEST"} mode):\n`);
console.log(`STRIPE_PRODUCT_LIFETIME=${lifetime.id}`);
console.log(`STRIPE_PRICE_PACK_25=${pack25.id}`);
console.log(`STRIPE_PRICE_PACK_100=${pack100.id}`);
console.log(`STRIPE_TAX_CODE_SAAS=${TAX_CODE}`);
console.log(`\nThen add a webhook endpoint for <site>/api/webhooks/stripe with these events:`);
console.log("  checkout.session.completed, checkout.session.async_payment_succeeded,");
console.log("  checkout.session.async_payment_failed, checkout.session.expired, charge.refunded");
console.log("and set STRIPE_WEBHOOK_SECRET to its signing secret.\n");
