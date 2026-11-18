import { after } from "next/server";
import { handleOptions, handleRest } from "@/lib/api-v1/rest";

export const maxDuration = 300;

type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (request: Request, { params }: Ctx) => handleRest(request, (await params).path, (work) => after(work));

/** Answers with the methods of the requested path, so OPTIONS never advertises one that is not served. */
export async function OPTIONS(_request: Request, { params }: Ctx) {
  return handleOptions((await params).path);
}

export { handle as GET, handle as HEAD, handle as POST, handle as PATCH, handle as DELETE };
