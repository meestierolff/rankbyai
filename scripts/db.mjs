#!/usr/bin/env node
/**
 * Database helper.
 *   node scripts/db.mjs setup     local stack: keys → docker compose up → migrate
 *   node scripts/db.mjs migrate   apply db/migrations to DATABASE_URL (or --url <connection string>)
 *   node scripts/db.mjs keys      print a fresh ES256 key pair for the cloud Data API (private JWK + JWKS)
 *   node scripts/db.mjs down      stop the local stack (data is kept)
 * Secrets are written to gitignored files only and never printed, except by `keys`, which you run yourself.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateKeyPair, exportJWK, calculateJwkThumbprint } from "jose";
import pg from "pg";

const root = process.cwd();
const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:57632/rankbyai";
const LOCAL_API = "http://127.0.0.1:57631";
const compose = ["compose", "-f", join(root, "db/local/docker-compose.yml"), "--env-file", join(root, "db/local/.env")];

function readEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function newKeyPair() {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const pub = await exportJWK(publicKey);
  const priv = await exportJWK(privateKey);
  const kid = await calculateJwkThumbprint(pub);
  const meta = { kid, alg: "ES256", use: "sig" };
  return { privateJwk: { ...priv, ...meta }, jwks: { keys: [{ ...pub, ...meta }] } };
}

function setEnvLocal(pairs) {
  const file = join(root, ".env.local");
  let text = existsSync(file) ? readFileSync(file, "utf8") : "";
  for (const [k, v] of Object.entries(pairs)) {
    const line = `${k}=${v}`;
    text = new RegExp(`^${k}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), line) : text.replace(/\n*$/, "\n") + line + "\n";
  }
  writeFileSync(file, text);
}

async function migrate(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("create schema if not exists private");
    await client.query("create table if not exists private.schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await client.query("select name from private.schema_migrations")).rows.map((r) => r.name));
    const files = readdirSync(join(root, "db/migrations")).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      process.stdout.write(`applying ${f} … `);
      await client.query("begin");
      try {
        await client.query(readFileSync(join(root, "db/migrations", f), "utf8"));
        await client.query("insert into private.schema_migrations (name) values ($1)", [f]);
        await client.query("commit");
        console.log("ok");
      } catch (e) {
        await client.query("rollback");
        console.log("FAILED");
        throw e;
      }
    }
    await client.query("notify pgrst, 'reload schema'");
    console.log(`migrations up to date (${files.length} file${files.length === 1 ? "" : "s"})`);
  } finally {
    await client.end();
  }
}

async function waitFor(fn, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await fn()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const cmd = process.argv[2];
if (cmd === "keys") {
  const k = await newKeyPair();
  console.log("# Server env (secret). One line:");
  console.log(`DATA_API_JWT_PRIVATE_JWK=${JSON.stringify(k.privateJwk)}`);
  console.log("\n# Public JWKS (not secret): publish it and give its URL to the Data API");
  console.log(JSON.stringify(k.jwks, null, 2));
} else if (cmd === "setup") {
  const envFile = join(root, "db/local/.env");
  const local = readEnv(join(root, ".env.local"));
  if (!existsSync(envFile) || !local.DATA_API_JWT_PRIVATE_JWK) {
    const k = await newKeyPair();
    writeFileSync(envFile, `LOCAL_JWKS=${JSON.stringify(k.jwks)}\n`);
    setEnvLocal({ DATABASE_URL: LOCAL_DB, DATA_API_URL: LOCAL_API, DATA_API_JWT_PRIVATE_JWK: JSON.stringify(k.privateJwk) });
    console.log("generated a local signing key (private half in .env.local, public half in db/local/.env)");
  }
  execFileSync("docker", [...compose, "up", "-d", "--wait"], { stdio: "inherit" });
  await waitFor(async () => {
    const c = new pg.Client({ connectionString: LOCAL_DB });
    await c.connect();
    await c.end();
    return true;
  }, "Postgres");
  await migrate(LOCAL_DB);
  await waitFor(async () => (await fetch(LOCAL_API + "/")).ok, "PostgREST");
  console.log(`local stack ready: Postgres ${LOCAL_DB.replace(/:[^:@]+@/, ":***@")}  API ${LOCAL_API}`);
} else if (cmd === "migrate") {
  const i = process.argv.indexOf("--url");
  const url = i > -1 ? process.argv[i + 1] : process.env.DATABASE_URL || readEnv(join(root, ".env.local")).DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL or pass --url <connection string>.");
    process.exit(2);
  }
  await migrate(url);
} else if (cmd === "down") {
  execFileSync("docker", [...compose, "down"], { stdio: "inherit" });
} else {
  console.error("usage: node scripts/db.mjs setup | migrate [--url <connection string>] | keys | down");
  process.exit(2);
}
