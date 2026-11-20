#!/usr/bin/env node
/**
 * Announce every URL in the live sitemap through IndexNow, once (for example after a deploy that
 * adds or rewrites pages). Regional pages announce themselves when the cron rebuilds them
 * (src/lib/regional.ts); this is for everything else.
 *
 *   node scripts/indexnow.mjs            # https://rankbyai.live
 *   node scripts/indexnow.mjs --dry-run  # print what would be sent
 *
 * The key must match src/lib/indexnow.ts and the file public/{key}.txt, which engines fetch to verify it.
 */
const SITE = "https://rankbyai.live";
const KEY = "b8fa8481ec2ebacdd9740bd23284e3a1";
const dry = process.argv.includes("--dry-run");

const keyFile = await fetch(`${SITE}/${KEY}.txt`);
if (!keyFile.ok || (await keyFile.text()).trim() !== KEY) {
  console.error(`The key file ${SITE}/${KEY}.txt is not live yet (HTTP ${keyFile.status}). Deploy first.`);
  process.exit(1);
}
const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
const urls = [...new Set([...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]).filter((u) => u.startsWith(SITE)))];
const body = { host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls };
if (dry) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}
const res = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
console.log(`IndexNow: ${urls.length} URLs sent, HTTP ${res.status} ${res.status === 200 || res.status === 202 ? "(accepted)" : await res.text()}`);
