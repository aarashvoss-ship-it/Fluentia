import { NextResponse } from "next/server";
import { shouldUseLocalSqlite } from "@/lib/db";
import { getInstructorAdminContext } from "@/lib/server/instructor-admin";
import { getServerSessionUser } from "@/lib/server/session";

export async function GET() {
  if (await shouldUseLocalSqlite()) {
    const user = await getServerSessionUser();
    if (!user) return NextResponse.json({ error: "Sign in to manage instructors." }, { status: 401 });
    if (user.role !== "instructor" && user.role !== "admin") {
      return NextResponse.json({ error: "Only instructors can manage instructor profiles." }, { status: 403 });
    }
    return NextResponse.json({ instructors: [] });
  }

  const context = await getInstructorAdminContext();
  if (!context.ok) return NextResponse.json({ error: context.message }, { status: context.status });

  try {
    const { rows } = await context.pool.query(
      `SELECT id, name, email, slug, token, specialization, status,
              max_student_capacity, bio, created_at, updated_at
       FROM public.instructors ORDER BY name`,
    );
    return NextResponse.json({ instructors: rows });
  } catch (error) {
    console.error("PostgreSQL instructor directory query failed:", error);
    return NextResponse.json({ error: "Unable to load the instructor directory." }, { status: 500 });
  }
}