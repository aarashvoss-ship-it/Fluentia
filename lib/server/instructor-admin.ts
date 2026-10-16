import type { Pool } from "pg";
import { getPostgresPool, initializeDatabase } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

type InstructorAdminContext =
  | { ok: true; pool: Pool; userId: string }
  | { ok: false; status: number; message: string };

export async function getInstructorAdminContext(): Promise<InstructorAdminContext> {
  const user = await getServerSessionUser();
  if (!user) return { ok: false, status: 401, message: "Sign in to manage instructors." };
  if (user.role !== "instructor" && user.role !== "admin") {
    return { ok: false, status: 403, message: "Only instructors can manage instructor profiles." };
  }
  try {
    await initializeDatabase();
    return { ok: true, pool: getPostgresPool(), userId: user.id };
  } catch {
    return { ok: false, status: 503, message: "PostgreSQL instructor data is temporarily unavailable." };
  }
}
