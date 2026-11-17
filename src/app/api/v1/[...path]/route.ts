import { after } from "next/server";
import { handleRest } from "@/lib/api-v1/rest";

export const maxDuration = 300;

type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (request: Request, { params }: Ctx) => handleRest(request, (await params).path, (work) => after(work));

export { handle as GET, handle as POST };
