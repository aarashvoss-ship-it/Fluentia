import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { NextResponse } from "next/server";
import {
  createSessionToken,
  isSameOriginRequest,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  type AuthenticatedRole,
  type SessionUser,
} from "@/lib/auth";
import { getPostgresPool } from "@/lib/db";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Provide valid sign-up details." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide valid sign-up details." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const passwordBytes = Buffer.byteLength(password, "utf8");
  if (!EMAIL_PATTERN.test(email) || email.length > 254 || !name || name.length > 120) {
    return NextResponse.json({ error: "Enter a valid name and email address." }, { status: 400 });
  }
  if (password.length < 12 || passwordBytes > 72) {
    return NextResponse.json({ error: "Password must be at least 12 characters and no more than 72 UTF-8 bytes." }, { status: 400 });
  }

  const userId = randomUUID();
  let pool: ReturnType<typeof getPostgresPool>;
  try {
    pool = getPostgresPool();
    const invitation = await pool.query(
      "SELECT 1 FROM public.allowed_users WHERE lower(email) = $1 LIMIT 1",
      [email],
    );
    if (invitation.rowCount === 0) {
      return NextResponse.json({ error: "This email address is not invited to Fluentia." }, { status: 403 });
    }
  } catch (error) {
    console.error("Native sign-up invitation check failed:", {
      code: (error as { code?: string }).code,
    });
    return NextResponse.json({ error: "Sign-up is temporarily unavailable." }, { status: 503 });
  }

  const user: SessionUser = {
    id: userId,
    email,
    role: "student" as AuthenticatedRole,
    name,
  };
  let token: string;
  try {
    token = await createSessionToken(user);
  } catch (error) {
    console.error("Native sign-up session configuration failed:", error);
    return NextResponse.json({ error: "Sign-up is temporarily unavailable." }, { status: 503 });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string; email: string }>(
      `INSERT INTO public.users (id, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email`,
      [userId, email, passwordHash],
    );
    await client.query(
      `INSERT INTO public.profiles (id, full_name, role)
       VALUES ($1, $2, 'student')`,
      [userId, name],
    );
    await client.query("COMMIT");

    user.id = inserted.rows[0].id;
    user.email = inserted.rows[0].email;
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Native sign-up transaction rollback failed:", rollbackError);
      }
    }
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    console.error("Native sign-up failed:", { code });
    return NextResponse.json({ error: "Account creation failed. Please try again." }, { status: 500 });
  } finally {
    client?.release();
  }
}
