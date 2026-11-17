import { z } from "zod";
import { err, json, requireOwner, withSession } from "@/lib/api";
import { captureServer } from "@/lib/analytics-server";
import { createApiKey } from "@/lib/api-keys";

const Body = z.object({ name: z.string().trim().min(1).max(80) });

/** Create an API key. The full key is in this response only; it cannot be shown again. */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "API keys need lifetime access.");
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "Give the key a name.");
    const r = await createApiKey(ctx.workspace.id, parsed.data.name);
    if (!r.ok) return err(r.status, r.error, r.message);
    await captureServer("api_key_created", ctx.workspace.id);
    return json({ ok: true, key: r.key, meta: r.meta });
  });
}
