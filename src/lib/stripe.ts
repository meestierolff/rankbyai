import "server-only";
import Stripe from "stripe";
import { stripeEnv } from "@/lib/env";

let stripe: Stripe | undefined;

/** Stripe client. Throws MissingEnvError naming the variables when Stripe is not configured. */
export function getStripe(): Stripe {
  if (stripe) return stripe;
  const env = stripeEnv.get();
  stripe = new Stripe(env.STRIPE_SECRET_KEY, { appInfo: { name: "RankbyAI", url: "https://rankbyai.live" } });
  return stripe;
}

export const isLiveStripeKey = (key: string | undefined) => !!key && key.startsWith("sk_live_");
