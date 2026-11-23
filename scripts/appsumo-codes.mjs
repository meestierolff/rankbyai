#!/usr/bin/env node
// Run with node --env-file=.env.neon.local scripts/appsumo-codes.mjs
//   --batch <unique-name> --count 1000 --out /private/path/codes.csv
// The CSV is a bearer credential: never commit it, print it, or put it under public/.
import { createHash, randomBytes } from "node:crypto";
import { closeSync, openSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import pg from "pg";

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const count = Number(option("--count") ?? 1000);
const batch = option("--batch");
const output = option("--out");
if (!process.env.DATABASE_URL || !batch || !output || !Number.isInteger(count) || count < 1 || count > 10000) {
  console.error("Set DATABASE_URL and pass --batch <unique-name> --count <1-10000> --out <private-csv-path>.");
  process.exit(2);
}
const path = resolve(output);
const insideRepo = relative(process.cwd(), path);
if (!insideRepo.startsWith("../")) {
  console.error("Save the CSV outside the repository to avoid committing or publishing working codes.");
  process.exit(2);
}
const codes = Array.from({ length: count }, () => `RBAI-${randomBytes(24).toString("hex").toUpperCase()}`);
const hashes = codes.map((code) => createHash("sha256").update(code).digest("hex"));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
let created = false;
try {
  await db.connect();
  // Fail before touching the database if the output already exists or cannot be written.
  const fd = openSync(path, "wx", 0o600);
  created = true;
  try { writeFileSync(fd, `code\n${codes.join("\n")}\n`); } finally { closeSync(fd); }
  await db.query("begin");
  const { rows } = await db.query("insert into public.appsumo_code_batches(name) values ($1) returning id", [batch]);
  await db.query("insert into public.appsumo_codes(code_hash, batch_id) select h, $1::uuid from unnest($2::text[]) h", [rows[0].id, hashes]);
  await db.query("commit");
  console.log(`Created ${count} working codes in batch ${rows[0].id}. Private CSV: ${path}`);
} catch {
  await db.query("rollback").catch(() => {});
  // On an uncertain COMMIT keep the CSV: losing the only plaintext copy is worse than retaining
  // an unregistered file. Check this batch in the database before retrying after a network error.
  if (created) console.error(`Generation failed or could not be confirmed. Keep ${path} private and check the batch before retrying.`);
  else console.error("Could not generate codes. Check the database connection, batch name and output path.");
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
