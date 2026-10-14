import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  createSessionToken,
  isAllowedRequestOrigin,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  type AuthenticatedRole,
} from "@/lib/auth";
import { getPostgresPool, initializeDatabase } from "@/lib/db";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginUser {
  id: string;
  email: string;
  password_hash: string;
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
    const result = await getPostgresPool().query<LoginUser>(
      `SELECT users.id, users.email, users.password_hash,
              COALESCE(profiles.role, CASE WHEN instructors.id IS NOT NULL THEN 'instructor' ELSE 'student' END) AS role,
              profiles.full_name AS name
       FROM public.users AS users
       LEFT JOIN public.profiles AS profiles ON profiles.id = users.id
       LEFT JOIN public.instructors AS instructors ON instructors.id = users.id
       WHERE lower(users.email) = $1
         AND users.password_hash IS NOT NULL
       LIMIT 1`,
      [email],
    );
    const user = result.rows[0];
    const passwordMatches = user
      ? await bcrypt.compare(password, user.password_hash)
      : await bcrypt.hash(password, 12).then(() => false);
    if (!user || !passwordMatches) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    let token: string;
    try {
      token = await createSessionToken({
        id: user.id,
        email: user.email,
        role: user.role,
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
        role: user.role,
        ...(user.name ? { name: user.name } : {}),
      },
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Native sign-in failed:", error);
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 500 });
  }
}
