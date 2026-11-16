import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  createSessionToken,
  isAllowedRequestOrigin,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  type AuthenticatedRole,
} from "@/lib/auth";
import { getPostgresPool, initializeDatabase, shouldUseLocalSqlite } from "@/lib/db";
import { findLocalUserByEmail } from "@/lib/local-sqlite.mjs";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginUser {
  id: string;
  email: string;
  password_hash: string | null;
  role: AuthenticatedRole;
  name: string | null;
}

function isBcryptHash(value: string | null): value is string {
  return value !== null && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

export async function POST(request: Request) {
  if (!isAllowedRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254 || !password || Buffer.byteLength(password, "utf8") > 72) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
  }

  try {
    if (await shouldUseLocalSqlite()) {
      const user = await findLocalUserByEmail(email);
      const storedPasswordMatches = user && isBcryptHash(user.password_hash)
        ? await bcrypt.compare(password, user.password_hash)
        : false;
      if (!user || !storedPasswordMatches) {
        return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
      }

      const token = await createSessionToken({
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      });
      const response = NextResponse.json({
        user: { id: user.id, email: user.email, role: user.role, name: user.name },
      });
      response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
      return response;
    }

    await initializeDatabase();
    const pool = getPostgresPool();
    const result = await pool.query<LoginUser>(
      `SELECT users.id, users.email, users.password_hash,
              COALESCE(profiles.role, CASE WHEN instructors.id IS NOT NULL THEN 'instructor' ELSE 'student' END) AS role,
              profiles.full_name AS name
       FROM public.users AS users
       LEFT JOIN public.profiles AS profiles ON profiles.id = users.id
       LEFT JOIN public.instructors AS instructors ON instructors.id = users.id
       WHERE lower(users.email) = $1
       LIMIT 1`,
      [email],
    );
    const user = result.rows[0];
    const storedPasswordMatches = user && isBcryptHash(user.password_hash)
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!user || !storedPasswordMatches) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const role = user.role;
    let token: string;
    try {
      token = await createSessionToken({
        id: user.id,
        email: user.email,
        role,
        ...(user.name ? { name: user.name } : {}),
      });
    } catch (error) {
      console.error("Native sign-in session configuration failed:", error);
      return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 });
    }
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role,
        ...(user.name ? { name: user.name } : {}),
      },
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error !== null && typeof error === "object" && "code" in error
      && typeof error.code === "string" ? error.code : undefined;
    console.error("Native sign-in database operation failed:", {
      message,
      code,
      stack: error instanceof Error ? error.stack : undefined,
    });

    const connectionErrorCodes = new Set([
      "ENOTFOUND",
      "EAI_AGAIN",
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
    ]);
    const isDatabaseUnavailable = (code !== undefined && connectionErrorCodes.has(code))
      || /DATABASE_URL|POSTGRES_URL|PostgreSQL host/i.test(message);
    return NextResponse.json({
      error: isDatabaseUnavailable
        ? "The database is unreachable or misconfigured. Verify DATABASE_URL is accessible from this machine."
        : "Sign-in is temporarily unavailable.",
    }, { status: 503 });
  }
}
