"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessCard } from "@/components/access/access-card";
import { supabase } from "@/lib/supabase";
import InstructorLessonWorkstationPage from "@/components/instructor/instructor-workstation-page";

export default function InstructorDashboardPage() {
  const router = useRouter();
  const [instructorId, setInstructorId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data.session?.user?.id) {
        router.replace("/login");
        return;
      }
      setInstructorId(data.session.user.id);
    }).catch(() => router.replace("/login"));
    return () => { cancelled = true; };
  }, [router]);

  if (!instructorId) {
    return <AccessCard title="Checking authentication" message="Your instructor session is being verified." />;
  }

  return <InstructorLessonWorkstationPage instructorId={instructorId} lessonSlug="" />;
}
