import { InstructorLessonPage } from "@/components/instructor/instructor-lesson-page";

export default async function InstructorLessonRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InstructorLessonPage lessonId={id ?? "habits-01"} />;
}
