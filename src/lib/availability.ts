import "server-only";
import { houseKeysEnv, miscEnv, stripeEnv, turnstileEnv } from "@/lib/env";
import { isMockMode } from "@/lib/mock";
import { stripeKeyAllowed } from "@/lib/stripe-webhook";

/**
 * What is switched on in this deployment. Pages use it to say plainly "not open yet" where a
 * button would otherwise lead to an error. Nothing here is a secret: only yes or no.
 *
 * The rules are pure functions of plain values so they can be tested without an environment.
 */

/**
 * Checkout takes money; the webhook is what delivers the purchase. Without the webhook secret a
 * buyer would pay and receive nothing, so checkout stays closed until both halves are in place.
 */
export function checkoutReady(v: { secretKey?: string; lifetimeProductId?: string; webhookSecret?: string; vercelEnv?: string }): boolean {
  if (!v.secretKey || !v.lifetimeProductId || !v.webhookSecret) return false;
  return stripeKeyAllowed(v.secretKey, v.vercelEnv);
}

/**
 * A pack is sold as scans on our keys, and one credit is described as an AI grid on three engines.
 * So packs open only when the data key and all three AI keys are present.
 */
export function packsReady(v: { checkout: boolean; pack25PriceId?: string; pack100PriceId?: string; dataKey: boolean; aiKeys: number; forSale?: boolean }): boolean {
  if (v.forSale === false) return false;
  return v.checkout && !!v.pack25PriceId && !!v.pack100PriceId && v.dataKey && v.aiKeys >= 3;
}

/**
 * The owner's switch. House keys can be in place for the owner's own scans and the free check
 * while packs are not sold yet: SCAN_PACKS_FOR_SALE=0 (or "off"/"false") keeps them closed.
 */
export const packsForSale = (value: string | undefined = process.env.SCAN_PACKS_FOR_SALE): boolean => !["0", "off", "false", "no"].includes((value ?? "").trim().toLowerCase());

const filled = (v: string | undefined) => !!v && v.trim() !== "";

export function checkoutOpen(): boolean {
  if (!stripeEnv.isConfigured()) return false;
  const env = stripeEnv.get();
  return checkoutReady({
    secretKey: env.STRIPE_SECRET_KEY,
    lifetimeProductId: env.STRIPE_PRODUCT_LIFETIME,
    webhookSecret: filled(process.env.STRIPE_WEBHOOK_SECRET) ? process.env.STRIPE_WEBHOOK_SECRET : undefined,
    vercelEnv: process.env.VERCEL_ENV,
  });
}

export function packsOpen(): boolean {
  if (!checkoutOpen()) return false;
  const env = stripeEnv.get();
  if (!packsForSale()) return false;
  if (isMockMode()) return !!env.STRIPE_PRICE_PACK_25 && !!env.STRIPE_PRICE_PACK_100;
  const house = houseKeysEnv.get();
  return packsReady({
    checkout: true,
    pack25PriceId: env.STRIPE_PRICE_PACK_25,
    pack100PriceId: env.STRIPE_PRICE_PACK_100,
    dataKey: !!(house.HOUSE_DATAFORSEO_LOGIN && house.HOUSE_DATAFORSEO_PASSWORD),
    aiKeys: [house.HOUSE_OPENAI_API_KEY, house.HOUSE_PERPLEXITY_API_KEY, house.HOUSE_GEMINI_API_KEY].filter(Boolean).length,
  });
}

/**
 * The free check needs our own data key and bot protection. It runs without an account on the house's
 * paid keys, so Turnstile is required on EVERY deployment that uses real keys, previews included
 * (a public preview address would otherwise be an open, paid endpoint). Mock mode (local only) is exempt.
 */
export function freeCheckOpen(): boolean {
  if (isMockMode()) return true;
  const house = houseKeysEnv.get();
  const hasData = !!(house.HOUSE_DATAFORSEO_LOGIN && house.HOUSE_DATAFORSEO_PASSWORD);
  const botProtection = !!miscEnv.turnstileSiteKey() && turnstileEnv.isConfigured();
  return hasData && botProtection;
}
