import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { dataforseoPingbackEnv } from "@/lib/env";
import { ingestMapsTask } from "@/lib/scans/engine";

export const maxDuration = 60;

/** DataForSEO pingback: "task <id> is ready". Authenticated by a shared secret in the query string. */
export async function GET(request: Request) {
  if (!dataforseoPingbackEnv.isConfigured()) return new Response("not configured", { status: 503 });
  const sp = new URL(request.url).searchParams;
  const given = Buffer.from(sp.get("s") ?? "");
  const expected = Buffer.from(dataforseoPingbackEnv.get().DATAFORSEO_PINGBACK_SECRET);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("forbidden", { status: 403 });
  const id = sp.get("id");
  if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) return new Response("bad id", { status: 400 });
  // DataForSEO drops the connection after 10 s: answer now, fetch the result afterwards.
  after(() => ingestMapsTask(id).catch(() => false));
  return new Response("ok");
}
