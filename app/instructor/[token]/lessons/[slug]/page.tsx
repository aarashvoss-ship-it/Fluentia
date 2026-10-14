"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccessCard } from "@/components/access/access-card";
import InstructorLessonWorkstationPage from "@/components/instructor/instructor-workstation-page";
import { getAuthenticatedUser } from "@/lib/identity";

export default function InstructorLessonRoute() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
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
      setIsMounted(true);
    });
    return () => { cancelled = true; };
  }, [router]);

  if (!isMounted || !instructorId) {
    return <main className="min-h-screen bg-background text-[#e8e7e4]" />;
  }

  return <InstructorLessonWorkstationPage instructorId={instructorId} lessonSlug={params.slug} />;
}
