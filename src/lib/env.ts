import { z } from "zod";

/**
 * Environment validation, lazy per feature.
 *
 * Nothing is validated at import time, so `next build` and preview deploys work
 * before every secret exists. Each feature calls its accessor and gets either a
 * typed object or a MissingEnvError that names exactly which variables to set.
 * Variable NAMES follow the build brief (section 5). Values are never logged.
 */
export class MissingEnvError extends Error {
  readonly feature: string;
  readonly missing: string[];
  constructor(feature: string, missing: string[]) {
    super(`[env] "${feature}" is not configured. Set: ${missing.join(", ")}`);
    this.name = "MissingEnvError";
    this.feature = feature;
    this.missing = missing;
  }
}

type Shape = Record<string, z.ZodType>;

function group<S extends Shape>(feature: string, shape: S, read: () => Record<keyof S, string | undefined>) {
  const schema = z.object(shape);
  let cached: z.infer<typeof schema> | undefined;
  const get = (): z.infer<typeof schema> => {
    if (cached) return cached;
    const raw = read();
    const cleaned = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? undefined : v]),
    );
    const parsed = schema.safeParse(cleaned);
    if (!parsed.success) {
      const missing = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
      throw new MissingEnvError(feature, missing);
    }
    cached = parsed.data;
    return cached;
  };
  const isConfigured = (): boolean => {
    try {
      get();
      return true;
    } catch {
      return false;
    }
  };
  return { get, isConfigured };
}

const str = z.string().min(1);
const num = (def: number) => z.coerce.number().default(def);

// NEXT_PUBLIC_* must be referenced statically so Next can inline them in client bundles.
export const publicEnv = {
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "https://rankbyai.live").replace(/\/$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
};

export const supabasePublicEnv = group(
  "supabase",
  { NEXT_PUBLIC_SUPABASE_URL: z.url(), NEXT_PUBLIC_SUPABASE_ANON_KEY: str },
  () => ({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }),
);

export const supabaseAdminEnv = group(
  "supabase-admin",
  { NEXT_PUBLIC_SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: str },
  () => ({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }),
);

export const stripeEnv = group(
  "stripe",
  {
    STRIPE_SECRET_KEY: str,
    STRIPE_PRODUCT_LIFETIME: str,
    STRIPE_PRICE_PACK_25: str.optional(),
    STRIPE_PRICE_PACK_100: str.optional(),
    STRIPE_TAX_CODE_SAAS: str.optional(),
  },
  () => ({
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PRODUCT_LIFETIME: process.env.STRIPE_PRODUCT_LIFETIME,
    STRIPE_PRICE_PACK_25: process.env.STRIPE_PRICE_PACK_25,
    STRIPE_PRICE_PACK_100: process.env.STRIPE_PRICE_PACK_100,
    STRIPE_TAX_CODE_SAAS: process.env.STRIPE_TAX_CODE_SAAS,
  }),
);

export const stripeWebhookEnv = group(
  "stripe-webhook",
  { STRIPE_SECRET_KEY: str, STRIPE_WEBHOOK_SECRET: str },
  () => ({
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  }),
);

export const cryptoEnv = group(
  "key-vault",
  {
    KEY_ENCRYPTION_SECRET: str.refine((v) => Buffer.from(v, "base64").length === 32, {
      message: "must be 32 bytes, base64",
    }),
    HASH_PEPPER: str.min(16),
  },
  () => ({
    KEY_ENCRYPTION_SECRET: process.env.KEY_ENCRYPTION_SECRET,
    HASH_PEPPER: process.env.HASH_PEPPER,
  }),
);

export const cronEnv = group("cron", { CRON_SECRET: str.min(16) }, () => ({
  CRON_SECRET: process.env.CRON_SECRET,
}));

export const houseKeysEnv = group(
  "house-keys",
  {
    HOUSE_DATAFORSEO_LOGIN: str.optional(),
    HOUSE_DATAFORSEO_PASSWORD: str.optional(),
    HOUSE_OPENAI_API_KEY: str.optional(),
    HOUSE_PERPLEXITY_API_KEY: str.optional(),
    HOUSE_GEMINI_API_KEY: str.optional(),
  },
  () => ({
    HOUSE_DATAFORSEO_LOGIN: process.env.HOUSE_DATAFORSEO_LOGIN,
    HOUSE_DATAFORSEO_PASSWORD: process.env.HOUSE_DATAFORSEO_PASSWORD,
    HOUSE_OPENAI_API_KEY: process.env.HOUSE_OPENAI_API_KEY,
    HOUSE_PERPLEXITY_API_KEY: process.env.HOUSE_PERPLEXITY_API_KEY,
    HOUSE_GEMINI_API_KEY: process.env.HOUSE_GEMINI_API_KEY,
  }),
);

export const dataforseoPingbackEnv = group(
  "dataforseo-pingback",
  { DATAFORSEO_PINGBACK_SECRET: str.min(16) },
  () => ({ DATAFORSEO_PINGBACK_SECRET: process.env.DATAFORSEO_PINGBACK_SECRET }),
);

/** Model ids are configuration, not secrets. Defaults are set in lib/providers/models.ts. */
export const modelEnv = {
  openai: () => process.env.OPENAI_MODEL || undefined,
  perplexity: () => process.env.PERPLEXITY_MODEL || undefined,
  gemini: () => process.env.GEMINI_MODEL || undefined,
  fixes: () => process.env.LLM_FIXES_MODEL || undefined,
};

export const costEnv = group(
  "cost-guard",
  {
    COST_MAX_PER_CREDIT_USD: num(0.3),
    COST_DAILY_HOUSE_CAP_USD: num(15),
    COST_DAILY_FREE_CAP_USD: num(3),
    FREE_CHECKS_PER_EMAIL: num(1),
    FREE_CHECKS_PER_IP_PER_DAY: num(3),
  },
  () => ({
    COST_MAX_PER_CREDIT_USD: process.env.COST_MAX_PER_CREDIT_USD,
    COST_DAILY_HOUSE_CAP_USD: process.env.COST_DAILY_HOUSE_CAP_USD,
    COST_DAILY_FREE_CAP_USD: process.env.COST_DAILY_FREE_CAP_USD,
    FREE_CHECKS_PER_EMAIL: process.env.FREE_CHECKS_PER_EMAIL,
    FREE_CHECKS_PER_IP_PER_DAY: process.env.FREE_CHECKS_PER_IP_PER_DAY,
  }),
);

export const emailEnv = group("email", { RESEND_API_KEY: str, EMAIL_FROM: str }, () => ({
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
}));

export const turnstileEnv = group("turnstile", { TURNSTILE_SECRET_KEY: str }, () => ({
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
}));

/** Legal identity shown in the footer and legal pages. Placeholders are visibly marked, never invented. */
export const legalEnv = {
  entityName: () => process.env.LEGAL_ENTITY_NAME || "",
  address: () => process.env.LEGAL_ADDRESS || "",
  email: () => process.env.LEGAL_EMAIL || "",
  kvk: () => process.env.LEGAL_KVK || "",
};

export const miscEnv = {
  sodTrackerSrc: () => process.env.SOD_TRACKER_SNIPPET_SRC || "",
  earlyAccessNote: () => process.env.EARLY_ACCESS_NOTE || "",
  dataforseoAffiliateUrl: () => process.env.DATAFORSEO_AFFILIATE_URL || "",
  adminUserIds: () =>
    (process.env.ADMIN_USER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  /** TURNSTILE_SITE_KEY (brief name) is server-rendered into the widget; it is a public value. */
  turnstileSiteKey: () => process.env.TURNSTILE_SITE_KEY || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
};
