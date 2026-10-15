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
const LOCAL_TEST_ACCOUNT_IDS: ReadonlyMap<string, string> = new Map([
  ["aarashvoss@gmail.com", "00000000-0000-4000-8000-000000000001"],
  ["aarashvossoughi@gmail.com", "00000000-0000-4000-8000-000000000002"],
  ["f.soheilikia.lastqueen2002@gmail.com", "00000000-0000-4000-8000-000000000003"],
]);

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
    const temporaryPasswordHash = getTemporaryPasswordHash(email);
    const temporaryPasswordMatches = temporaryPasswordHash
      ? await bcrypt.compare(password, temporaryPasswordHash)
      : false;
    const localTestId = LOCAL_TEST_ACCOUNT_IDS.get(email);
    if (
      process.env.NODE_ENV !== "production"
      && process.env.FLUENTIA_ENABLE_LOCAL_TEST_AUTH === "true"
      && localTestId
      && TEMP_PASSWORD_ACCOUNT_ROLES.has(email)
      && temporaryPasswordMatches
    ) {
      const role = TEMP_PASSWORD_ACCOUNT_ROLES.get(email)!;
      const token = await createSessionToken({ id: localTestId, email, role });
      const response = NextResponse.json({ user: { id: localTestId, email, role } });
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
    const hasStoredPasswordHash = Boolean(user?.password_hash);
    const storedPasswordMatches = user && isBcryptHash(user.password_hash)
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!storedPasswordMatches && !temporaryPasswordMatches) {
      await bcrypt.hash(password, 12);
    }

    if (
      user
      && !hasStoredPasswordHash
      && !temporaryPasswordHash
    ) {
      return NextResponse.json(
        { error: "Password sign-in is not configured for this account yet. Please contact support." },
        { status: 503 },
      );
    }

    if (!user || (!storedPasswordMatches && !temporaryPasswordMatches)) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (temporaryPasswordMatches && !storedPasswordMatches) {
      const permanentPasswordHash = await bcrypt.hash(password, 12);
      const updatedPassword = await pool.query(
        `UPDATE public.users
         SET password_hash = $1
         WHERE id = $2 AND password_hash IS NOT DISTINCT FROM $3
         RETURNING id`,
        [permanentPasswordHash, user.id, user.password_hash],
      );
      if (updatedPassword.rowCount !== 1) {
        return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
      }
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
