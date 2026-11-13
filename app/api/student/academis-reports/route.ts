import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to view published feedback." }, { status: 401 });
  if (user.role !== "student") {
    return NextResponse.json({ error: "Student access is required." }, { status: 403 });
  }

  const moduleId = new URL(request.url).searchParams.get("moduleId")?.trim() || "";
  if (!UUID_PATTERN.test(moduleId)) {
    return NextResponse.json({ error: "Provide a valid module identifier." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    const lessonResult = await getPostgresPool().query<{
      student_id: string | null;
      assigned_all_students: boolean;
      status: string;
      is_published: boolean;
    }>(
      `SELECT student_id::text, assigned_all_students, status, is_published
       FROM public.lessons
       WHERE id = $1::uuid`,
      [moduleId],
    );
    const lesson = lessonResult.rows[0];
    if (!lesson || (lesson.status !== "published" && !lesson.is_published)) {
      return NextResponse.json({ error: "Published lesson not found." }, { status: 404 });
    }

    const isAssigned = lesson.student_id === user.id || lesson.assigned_all_students;
    const assignmentResult = isAssigned
      ? null
      : await getPostgresPool().query(
        `SELECT 1
         FROM public.lesson_assignments
         WHERE lesson_id = $1::uuid AND student_id = $2::uuid AND status = 'assigned'
         LIMIT 1`,
        [moduleId, user.id],
      );
    if (!isAssigned && !assignmentResult?.rowCount) {
      return NextResponse.json({ error: "You are not assigned to this lesson." }, { status: 403 });
    }

    const result = await getPostgresPool().query<{
      stage_id: string;
      task_id: string;
      published_content: unknown;
    }>(
      `SELECT DISTINCT ON (stage_id, task_id) stage_id, task_id, published_content
       FROM public.student_task_reports
       WHERE student_id = $1 AND module_id = $2 AND is_published = true
       ORDER BY stage_id, task_id, updated_at DESC, created_at DESC`,
      [user.id, moduleId],
    );
    return NextResponse.json({
      reports: result.rows.map((row) => ({
        stageId: row.stage_id,
        taskId: row.task_id,
        publishedContent: row.published_content,
      })),
    });
  } catch (error) {
    logDatabaseError("Unable to load published Academis task reports:", error);
    return NextResponse.json({ error: "Unable to load published feedback right now." }, { status: 500 });
  }
}
