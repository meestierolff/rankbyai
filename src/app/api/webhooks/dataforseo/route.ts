import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { dataforseoPingbackEnv } from "@/lib/env";
import { ingestMapsTask, pingbackSignature } from "@/lib/scans/engine";

export const maxDuration = 60;

/**
 * DataForSEO pingback: "task <id> with tag <scan>:<idx> is ready".
 * Authenticated per task: `s` must equal HMAC(secret, tag), so a URL seen in one DataForSEO account
 * cannot be replayed for any other task. The task id must also match the one we stored for that point.
 */
export async function GET(request: Request) {
  if (!dataforseoPingbackEnv.isConfigured()) return new Response("not configured", { status: 503 });
  const sp = new URL(request.url).searchParams;
  const id = sp.get("id");
  const tag = sp.get("tag");
  if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) return new Response("bad id", { status: 400 });
  if (!tag || !/^[0-9a-f-]{36}:\d{1,3}$/.test(tag)) return new Response("bad tag", { status: 400 });
  const given = Buffer.from(sp.get("s") ?? "");
  const expected = Buffer.from(pingbackSignature(tag));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("forbidden", { status: 403 });
  // DataForSEO drops the connection after 10 s: answer now, fetch the result afterwards.
  after(() => ingestMapsTask(id, tag).catch(() => false));
  return new Response("ok");
}
