import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type InstructorAdminContext =
  | { ok: true; adminClient: SupabaseClient; userId: string }
  | { ok: false; status: number; message: string };

export async function getInstructorAdminContext(): Promise<InstructorAdminContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) return { ok: false, status: 503, message: "Supabase is not configured on the server." };
  if (!serviceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is undefined; attempting instructor management with NEXT_PUBLIC_SUPABASE_ANON_KEY. Admin operations may fail.");
  }

  const cookieStore = await cookies();
  const sessionClient = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Middleware persists refreshed auth cookies for route requests.
        }
      },
    },
  });
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) return { ok: false, status: 401, message: "Sign in to manage instructors." };

  const adminClient = createClient(url, serviceRoleKey || anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [{ data: instructor, error: instructorError }, { data: profile, error: profileError }] = await Promise.all([
    adminClient.from("instructors").select("id").eq("id", user.id).maybeSingle(),
    adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (instructorError || profileError) return { ok: false, status: 500, message: "Unable to verify instructor permissions." };
  if (!instructor && profile?.role !== "instructor" && profile?.role !== "admin") {
    return { ok: false, status: 403, message: "Only instructors can manage instructor profiles." };
  }

  return { ok: true, adminClient, userId: user.id };
}