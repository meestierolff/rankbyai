import { err, json, requireOwner, withSession } from "@/lib/api";
import { dbAdmin } from "@/lib/db/clients";
import { isStorageConfigured, putObject, removeObject } from "@/lib/storage";

const MAX_BYTES = 512 * 1024;

/** Detect the image type from its first bytes. The client-supplied type and file name are not trusted. */
function sniff(bytes: Uint8Array): { ext: string; type: string } | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: "png", type: "image/png" };
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { ext: "webp", type: "image/webp" };
  return null;
}

/** Upload the agency logo (PNG, JPEG or WebP, up to 512 KB). SVG is not accepted. Stored in a private bucket. */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "White-label branding needs lifetime access.");
    const form = await request.formData().catch(() => null);
    const file = form?.get("logo");
    if (!(file instanceof File)) return err(400, "invalid_body", "Choose an image file.");
    if (file.size > MAX_BYTES) return err(400, "too_large", "The logo must be 512 KB or smaller.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) return err(400, "invalid_type", "Upload a PNG, JPEG or WebP image.");

    if (!isStorageConfigured()) return err(503, "storage_not_configured", "File storage is not configured on this deployment yet.");
    const admin = dbAdmin();
    const path = `${ctx.workspace.id}/logo-${Date.now()}.${kind.ext}`;
    if (!(await putObject(`brand/${path}`, bytes, kind.type))) return err(500, "server_error", "The logo could not be stored.");
    const previous = ctx.workspace.brand_logo_path;
    const { error } = await admin.from("workspaces").update({ brand_logo_path: path }).eq("id", ctx.workspace.id);
    if (error) return err(500, "server_error", "The logo could not be saved.");
    if (previous && previous.startsWith(`${ctx.workspace.id}/`)) await removeObject(`brand/${previous}`);
    return json({ ok: true });
  });
}

export async function DELETE() {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    const admin = dbAdmin();
    const previous = ctx.workspace.brand_logo_path;
    await admin.from("workspaces").update({ brand_logo_path: null }).eq("id", ctx.workspace.id);
    if (previous && previous.startsWith(`${ctx.workspace.id}/`)) await removeObject(`brand/${previous}`);
    return json({ ok: true });
  });
}
