import { z } from "zod";
import { err, json, requireOwner, withSession } from "@/lib/api";
import { dbAdmin } from "@/lib/db/clients";

const httpUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a full web address starting with https://");

const Body = z.object({
  brand_name: z.string().trim().max(80).nullable(),
  brand_color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  brand_website: httpUrl.nullable(),
  reply_to_email: z.email().max(254).nullable(),
  hide_rankbyai_branding: z.boolean(),
  report_default_view: z.enum(["map", "grid"]),
});

/** White-label settings for share links and PDFs. Only http(s) websites are accepted (the report links to it). */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    const denied = requireOwner(ctx);
    if (denied) return denied;
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "White-label branding needs lifetime access.");
    const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : (v ?? null));
    const parsed = Body.safeParse(
      raw && {
        brand_name: blankToNull(raw.brand_name),
        brand_color_hex: blankToNull(raw.brand_color_hex),
        brand_website: blankToNull(raw.brand_website),
        reply_to_email: blankToNull(raw.reply_to_email),
        hide_rankbyai_branding: raw.hide_rankbyai_branding === true,
        report_default_view: raw.report_default_view === "grid" ? "grid" : "map",
      },
    );
    if (!parsed.success) return err(400, "invalid_body", parsed.error.issues[0]?.message ?? "Check the branding fields.");
    const { error } = await dbAdmin().from("workspaces").update(parsed.data).eq("id", ctx.workspace.id);
    return error ? err(500, "server_error", "Branding could not be saved.") : json({ ok: true });
  });
}
