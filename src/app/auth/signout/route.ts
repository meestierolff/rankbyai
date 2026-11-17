import { NextResponse, type NextRequest } from "next/server";
import { isAuthConfigured, neonAuth } from "@/lib/auth-neon/server";

export async function POST(request: NextRequest) {
  if (isAuthConfigured()) {
    try {
      await neonAuth().signOut();
    } catch {
      // the session may already be gone
    }
  }
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}
