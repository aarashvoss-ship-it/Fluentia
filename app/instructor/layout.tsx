import { redirect } from "next/navigation";
import { getServerSessionUser } from "@/lib/server/session";

export default async function InstructorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getServerSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "instructor" && user.role !== "admin") redirect("/dashboard");
  return children;
}
