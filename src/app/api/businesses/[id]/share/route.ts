import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { randomToken } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function ownedBusiness(workspaceId: string, rawId: string) {
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return null;
  const { data } = await supabaseAdmin().from("businesses").select("id").eq("id", id.data).eq("workspace_id", workspaceId).maybeSingle();
  return data;
}

/**
 * Create the business's live share link, or regenerate it (the old link stops working).
 * Slugs are 16 random URL-safe characters: unguessable, never indexed.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "Share links need lifetime access.");
    const business = await ownedBusiness(ctx.workspace.id, (await params).id);
    if (!business) return err(404, "not_found", "Unknown business.");
    const admin = supabaseAdmin();
    await admin.from("reports").update({ revoked: true, updated_at: new Date().toISOString() }).eq("business_id", business.id).eq("kind", "share").eq("revoked", false);
    const slug = randomToken(12);
    const { error } = await admin.from("reports").insert({ workspace_id: ctx.workspace.id, business_id: business.id, kind: "share", share_slug: slug, status: "ready" });
    if (error) return err(500, "server_error", "The share link could not be created.");
    return json({ ok: true, slug });
  });
}

/** Revoke the share link: /r/{slug} returns 404 from now on. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (ctx) => {
    const business = await ownedBusiness(ctx.workspace.id, (await params).id);
    if (!business) return err(404, "not_found", "Unknown business.");
    const { error } = await supabaseAdmin().from("reports").update({ revoked: true, updated_at: new Date().toISOString() }).eq("business_id", business.id).eq("kind", "share").eq("revoked", false);
    return error ? err(500, "server_error", "The link could not be revoked.") : json({ ok: true });
  });
}
