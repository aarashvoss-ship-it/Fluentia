import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

export const SESSION_COOKIE_NAME = "fluentia_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const SESSION_ISSUER = "fluentia";
const SESSION_AUDIENCE = "fluentia-web";

export type AuthenticatedRole = "student" | "instructor" | "admin";

export interface SessionUser {
  id: string;
  email: string;
  role: AuthenticatedRole;
  name?: string;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 bytes.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    email: user.email,
    role: user.role,
    ...(user.name ? { name: user.name } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  const secret = getJwtSecret();
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    const role = payload.role;
    if (
      typeof payload.sub !== "string"
      || typeof payload.email !== "string"
      || (role !== "student" && role !== "instructor" && role !== "admin")
    ) {
      return null;
    }
    return {
      id: payload.sub,
      email: payload.email,
      role,
      ...(typeof payload.name === "string" ? { name: payload.name } : {}),
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
