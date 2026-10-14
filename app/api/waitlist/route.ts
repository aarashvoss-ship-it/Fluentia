import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth";
import { getPostgresPool } from "@/lib/db";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOTIFICATION_RECIPIENT = "aarashvoss@gmail.com";
const SUCCESS_MESSAGE = "Your request has been submitted. We will contact you soon.";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
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

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const result = await getPostgresPool().query<{ id: string }>(
      `INSERT INTO public.waitlist_requests (email)
       VALUES ($1)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [email],
    );

    if (result.rows[0]) {
      console.info("Waitlist email notification intent recorded.", {
        requestId: result.rows[0].id,
        recipient: NOTIFICATION_RECIPIENT,
        channel: "email",
      });
    }

    return NextResponse.json({ message: SUCCESS_MESSAGE });
  } catch (error) {
    console.error("Waitlist request could not be saved:", {
      code: (error as { code?: string }).code,
    });
    return NextResponse.json(
      { error: "We could not save your request. Please try again." },
      { status: 503 },
    );
  }
}
