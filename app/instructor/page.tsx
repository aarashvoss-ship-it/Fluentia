import { redirect } from "next/navigation";
import InstructorLessonWorkstationPage from "@/components/instructor/instructor-workstation-page";
import { getServerSessionUser } from "@/lib/server/session";

export default async function InstructorPage() {
  const user = await getServerSessionUser();
  if (!user) redirect("/login");
  return <InstructorLessonWorkstationPage instructorId={user.id} lessonSlug="" />;
}
