import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Cookies can be read in a Server Component but not always written there.
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    console.error("[DASHBOARD AUTH] Server session lookup failed:", {
      code: error?.code,
      message: error?.message || "No authenticated user was returned",
    });
    redirect("/login");
  }

  return children;
}