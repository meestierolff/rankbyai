import "server-only";
import { houseKeysEnv, miscEnv, stripeEnv, turnstileEnv } from "@/lib/env";
import { isMockMode } from "@/lib/mock";
import { stripeKeyAllowed } from "@/lib/stripe-webhook";

/**
 * What is switched on in this deployment. Pages use it to say plainly "not open yet" where a
 * button would otherwise lead to an error. Nothing here is a secret: only yes or no.
 */
export function checkoutOpen(): boolean {
  if (!stripeEnv.isConfigured()) return false;
  try {
    return stripeKeyAllowed(stripeEnv.get().STRIPE_SECRET_KEY, process.env.VERCEL_ENV);
  } catch {
    return false;
  }
}

/** The free check needs our own data key, and on the live site also bot protection (it refuses to run without). */
export function freeCheckOpen(): boolean {
  if (isMockMode()) return true;
  const house = houseKeysEnv.get();
  const hasData = !!(house.HOUSE_DATAFORSEO_LOGIN && house.HOUSE_DATAFORSEO_PASSWORD);
  const botProtection = process.env.VERCEL_ENV !== "production" || (!!miscEnv.turnstileSiteKey() && turnstileEnv.isConfigured());
  return hasData && botProtection;
}
