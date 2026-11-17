import "server-only";
import { cache } from "react";
import { io } from "next/cache";
import { redirect } from "next/navigation";
import { captureServer } from "@/lib/analytics-server";
import { isAuthConfigured, neonAuth } from "@/lib/auth-neon/server";
import { dbAdmin, dbUser, isDatabaseConfigured } from "@/lib/db/clients";
import { miscEnv } from "@/lib/env";

export { safeNextPath } from "@/lib/safe-next";

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

export interface SessionUser {
  id: string;
  email: string;
  /** Google sign-in delivers a verified address. */
  emailVerified: boolean;
  name: string | null;
}

export interface SessionContext {
  user: SessionUser;
  workspace: Workspace;
  role: "owner" | "member";
  isAdmin: boolean;
}

type MembershipRow = { role: "owner" | "member"; workspaces: Workspace | Workspace[] };

async function loadMembership(userId: string): Promise<{ role: "owner" | "member"; workspace: Workspace } | null> {
  const { data, error } = await dbUser(userId)
    .from("workspace_members")
    .select("role, workspaces(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  // A failed lookup is not "this user has no workspace yet": never fall through to first-sign-in setup.
  if (error) throw new Error(`workspace lookup failed (${error.code ?? "unknown"})`);
  const row = (data as MembershipRow[] | null)?.[0];
  const workspace = row ? (Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces) : undefined;
  return row && workspace ? { role: row.role, workspace } : null;
}

/** Current user + their workspace (read through RLS), or null when signed out or not configured. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  // Everything behind a session is request-time work (it may read the clock, generate ids, etc.).
  await io();
  if (!isAuthConfigured() || !isDatabaseConfigured()) return null;

  const { data: session } = await neonAuth().getSession();
  const u = session?.user;
  if (!u?.id || !u.email) return null;
  const user: SessionUser = { id: u.id, email: u.email, emailVerified: u.emailVerified === true, name: u.name ?? null };

  let membership = await loadMembership(user.id);
  if (!membership) {
    // First sign-in: create the profile and a personal workspace, then read it back through RLS.
    const { error } = await dbAdmin().rpc("ensure_user", { p_id: user.id, p_email: user.email });
    if (error) return null;
    await captureServer("signup_completed", user.id);
    membership = await loadMembership(user.id);
  }
  if (!membership) return null;
  return { user, workspace: membership.workspace, role: membership.role, isAdmin: miscEnv.adminUserIds().includes(user.id) };
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
