import type { SessionUser } from "@/lib/auth";

export type AuthenticatedRole = SessionUser["role"] | null;

export async function getAuthenticatedUser(): Promise<SessionUser | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const result = await response.json() as { user?: SessionUser | null };
    return result.user || null;
  } catch (error) {
    console.warn("Unable to read the active native session:", error);
    return null;
  }
}

export async function resolveUserUuid(): Promise<string | null> {
  const user = await getAuthenticatedUser();
  return user?.id || null;
}

export async function getAuthenticatedRole(): Promise<AuthenticatedRole> {
  const user = await getAuthenticatedUser();
  return user?.role || null;
}
