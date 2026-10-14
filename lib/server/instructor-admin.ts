import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerSessionUser } from "@/lib/server/session";

type InstructorAdminContext =
  | { ok: true; adminClient: SupabaseClient; userId: string }
  | { ok: false; status: number; message: string };

export async function getInstructorAdminContext(): Promise<InstructorAdminContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return { ok: false, status: 503, message: "Supabase admin data access is not configured on the server." };
  }
  const user = await getServerSessionUser();
  if (!user) return { ok: false, status: 401, message: "Sign in to manage instructors." };
  if (user.role !== "instructor" && user.role !== "admin") {
    return { ok: false, status: 403, message: "Only instructors can manage instructor profiles." };
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { ok: true, adminClient, userId: user.id };
}