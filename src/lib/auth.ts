import "server-only";
import { cache } from "react";
import { io } from "next/cache";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabasePublicEnv, miscEnv } from "@/lib/env";

export interface Workspace {
  id: string;
  owner_id: string;
  name: string;
  plan: "locked" | "lifetime";
  lifetime_seat: number | null;
  brand_name: string | null;
  brand_logo_path: string | null;
  brand_color_hex: string | null;
  brand_website: string | null;
  reply_to_email: string | null;
  hide_rankbyai_branding: boolean;
  share_scans_for_regional_pages: boolean;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface SessionContext {
  user: User;
  workspace: Workspace;
  role: "owner" | "member";
  isAdmin: boolean;
}

/** Current user + their workspace (RLS-scoped), or null when signed out / auth not configured. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  // Everything behind a session is request-time work (it may read the clock, generate ids, etc.).
  await io();
  if (!supabasePublicEnv.isConfigured()) return null;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const user = data.user;

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("role, workspaces(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const row = memberships?.[0] as { role: "owner" | "member"; workspaces: Workspace | Workspace[] } | undefined;
  const workspace = row ? (Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces) : undefined;
  if (!row || !workspace) return null;

  return { user, workspace, role: row.role, isAdmin: miscEnv.adminUserIds().includes(user.id) };
});

export async function requireSession(nextPath = "/app"): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return ctx;
}

export async function requireAdmin(): Promise<SessionContext> {
  const ctx = await requireSession("/admin");
  if (!ctx.isAdmin) redirect("/app");
  return ctx;
}

const PLACEHOLDER_ORIGIN = "https://placeholder.invalid";

/**
 * Post-login redirect target. Returns a same-site path, never an origin.
 * The value is normalised with the same URL parser the redirect uses, so tricks that rely on
 * parser differences ("//host", "/\\host", tabs or newlines inside the path) fall back to the default.
 * Absolute http(s) URLs (the magic-link template passes one) contribute only their path, query and hash.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next) return fallback;
  const stripped = String(next).replace(/[\u0000-\u001f\u007f\s]/g, "");
  if (!stripped || stripped.includes("\\")) return fallback;
  let path: string;
  try {
    if (/^https?:\/\//i.test(stripped)) {
      const abs = new URL(stripped);
      path = abs.pathname + abs.search + abs.hash; // the origin is deliberately discarded
    } else {
      path = stripped;
    }
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    const u = new URL(path, PLACEHOLDER_ORIGIN);
    if (u.origin !== PLACEHOLDER_ORIGIN) return fallback;
    const out = u.pathname + u.search + u.hash;
    return out.startsWith("/") && !out.startsWith("//") ? out : fallback;
  } catch {
    return fallback;
  }
}
