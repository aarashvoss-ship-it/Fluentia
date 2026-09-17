"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccessCard } from "@/components/access/access-card";
import InstructorLessonWorkstationPage from "@/components/instructor/instructor-workstation-page";
import { supabase } from "@/lib/supabase";

export default function InstructorLessonRoute() {
  const params = useParams<{ token: string; slug: string }>();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
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
      setIsMounted(true);
    }).catch(() => router.replace("/login"));
    return () => { cancelled = true; };
  }, [router]);

  if (!isMounted || !instructorId) {
    return <main className="min-h-screen bg-[#0c1017] text-[#e8e7e4]" />;
  }

  return <InstructorLessonWorkstationPage instructorToken={instructorId} lessonSlug={params.slug} />;
}
