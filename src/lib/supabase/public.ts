import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "@/lib/env";

let client: SupabaseClient | undefined;

/** Anonymous, cookie-less client for public views (ladder_state, regional_pages). Safe in cached scopes. */
export function supabasePublic(): SupabaseClient {
  if (client) return client;
  const env = supabasePublicEnv.get();
  client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
