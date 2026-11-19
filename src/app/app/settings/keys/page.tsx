import type { Metadata } from "next";
import { KeyCards, type KeyCard } from "@/components/app/key-cards";
import { PageHeader } from "@/components/app/ui";
import { requireSession } from "@/lib/auth";
import { packsOpen } from "@/lib/availability";
import { miscEnv } from "@/lib/env";
import { isMockMode } from "@/lib/mock";
import { getKeyStatuses } from "@/lib/workspace-data";

export const metadata: Metadata = { title: "API keys" };

export default async function KeysPage() {
  const ctx = await requireSession("/app/settings/keys");
  const saved = await getKeyStatuses(ctx.workspace.id);
  const find = (p: KeyCard["provider"]) => {
    const k = saved.find((s) => s.provider === p);
    return k ? { hint: k.hint, status: k.status, balance: k.last_balance_usd, validatedAt: k.last_validated_at } : null;
  };
  const affiliate = miscEnv.dataforseoAffiliateUrl();
  const cards: KeyCard[] = [
    {
      provider: "dataforseo",
      title: "DataForSEO",
      use: "Google Maps grids, business search and the Local AI Audit. Needed for everything Maps.",
      signupUrl: affiliate || "https://app.dataforseo.com/register",
      signupLabel: affiliate ? "Create a DataForSEO account (affiliate link: we may earn a commission)" : "Create a DataForSEO account",
      note: "Use the API login and API password from your DataForSEO dashboard, not your site password.",
      saved: find("dataforseo"),
    },
    {
      provider: "openai",
      title: "OpenAI",
      use: "ChatGPT-style answers through the OpenAI API with web search.",
      signupUrl: "https://platform.openai.com/api-keys",
      signupLabel: "Get an OpenAI API key",
      saved: find("openai"),
    },
    {
      provider: "perplexity",
      title: "Perplexity",
      use: "Perplexity answers through the Agent API with web search.",
      signupUrl: "https://www.perplexity.ai/account/api",
      signupLabel: "Get a Perplexity API key",
      note: "If Perplexity's free key check is unavailable we make one tiny test call, about $0.0001 [estimate], on your key.",
      saved: find("perplexity"),
    },
    {
      provider: "gemini",
      title: "Gemini",
      use: "Gemini answers grounded in Google Maps.",
      signupUrl: "https://aistudio.google.com/apikey",
      signupLabel: "Get a Gemini API key",
      note: "The key's project must have billing enabled: Google does not offer Maps grounding on the free tier.",
      saved: find("gemini"),
    },
  ];
  return (
    <>
      <PageHeader
        title="API keys"
        description="Your keys stay yours. Encrypted with AES-256-GCM before they touch the database. Write-only. Used only from our servers. Estimate before every scan, actual cost after."
      />
      {isMockMode() ? (
        <div role="note" className="mb-5 rounded-xl border border-amber/50 bg-surface-2 px-4 py-3 text-[14px] text-amber">
          Development mock mode is on: keys are accepted without contacting the vendor and scans return simulated data.
        </div>
      ) : null}
      <p className="mb-5 max-w-[760px] text-[14px] leading-normal text-muted-foreground">
        Minimum to start: DataForSEO for Maps grids and the audit, and at least one AI key for AI checks. Vendors bill you directly at their
        rates.{packsOpen() ? " No keys? Use included scans from the Billing page." : " Included scans without keys are coming soon."}
      </p>
      <KeyCards cards={cards} canEdit={ctx.role === "owner"} />
    </>
  );
}
