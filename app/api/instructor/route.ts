import { NextResponse } from "next/server";
import { getInstructorAdminContext } from "@/lib/server/instructor-admin";

export async function GET() {
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