import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { NextResponse } from "next/server";
import {
  createSessionToken,
  isAllowedRequestOrigin,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  type AuthenticatedRole,
  type SessionUser,
} from "@/lib/auth";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { saveWaitlistRequest, WAITLIST_SUCCESS_MESSAGE } from "@/lib/waitlist-requests";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;
const CORE_ACCOUNTS: Readonly<Record<string, { name: string; role: AuthenticatedRole }>> = {
  "aarashvoss@gmail.com": { name: "AVoss", role: "instructor" },
  "aarashvossoughi@gmail.com": { name: "Arash Vossoughi", role: "student" },
  "f.soheilikia.lastqueen2002@gmail.com": { name: "Fateme Soheilikia", role: "student" },
};

export async function POST(request: Request) {
  if (!isAllowedRequestOrigin(request)) {
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
  const submittedName = typeof body.name === "string" ? body.name.trim() : "";
  const coreAccount = CORE_ACCOUNTS[email];
  const name = coreAccount?.name ?? submittedName;
  const password = typeof body.password === "string" ? body.password : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254 || !name || name.length > 120) {
    return NextResponse.json({ error: "Enter a valid name and email address." }, { status: 400 });
  }

  const userId = randomUUID();
  const profileToken = randomUUID();
  let pool: ReturnType<typeof getPostgresPool>;
  try {
    await initializeDatabase();
    pool = getPostgresPool();
    if (!coreAccount) {
      await saveWaitlistRequest(name, email);
      return NextResponse.json({
        message: WAITLIST_SUCCESS_MESSAGE,
        waitlisted: true,
      });
    }

    const invitation = await pool.query(
      "SELECT 1 FROM public.allowed_users WHERE lower(email) = $1 LIMIT 1",
      [email],
    );
    if (invitation.rowCount === 0) {
      return NextResponse.json(
        { error: "This account is not enabled for sign-up yet. Please contact the administrator to request access." },
        { status: 403 },
      );
    }
  } catch (error) {
    logDatabaseError("Native sign-up authorization or waitlist operation failed:", error);
    return NextResponse.json({ error: "Sign-up is temporarily unavailable." }, { status: 503 });
  }

  const passwordBytes = Buffer.byteLength(password, "utf8");
  if (password.length < 12 || passwordBytes > 72) {
    return NextResponse.json({ error: "Password must be at least 12 characters and no more than 72 UTF-8 bytes." }, { status: 400 });
  }

  const user: SessionUser = {
    id: userId,
    email,
    role: coreAccount?.role ?? "student",
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
      `INSERT INTO public.profiles (id, token, full_name, role)
       VALUES ($1, $2, $3, $4)`,
      [userId, profileToken, name, user.role],
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
        logDatabaseError("Native sign-up transaction rollback failed:", rollbackError);
      }
    }
    const code = (error as { code?: string }).code;
    logDatabaseError("Native sign-up database operation failed:", error);
    if (code === "23505") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Account creation failed. Please try again." }, { status: 500 });
  } finally {
    client?.release();
  }
}
