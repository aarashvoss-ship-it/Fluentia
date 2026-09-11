import { LessonWorkstationPage } from "@/components/instructor/lesson-workstation-page";

export default async function InstructorLessonWorkstationRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <LessonWorkstationPage lessonId={slug ?? "habits-01"} />;
}
