import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type AuthenticatedRole = "student" | "instructor" | "admin" | null;

export async function getAuthenticatedUser() {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  } catch (error) {
    console.warn("Unable to read the active Supabase user:", error);
    return null;
  }
}

export async function resolveUserUuid(): Promise<string | null> {
  const user = await getAuthenticatedUser();
  return user?.id || null;
}

export async function getAuthenticatedRole(): Promise<AuthenticatedRole> {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "student" || profile?.role === "instructor" || profile?.role === "admin") return profile.role;

    const [{ data: instructor }, { data: student }] = await Promise.all([
      supabase.from("instructors").select("id").eq("id", user.id).maybeSingle(),
      supabase.from("students").select("id").eq("id", user.id).maybeSingle(),
    ]);
    if (instructor) return "instructor";
    if (student) return "student";
  } catch (error) {
    console.warn("Unable to resolve the authenticated user role:", error);
  }

  return null;
}
