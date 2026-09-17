import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import InstructorLessonWorkstationPage from "@/components/instructor/instructor-workstation-page";

export default async function InstructorPage() {
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
            // The instructor layout handles authentication; this page only reads the session identity.
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  return <InstructorLessonWorkstationPage instructorToken={data.user.id} lessonSlug="" allowStudentQuery={false} />;
}
