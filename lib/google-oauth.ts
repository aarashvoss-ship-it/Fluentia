import type { AuthenticatedRole } from "@/lib/auth";

export const GOOGLE_OAUTH_STATE_COOKIE = "fluentia_google_oauth_state";
export const GOOGLE_OAUTH_NONCE_COOKIE = "fluentia_google_oauth_nonce";

export const GOOGLE_ACCOUNT_ROLES: ReadonlyMap<string, AuthenticatedRole> = new Map([
  ["aarashvoss@gmail.com", "instructor"],
  ["aarashvossoughi@gmail.com", "student"],
  ["f.soheilikia.lastqueen2002@gmail.com", "student"],
]);

export function getGoogleOAuthConfig(requestUrl: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.");
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI
    || new URL("/api/auth/google/callback", requestUrl).toString();
  let parsedRedirectUri: URL;
  try {
    parsedRedirectUri = new URL(redirectUri);
  } catch {
    throw new Error("GOOGLE_REDIRECT_URI must be a valid absolute URL.");
  }

  if (process.env.NODE_ENV === "production" && parsedRedirectUri.protocol !== "https:") {
    throw new Error("GOOGLE_REDIRECT_URI must use HTTPS in production.");
  }

  return { clientId, clientSecret, redirectUri: parsedRedirectUri.toString() };
}
