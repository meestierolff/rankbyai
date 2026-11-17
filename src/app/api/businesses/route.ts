import { z } from "zod";
import { err, json, withSession } from "@/lib/api";
import { FAIR_USE } from "@/lib/pricing-constants";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Body = z.object({
  name: z.string().trim().min(1).max(300),
  cid: z.string().max(40).nullish(),
  place_id: z.string().max(200).nullish(),
  address: z.string().max(400).nullish(),
  city: z.string().max(120).nullish(),
  region: z.string().max(120).nullish(),
  country: z.string().max(2).nullish(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  website: z.string().max(500).nullish(),
  phone: z.string().max(40).nullish(),
  primary_category: z.string().max(120).nullish(),
  rating: z.number().min(0).max(5).nullish(),
  reviews_count: z.number().int().min(0).nullish(),
  client_id: z.uuid().nullish(),
});

/** Save a confirmed listing as a tracked business (server-validated). */
export async function POST(request: Request) {
  return withSession(async (ctx) => {
    if (ctx.workspace.plan !== "lifetime") return err(403, "lifetime_required", "Adding businesses needs lifetime access.");
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return err(400, "invalid_body", "The listing is missing a name or a map location.");
    const admin = supabaseAdmin();
    const { count } = await admin.from("businesses").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
    if ((count ?? 0) >= FAIR_USE.businesses) return err(409, "limit_reached", `The fair-use limit is ${FAIR_USE.businesses.toLocaleString("en-US")} businesses per workspace.`);
    const b = parsed.data;
    if (b.cid) {
      const { data: dup } = await admin.from("businesses").select("id").eq("workspace_id", ctx.workspace.id).eq("cid", b.cid).maybeSingle();
      if (dup) return json({ ok: true, id: dup.id, existing: true });
    }
    if (b.client_id) {
      const { data: client } = await admin.from("clients").select("id").eq("id", b.client_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (!client) return err(400, "invalid_client", "That client does not belong to this workspace.");
    }
    const { data, error } = await admin
      .from("businesses")
      .insert({ ...b, workspace_id: ctx.workspace.id, source: "search", website: b.website || null })
      .select("id")
      .single();
    if (error || !data) return err(500, "server_error", "The business could not be saved.");
    return json({ ok: true, id: data.id });
  });
}
