"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AccessCard } from "@/components/access/access-card";
import InstructorLessonWorkstationPage from "@/components/instructor/instructor-workstation-page";
import { INSTRUCTOR_TOKEN } from "@/lib/lesson-store";

export default function InstructorLessonRoute() {
  const params = useParams<{ token: string; slug: string }>();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <main className="min-h-screen bg-[#0c1017] text-[#e8e7e4]" />;
  }

  if (params?.token !== INSTRUCTOR_TOKEN) {
    return <AccessCard title="Access Denied" message="This instructor workstation requires a valid instructor session token." />;
  }

  return <InstructorLessonWorkstationPage instructorToken={params.token} lessonSlug={params.slug} />;
}
