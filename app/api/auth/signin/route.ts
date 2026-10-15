import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  createSessionToken,
  getTemporaryPasswordHash,
  isAllowedRequestOrigin,
  TEMP_PASSWORD_ACCOUNT_ROLES,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  type AuthenticatedRole,
} from "@/lib/auth";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginUser {
  id: string;
  email: string;
  password_hash: string | null;
  role: AuthenticatedRole;
  name: string | null;
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
    let passwordMatches = false;
    let usedTemporaryPassword = false;

    if (user?.password_hash) {
      passwordMatches = await bcrypt.compare(password, user.password_hash);
    } else if (user && TEMP_PASSWORD_ACCOUNT_ROLES.has(email)) {
      const temporaryPasswordHash = getTemporaryPasswordHash(email);
      if (temporaryPasswordHash) {
        passwordMatches = await bcrypt.compare(password, temporaryPasswordHash);
        usedTemporaryPassword = passwordMatches;
      } else {
        await bcrypt.hash(password, 12);
      }
    } else {
      await bcrypt.hash(password, 12);
    }

    if (!user || !passwordMatches) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (usedTemporaryPassword) {
      const permanentPasswordHash = await bcrypt.hash(password, 12);
      await pool.query(
        `UPDATE public.users
         SET password_hash = $1
         WHERE id = $2 AND password_hash IS NULL`,
        [permanentPasswordHash, user.id],
      );
    }

    const role = TEMP_PASSWORD_ACCOUNT_ROLES.get(email) || user.role;
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
    logDatabaseError("Native sign-in database operation failed:", error);
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 500 });
  }
}
