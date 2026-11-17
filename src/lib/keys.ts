import "server-only";
import { aadFor, decryptSecret, encryptSecret, fromBytea, toBytea } from "@/lib/crypto";
import { houseKeysEnv } from "@/lib/env";
import { isMockMode } from "@/lib/mock";
import { validateDataForSeo } from "@/lib/providers/dataforseo";
import { validateGemini } from "@/lib/providers/gemini";
import { validateOpenAi } from "@/lib/providers/openai";
import { validatePerplexity } from "@/lib/providers/perplexity";
import { last4, type Provider, type ProviderCredentials, type ValidationResult } from "@/lib/providers/types";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * BYOK vault (brief 7.1). Keys are validated, encrypted with AES-256-GCM (AAD = workspace:provider)
 * and stored write-only: no function here returns a stored secret to a caller outside the provider
 * adapters, and no API route returns plaintext or ciphertext.
 */
export const PROVIDERS: Provider[] = ["dataforseo", "openai", "perplexity", "gemini"];

export type CredentialInput = { provider: "dataforseo"; login: string; password: string } | { provider: "openai" | "perplexity" | "gemini"; key: string };

const serialize = (input: CredentialInput) => (input.provider === "dataforseo" ? JSON.stringify({ login: input.login, password: input.password }) : input.key);

async function validate(input: CredentialInput): Promise<ValidationResult> {
  if (isMockMode()) return { ok: true, message: "Accepted (mock mode, not checked with the vendor).", hint: input.provider === "dataforseo" ? input.login : last4(input.key), balanceUsd: input.provider === "dataforseo" ? 0 : undefined };
  switch (input.provider) {
    case "dataforseo": return validateDataForSeo({ login: input.login, password: input.password });
    case "openai": return validateOpenAi(input.key);
    case "perplexity": return validatePerplexity(input.key);
    case "gemini": return validateGemini(input.key);
  }
}

/** Test the key with the vendor, then encrypt and store it. An invalid key is never stored. */
export async function saveCredential(workspaceId: string, input: CredentialInput): Promise<{ ok: boolean; message: string }> {
  const result = await validate(input);
  if (!result.ok) return { ok: false, message: result.message };
  const sealed = encryptSecret(serialize(input), aadFor(workspaceId, input.provider));
  const { error } = await supabaseAdmin()
    .from("api_credentials")
    .upsert(
      {
        workspace_id: workspaceId,
        provider: input.provider,
        ciphertext: toBytea(sealed.ciphertext),
        iv: toBytea(sealed.iv),
        auth_tag: toBytea(sealed.authTag),
        key_version: sealed.keyVersion,
        hint: result.hint ?? null,
        status: "valid",
        last_validated_at: new Date().toISOString(),
        last_balance_usd: result.balanceUsd ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,provider" },
    );
  if (error) return { ok: false, message: "The key was valid but could not be saved. Try again." };
  return { ok: true, message: result.message };
}

export async function deleteCredential(workspaceId: string, provider: Provider): Promise<boolean> {
  const { error } = await supabaseAdmin().from("api_credentials").delete().eq("workspace_id", workspaceId).eq("provider", provider);
  return !error;
}

export async function markCredential(workspaceId: string, provider: Provider, status: "valid" | "invalid", balanceUsd?: number | null) {
  await supabaseAdmin()
    .from("api_credentials")
    .update({ status, last_validated_at: new Date().toISOString(), ...(balanceUsd !== undefined ? { last_balance_usd: balanceUsd } : {}) })
    .eq("workspace_id", workspaceId)
    .eq("provider", provider);
}

interface Row {
  provider: Provider;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_version: number;
}

/** The workspace's own keys, decrypted for one unit of work. Never log or return the result. */
async function loadByok(workspaceId: string): Promise<ProviderCredentials> {
  const { data, error } = await supabaseAdmin().from("api_credentials").select("provider, ciphertext, iv, auth_tag, key_version").eq("workspace_id", workspaceId);
  if (error) throw new Error("Could not load API keys.");
  const creds: ProviderCredentials = {};
  for (const row of (data ?? []) as Row[]) {
    let plain: string;
    try {
      plain = decryptSecret(
        { ciphertext: fromBytea(row.ciphertext), iv: fromBytea(row.iv), authTag: fromBytea(row.auth_tag), keyVersion: row.key_version },
        aadFor(workspaceId, row.provider),
      );
    } catch {
      continue; // undecryptable (wrong secret or tampered row): treated as "no key"
    }
    if (row.provider === "dataforseo") {
      try {
        const j = JSON.parse(plain) as { login: string; password: string };
        creds.dataforseo = { login: j.login, password: j.password };
      } catch {}
    } else {
      creds[row.provider] = plain;
    }
  }
  return creds;
}

/** House keys: used ONLY for free checks, included-scan credits and the operator's own demos. */
function loadHouse(): ProviderCredentials {
  const env = houseKeysEnv.get();
  const creds: ProviderCredentials = {};
  if (env.HOUSE_DATAFORSEO_LOGIN && env.HOUSE_DATAFORSEO_PASSWORD) creds.dataforseo = { login: env.HOUSE_DATAFORSEO_LOGIN, password: env.HOUSE_DATAFORSEO_PASSWORD };
  if (env.HOUSE_OPENAI_API_KEY) creds.openai = env.HOUSE_OPENAI_API_KEY;
  if (env.HOUSE_PERPLEXITY_API_KEY) creds.perplexity = env.HOUSE_PERPLEXITY_API_KEY;
  if (env.HOUSE_GEMINI_API_KEY) creds.gemini = env.HOUSE_GEMINI_API_KEY;
  return creds;
}

export type Funding = "byok" | "credits" | "free" | "internal";

export async function resolveCredentials(workspaceId: string | null, funding: Funding): Promise<ProviderCredentials> {
  if (isMockMode()) return { dataforseo: { login: "mock", password: "mock" }, openai: "mock", perplexity: "mock", gemini: "mock" };
  if (funding === "byok") {
    if (!workspaceId) throw new Error("A workspace is required for BYOK scans.");
    return loadByok(workspaceId);
  }
  return loadHouse();
}

/** Which providers a funding source can use right now (no secrets). */
export async function availableProviders(workspaceId: string, funding: Funding): Promise<Provider[]> {
  const creds = await resolveCredentials(workspaceId, funding);
  return PROVIDERS.filter((p) => !!creds[p]);
}
