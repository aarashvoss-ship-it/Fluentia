import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

export const SESSION_COOKIE_NAME = "fluentia_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const TEMP_PASSWORD_ACCOUNT_ROLES: ReadonlyMap<string, AuthenticatedRole> = new Map([
  ["aarashvoss@gmail.com", "instructor"],
  ["aarashvossoughi@gmail.com", "student"],
  ["f.soheilikia.lastqueen2002@gmail.com", "student"],
]);
const SESSION_ISSUER = "fluentia";
const SESSION_AUDIENCE = "fluentia-web";
const ALLOWED_REQUEST_ORIGINS = new Set([
  "https://fluential.ir",
  "https://www.fluential.ir",
  "http://localhost:3000",
]);

export type AuthenticatedRole = "student" | "instructor" | "admin";

export interface SessionUser {
  id: string;
  email: string;
  role: AuthenticatedRole;
  name?: string;
}

export function getTemporaryPasswordHash(email: string) {
  if (!TEMP_PASSWORD_ACCOUNT_ROLES.has(email)) return undefined;

  const encodedHashes = process.env.TEMP_USER_PASSWORD_HASHES_B64;
  if (!encodedHashes) return undefined;

  let configuredHashes: string;
  try {
    configuredHashes = Buffer.from(encodedHashes, "base64").toString("utf8");
  } catch {
    throw new Error("TEMP_USER_PASSWORD_HASHES_B64 must contain base64-encoded JSON.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(configuredHashes);
  } catch {
    throw new Error("TEMP_USER_PASSWORD_HASHES_B64 must decode to a valid JSON object.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("TEMP_USER_PASSWORD_HASHES_B64 must decode to a valid JSON object.");
  }

  const passwordHash = (parsed as Record<string, unknown>)[email];
  if (passwordHash === undefined) return undefined;
  if (
    typeof passwordHash !== "string"
    || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash)
  ) {
    throw new Error(`Temporary password hash for ${email} must be a bcrypt hash.`);
  }

  return passwordHash;
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

export function isAllowedRequestOrigin(request: Request) {
  const originHeaders = [
    request.headers.get("origin"),
    request.headers.get("referer"),
  ].filter((value): value is string => value !== null);

  const hasAllowedOrigin = originHeaders.some((value) => {
    try {
      const parsedOrigin = new URL(value).origin;
      return (
        ALLOWED_REQUEST_ORIGINS.has(parsedOrigin)
        || parsedOrigin === new URL(request.url).origin
      );
    } catch {
      return false;
    }
  });

  return hasAllowedOrigin;
}
