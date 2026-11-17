import { config } from "dotenv";

// Database tests truncate tables. They run against the LOCAL stack only (docker compose in
// db/local), never against Neon or any other hosted database.
config({ path: ".env.local", quiet: true });

const LOCAL = /^(http|postgres(ql)?):\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/;
for (const name of ["DATA_API_URL", "DATABASE_URL"] as const) {
  const value = process.env[name] ?? "";
  if (value && !LOCAL.test(value)) {
    throw new Error(`Refusing to run tests: ${name} does not point at the local database.`);
  }
}
