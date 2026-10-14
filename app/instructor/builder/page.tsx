import { redirect } from "next/navigation";
import InstructorWorkstationPage from "@/components/instructor/instructor-workstation-page";
import { getServerSessionUser } from "@/lib/server/session";

export default async function InstructorBuilderPage() {
  const user = await getServerSessionUser();
  if (!user) redirect("/login");
  return <InstructorWorkstationPage instructorId={user.id} lessonSlug="" />;
}
