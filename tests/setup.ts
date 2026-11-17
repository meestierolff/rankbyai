import { config } from "dotenv";

// Tests run against the LOCAL Supabase stack only (never a hosted project).
config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (url && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  throw new Error(`Refusing to run tests against a non-local database: ${url}`);
}
