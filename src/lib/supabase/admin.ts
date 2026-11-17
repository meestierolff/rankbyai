import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdminEnv } from "@/lib/env";

let admin: SupabaseClient | undefined;

/** Service-role client. Server only: bypasses RLS, so every caller must authorise first. */
export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const env = supabaseAdminEnv.get();
  admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
