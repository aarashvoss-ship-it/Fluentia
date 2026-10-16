import { NextResponse } from "next/server";
import { isAllowedRequestOrigin } from "@/lib/auth";
import { initializeDatabase, logDatabaseError } from "@/lib/db";
import { saveWaitlistRequest, WAITLIST_SUCCESS_MESSAGE } from "@/lib/waitlist-requests";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!isAllowedRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name || name.length > 120 || !EMAIL_PATTERN.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid name and email address." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    await saveWaitlistRequest(name, email);
    return NextResponse.json({ message: WAITLIST_SUCCESS_MESSAGE });
  } catch (error) {
    logDatabaseError("Waitlist database operation failed:", error);
    return NextResponse.json(
      { error: "We could not save your request. Please try again." },
      { status: 503 },
    );
  }
}
