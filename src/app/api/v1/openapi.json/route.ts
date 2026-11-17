import { openApiSpec } from "@/lib/api-v1/openapi";
import { publicEnv } from "@/lib/env-public";

/** OpenAPI 3.1 description of the REST API. Public: it contains no data. */
export function GET() {
  return Response.json(openApiSpec(publicEnv.siteUrl), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
