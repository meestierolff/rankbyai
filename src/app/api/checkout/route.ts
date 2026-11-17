import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { MissingEnvError, publicEnv, stripeEnv } from "@/lib/env";
import { dbAdmin } from "@/lib/db/clients";
import { getStripe } from "@/lib/stripe";
import { startCheckout } from "@/lib/checkout";
import { stripeKeyAllowed } from "@/lib/stripe-webhook";
import { captureServer } from "@/lib/analytics-server";

const Body = z.object({
  product_key: z.enum(["lifetime", "pack_25", "pack_100"]),
  expected_price_cents: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return Response.json({ error: "unauthorized", message: "Sign in first." }, { status: 401 });
  if (!ctx.user.email || !ctx.user.emailVerified) {
    return Response.json({ error: "email_unverified", message: "Verify your email first." }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body", message: "product_key is required." }, { status: 400 });

  try {
    const env = stripeEnv.get();
    // The live site sells with live keys only; a test key there would take "payments" that are never fulfilled.
    if (!stripeKeyAllowed(env.STRIPE_SECRET_KEY, process.env.VERCEL_ENV)) {
      return Response.json({ error: "payments_not_open", message: "Checkout is not open on this site yet." }, { status: 503 });
    }
    const result = await startCheckout(
      {
        userId: ctx.user.id,
        email: ctx.user.email,
        workspaceId: ctx.workspace.id,
        workspacePlan: ctx.workspace.plan,
        stripeCustomerId: ctx.workspace.stripe_customer_id,
        productKey: parsed.data.product_key,
        expectedPriceCents: parsed.data.expected_price_cents,
      },
      {
        admin: dbAdmin(),
        stripe: getStripe(),
        siteUrl: publicEnv.siteUrl,
        products: {
          lifetimeProductId: env.STRIPE_PRODUCT_LIFETIME,
          pack25PriceId: env.STRIPE_PRICE_PACK_25,
          pack100PriceId: env.STRIPE_PRICE_PACK_100,
        },
      },
    );
    if (result.status === 200) {
      await captureServer("checkout_started", ctx.workspace.id, { product_key: parsed.data.product_key, price_cents: result.body.price_cents });
    }
    return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof MissingEnvError) {
      return Response.json(
        { error: "payments_not_configured", message: `Payments are not configured yet (${err.missing.join(", ")}).` },
        { status: 503 },
      );
    }
    console.error("[checkout] unexpected error");
    return Response.json({ error: "server_error", message: "Something went wrong. You were not charged." }, { status: 500 });
  }
}
