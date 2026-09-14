"use client";

import { useParams } from "next/navigation";
import { AccessCard } from "@/components/access/access-card";
import { INSTRUCTOR_TOKEN } from "@/lib/lesson-store";
import InstructorLessonWorkstationPage from "@/components/instructor/instructor-workstation-page";

export default function InstructorDashboardPage() {
  const params = useParams<{ token: string }>();

  if (params?.token !== INSTRUCTOR_TOKEN) {
    return <AccessCard title="Access Denied" message="This instructor workstation requires a valid instructor session token." />;
  }

  return <InstructorLessonWorkstationPage instructorToken={params.token} lessonSlug="" allowStudentQuery={false} />;
}
