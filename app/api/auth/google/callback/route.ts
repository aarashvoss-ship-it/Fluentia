import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  type SessionUser,
} from "@/lib/auth";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import {
  getGoogleOAuthConfig,
  GOOGLE_ACCOUNT_ROLES,
  GOOGLE_OAUTH_NONCE_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/lib/google-oauth";

export const runtime = "nodejs";

const googleSigningKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

interface GoogleTokenResponse {
  id_token?: unknown;
  error_description?: unknown;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function authErrorRedirect(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?auth_error=google", request.url));
  const expiredCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", expiredCookieOptions);
  response.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, "", expiredCookieOptions);
  return response;
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const storedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const storedNonce = request.cookies.get(GOOGLE_OAUTH_NONCE_COOKIE)?.value;

  if (
    !code
    || !state
    || !storedState
    || !storedNonce
    || !safeEqual(state, storedState)
  ) {
    return authErrorRedirect(request);
  }

  let databaseOperation = false;
  try {
    const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig(request.url);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const tokens = await tokenResponse.json() as GoogleTokenResponse;
    if (!tokenResponse.ok || typeof tokens.id_token !== "string") {
      throw new Error(
        typeof tokens.error_description === "string"
          ? tokens.error_description
          : "Google did not return a valid identity token.",
      );
    }

    const { payload } = await jwtVerify(tokens.id_token, googleSigningKeys, {
      algorithms: ["RS256"],
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    if (
      payload.nonce !== storedNonce
      || payload.email_verified !== true
      || typeof payload.email !== "string"
    ) {
      throw new Error("Google identity verification failed.");
    }

    const email = payload.email.trim().toLowerCase();
    const role = GOOGLE_ACCOUNT_ROLES.get(email);
    if (!role) {
      return authErrorRedirect(request);
    }

    databaseOperation = true;
    await initializeDatabase();
    const result = await getPostgresPool().query<{
      id: string;
      email: string;
      name: string | null;
    }>(
      `SELECT users.id, users.email,
              NULLIF(profiles.full_name, '') AS name
       FROM public.users AS users
       LEFT JOIN public.profiles AS profiles ON profiles.id = users.id
       WHERE lower(users.email) = $1
       LIMIT 1`,
      [email],
    );
    databaseOperation = false;
    const existingUser = result.rows[0];
    if (!existingUser) {
      console.warn("Google sign-in rejected because the allowlisted account has no existing database user.", {
        email,
      });
      return authErrorRedirect(request);
    }

    const sessionUser: SessionUser = {
      id: existingUser.id,
      email: existingUser.email,
      role,
      ...(existingUser.name ? { name: existingUser.name } : {}),
    };
    const token = await createSessionToken(sessionUser);
    const destination = role === "instructor" || role === "admin"
      ? "/instructor"
      : "/dashboard";
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    if (databaseOperation) {
      logDatabaseError("Google sign-in database lookup failed:", error);
    } else {
      console.error("Google sign-in callback failed:", error);
    }
    return authErrorRedirect(request);
  }
}
