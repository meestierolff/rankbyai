import { z } from "zod";
import { err, json, requireOwner, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import { deleteCredential, saveCredential } from "@/lib/keys";

const Save = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("dataforseo"), login: z.string().trim().min(3).max(200), password: z.string().min(4).max(200) }),
  z.object({ provider: z.enum(["openai", "perplexity", "gemini"]), key: z.string().trim().min(12).max(400) }),
]);

/**
 * Key vault endpoints. Write-only by design: POST tests + stores a key, DELETE removes it.
 * There is no GET here and no response ever contains a key or its ciphertext.
 */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    const parsed = Save.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Enter the key (or the DataForSEO login and password).");
    const result = await saveCredential(ctx.workspace.id, parsed.data);
    await captureServer("key_saved", ctx.workspace.id, { provider: parsed.data.provider, valid: result.ok });
    return result.ok ? json({ ok: true, message: result.message }) : err(400, "key_rejected", result.message);
  });
}

export async function DELETE(request: Request) {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    const provider = z.enum(["dataforseo", "openai", "perplexity", "gemini"]).safeParse(new URL(request.url).searchParams.get("provider"));
    if (!provider.success) return err(400, "invalid_provider", "Unknown provider.");
    const ok = await deleteCredential(ctx.workspace.id, provider.data);
    return ok ? json({ ok: true }) : err(500, "server_error", "The key could not be deleted.");
  });
}
