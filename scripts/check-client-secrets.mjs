#!/usr/bin/env node
/**
 * Fails if anything secret-looking reaches the browser bundles (.next/static).
 * Checks (1) the actual VALUES of every server-only variable in .env.local / the environment,
 * (2) the NAMES of server-only variables, and (3) well-known secret prefixes.
 * Run after `next build`:  pnpm check:secrets
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const staticDir = join(root, ".next", "static");
if (!existsSync(staticDir)) {
  console.error("No .next/static directory. Run `pnpm build` first.");
  process.exit(2);
}

const SERVER_ONLY_NAMES = [
  "DATA_API_JWT_PRIVATE_JWK", "DATABASE_URL", "NEON_AUTH_COOKIE_SECRET", "STORAGE_SECRET_ACCESS_KEY", "KEY_ENCRYPTION_SECRET", "HASH_PEPPER", "CRON_SECRET",
  "HOUSE_DATAFORSEO_LOGIN", "HOUSE_DATAFORSEO_PASSWORD", "HOUSE_OPENAI_API_KEY", "HOUSE_PERPLEXITY_API_KEY",
  "HOUSE_GEMINI_API_KEY", "DATAFORSEO_PINGBACK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY", "BREVO_API_KEY", "TURNSTILE_SECRET_KEY",
];
const PREFIXES = [/sk_live_[A-Za-z0-9]{8,}/, /sk_test_[A-Za-z0-9]{8,}/, /rk_live_[A-Za-z0-9]{8,}/, /whsec_[A-Za-z0-9]{8,}/, /sb_secret_[A-Za-z0-9_-]{8,}/, /"d":"[A-Za-z0-9_-]{20,}"/, /re_[A-Za-z0-9]{20,}/];

const env = { ...process.env };
for (const file of [".env.local", ".env"]) {
  const p = join(root, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:#.*)?$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const secretValues = SERVER_ONLY_NAMES.map((n) => [n, env[n]]).filter(([, v]) => v && v.length >= 8);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|json|html|txt|map)$/.test(name)) files.push(p);
  }
})(staticDir);

const problems = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const [name, value] of secretValues) if (text.includes(value)) problems.push(`${file}: contains the VALUE of ${name}`);
  for (const name of SERVER_ONLY_NAMES) if (text.includes(name)) problems.push(`${file}: mentions server-only variable ${name}`);
  for (const re of PREFIXES) if (re.test(text)) problems.push(`${file}: matches secret pattern ${re}`);
  // The decoded JWT payload of a service-role key
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[0].split(".")[1], "base64url").toString("utf8"));
      if (payload.role === "service_role") problems.push(`${file}: contains a service_role JWT`);
    } catch {}
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} possible secret leak(s) in client bundles:`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`✓ No secrets in client bundles (${files.length} files, ${secretValues.length} secret values and ${SERVER_ONLY_NAMES.length} names checked).`);
