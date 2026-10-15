import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getGoogleOAuthConfig,
  GOOGLE_OAUTH_NONCE_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/lib/google-oauth";

export const runtime = "nodejs";

const OAUTH_COOKIE_MAX_AGE = 10 * 60;

export async function GET(request: NextRequest) {
  try {
    const { clientId, redirectUri } = getGoogleOAuthConfig(request.url);
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid email profile");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("prompt", "select_account");

    const response = NextResponse.redirect(authorizationUrl);
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: OAUTH_COOKIE_MAX_AGE,
    };
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, cookieOptions);
    response.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, nonce, cookieOptions);
    return response;
  } catch (error) {
    console.error("Google sign-in could not be started:", error);
    return NextResponse.redirect(new URL("/login?auth_error=google", request.url));
  }
}
