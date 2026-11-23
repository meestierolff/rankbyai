#!/usr/bin/env node
// Targeted hosted smoke check. Creates only disposable users and a separate test code, then
// removes exactly those rows. Unlike the local test suite, this never truncates a table.
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { importJWK, SignJWT } from "jose";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const jwk = JSON.parse(process.env.DATA_API_JWT_PRIVATE_JWK);
const key = await importJWK(jwk, jwk.alg ?? "ES256");
const users = [randomUUID(), randomUUID()];
const batchId = randomUUID();
const codeHash = createHash("sha256").update(randomBytes(24)).digest("hex");
const api = process.env.DATA_API_URL.replace(/\/$/, "");
async function call(role, workspace, user) {
  const token = await new SignJWT({ role }).setProtectedHeader({ alg: jwk.alg ?? "ES256", kid: jwk.kid })
    .setIssuedAt().setExpirationTime("2m").setIssuer("rankbyai").setAudience("rankbyai-data-api").sign(key);
  const response = await fetch(`${api}/rpc/redeem_appsumo_code`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_code_hash: codeHash, p_workspace_id: workspace, p_user_id: user }),
  });
  return { status: response.status, body: await response.json() };
}
function check(condition, label) { if (!condition) throw new Error(label); console.log(`PASS ${label}`); }
await db.connect();
try {
  const workspaces = [];
  for (const user of users) {
    const r = await db.query("select public.ensure_user($1,$2) as id", [user, `${user}@appsumo-check.rankbyai.invalid`]);
    workspaces.push(r.rows[0].id);
  }
  await db.query("insert into public.appsumo_code_batches(id,name) values ($1,$2)", [batchId, `smoke-${batchId}`]);
  await db.query("insert into public.appsumo_codes(code_hash,batch_id) values ($1,$2)", [codeHash, batchId]);
  const first = await call("service_role", workspaces[0], users[0]);
  if (first.status !== 200 || !first.body.ok) console.error({ status: first.status, error: first.body.code ?? first.body.error, message: first.body.message });
  check(first.status === 200 && first.body.ok && !first.body.replayed, "hosted Data API redeems a test code");
  const repeat = await call("service_role", workspaces[0], users[0]);
  check(repeat.status === 200 && repeat.body.replayed, "same workspace can safely retry");
  const other = await call("service_role", workspaces[1], users[1]);
  check(other.body.error === "invalid_code", "another workspace cannot reuse the code");
  const denied = await call("anonymous", workspaces[1], users[1]);
  check([401,403,404].includes(denied.status), "anonymous database clients cannot call the redemption function");
  const result = await db.query("select plan,(select count(*)::int from public.entitlements where workspace_id=$1) as entitlements,(select count(*)::int from public.orders where workspace_id=$1) as orders from public.workspaces where id=$1", [workspaces[0]]);
  check(result.rows[0].plan === "lifetime" && result.rows[0].entitlements === 1 && result.rows[0].orders === 0, "one lifetime entitlement, no Stripe order");
} finally {
  // Filter on generated ids, never on a shared prefix or existing customer attributes.
  try {
    await db.query("delete from public.appsumo_codes where batch_id=$1", [batchId]);
    await db.query("delete from public.appsumo_code_batches where id=$1", [batchId]);
    await db.query("delete from public.workspaces where owner_id=any($1::uuid[])", [users]);
    await db.query("delete from public.profiles where id=any($1::uuid[])", [users]);
    console.log("Removed disposable smoke-check records");
  } finally { await db.end(); }
}
