"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessCard } from "@/components/access/access-card";
import { getAuthenticatedUser } from "@/lib/identity";
import InstructorLessonWorkstationPage from "@/components/instructor/instructor-workstation-page";

export default function InstructorDashboardPage() {
  const router = useRouter();
  const [instructorId, setInstructorId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAuthenticatedUser().then((user) => {
      if (cancelled) return;
      if (!user?.id) {
        router.replace("/login");
        return;
      }
      setInstructorId(user.id);
    });
    return () => { cancelled = true; };
  }, [router]);

  if (!instructorId) {
    return <AccessCard title="Checking authentication" message="Your instructor session is being verified." />;
  }

  return <InstructorLessonWorkstationPage instructorId={instructorId} lessonSlug="" />;
}
