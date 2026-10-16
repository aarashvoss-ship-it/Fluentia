import type { SessionUser } from "@/lib/auth";

export type AuthenticatedRole = SessionUser["role"] | null;

export async function getAuthenticatedUser(): Promise<SessionUser | null> {
  if (typeof window === "undefined") return null;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const result = await response.json() as { user?: SessionUser | null };
    return result.user || null;
  } catch (error) {
    if (!controller.signal.aborted) {
      console.warn("Unable to read the active native session:", error);
    }
    return null;
  } finally {
    window.clearTimeout(timeoutId);
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
