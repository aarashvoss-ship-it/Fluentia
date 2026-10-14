import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user) return NextResponse.json({ user: null }, { status: 401, headers });
  return NextResponse.json({ user }, { headers });
}
