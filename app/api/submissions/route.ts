import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const submissionStatuses = new Set(["draft", "not_started", "in_progress", "submitted", "pending_evaluation", "completed", "reviewed", "evaluated"]);

function invalidSchema(error: unknown) {
  return error !== null && typeof error === "object" && "code" in error
    && ((error as { code?: string }).code === "42P01" || (error as { code?: string }).code === "42703");
}

function databaseError(error: unknown) {
  logDatabaseError("PostgreSQL submission request failed:", error);
  return NextResponse.json({
    error: invalidSchema(error)
      ? "Submission storage is not configured in PostgreSQL. The submissions table and its lesson/student columns are required."
      : "Unable to access submissions right now.",
  }, { status: invalidSchema(error) ? 503 : 500 });
}

async function getAuthorizedUser() {
  const user = await getServerSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in to access submissions." }, { status: 401 }) };
  return { user };
}

async function canAccessLesson(user: { id: string; role: string }, lessonId: string, studentId?: string) {
  const result = await getPostgresPool().query<{ instructor_id: string | null; student_id: string | null; assigned: boolean }>(
    `SELECT lessons.instructor_id::text, lessons.student_id::text,
            EXISTS (SELECT 1 FROM public.lesson_assignments assignments
                    WHERE assignments.lesson_id = lessons.id AND assignments.student_id = $2::uuid) AS assigned
     FROM public.lessons WHERE lessons.id = $1::uuid`,
    [lessonId, studentId || user.id],
  );
  const lesson = result.rows[0];
  if (!lesson) return false;
  if (user.role === "admin") return true;
  if (user.role === "instructor") return lesson.instructor_id === user.id;
  return lesson.student_id === user.id || (studentId === user.id && lesson.assigned);
}

export async function GET(request: Request) {
  const access = await getAuthorizedUser();
  if ("response" in access) return access.response;
  const { user } = access;
  const params = new URL(request.url).searchParams;
  const submissionId = params.get("submissionId")?.trim();
  const lessonId = params.get("lessonId")?.trim();
  const studentId = params.get("studentId")?.trim();
  if ([submissionId, lessonId, studentId].some((id) => id && !uuidPattern.test(id))) {
    return NextResponse.json({ error: "Provide valid submission, lesson, and student identifiers." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    if (submissionId) {
      const result = await getPostgresPool().query(
        `SELECT submissions.id, submissions.lesson_id, submissions.student_id,
                submissions.answers, submissions.status, submissions.submitted_at
         FROM public.submissions
         JOIN public.lessons ON lessons.id = submissions.lesson_id
         WHERE submissions.id = $1::uuid
           AND ($2::text IS NULL OR submissions.lesson_id::text = $2)
           AND ($3::text IS NULL OR submissions.student_id::text = $3)
           AND ($4::text = 'admin' OR lessons.instructor_id::text = $5 OR submissions.student_id::text = $5)
         LIMIT 1`,
        [submissionId, lessonId || null, studentId || null, user.role, user.id],
      );
      const submission = result.rows[0] || null;
      if (!submission) return NextResponse.json({ submission: null }, { status: 200 });
      if (!(await canAccessLesson(user, submission.lesson_id, submission.student_id))) {
        return NextResponse.json({ error: "You do not have access to this submission." }, { status: 403 });
      }
      return NextResponse.json({ submission });
    }

    if (lessonId && studentId) {
      if (!(await canAccessLesson(user, lessonId, studentId))) {
        return NextResponse.json({ error: "You do not have access to this lesson's submissions." }, { status: 403 });
      }
      const result = await getPostgresPool().query(
        `SELECT id, lesson_id, student_id, answers, status, submitted_at
         FROM public.submissions
         WHERE lesson_id = $1::uuid AND student_id = $2::uuid
         ORDER BY submitted_at DESC LIMIT 1`,
        [lessonId, studentId],
      );
      return NextResponse.json({ submission: result.rows[0] || null });
    }

    if (lessonId && !(await canAccessLesson(user, lessonId, studentId || undefined))) {
      return NextResponse.json({ error: "You do not have access to this lesson's submissions." }, { status: 403 });
    }
    if (studentId && user.role === "student" && studentId !== user.id) {
      return NextResponse.json({ error: "You can only access your own submissions." }, { status: 403 });
    }
    if (!lessonId && !studentId) {
      return NextResponse.json({ error: "Provide a lesson or student identifier." }, { status: 400 });
    }
    const result = await getPostgresPool().query(
      `SELECT submissions.id, submissions.lesson_id, submissions.student_id,
              submissions.answers, submissions.status, submissions.submitted_at
       FROM public.submissions
       JOIN public.lessons ON lessons.id = submissions.lesson_id
       WHERE ($1::text IS NULL OR submissions.lesson_id::text = $1)
         AND ($2::text IS NULL OR submissions.student_id::text = $2)
         AND ($3::text = 'admin' OR lessons.instructor_id::text = $4 OR submissions.student_id::text = $4)
       ORDER BY submissions.submitted_at DESC`,
      [lessonId || null, studentId || null, user.role, user.id],
    );
    return NextResponse.json({ submissions: result.rows });
  } catch (error) {
    return databaseError(error);
  }
}

export async function POST(request: Request) {
  const access = await getAuthorizedUser();
  if ("response" in access) return access.response;
  const { user } = access;
  if (user.role !== "student") return NextResponse.json({ error: "Only students can create submissions." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide valid submission details." }, { status: 400 });
  }
  const lessonId = typeof body.lesson_id === "string" ? body.lesson_id : "";
  const status = typeof body.status === "string" ? body.status : "in_progress";
  if (!uuidPattern.test(lessonId) || (body.student_id !== undefined && body.student_id !== user.id)
    || !submissionStatuses.has(status) || !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return NextResponse.json({ error: "Provide a valid lesson, status, and answers object." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    if (!(await canAccessLesson(user, lessonId, user.id))) {
      return NextResponse.json({ error: "You are not assigned to this lesson." }, { status: 403 });
    }
    const result = await getPostgresPool().query(
      `INSERT INTO public.submissions (lesson_id, student_id, answers, status, submitted_at)
       VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, now())
       RETURNING id, lesson_id, student_id, answers, status, submitted_at`,
      [lessonId, user.id, JSON.stringify(body.answers), status],
    );
    return NextResponse.json({ submission: result.rows[0] }, { status: 201 });
  } catch (error) {
    return databaseError(error);
  }
}

export async function PATCH(request: Request) {
  const access = await getAuthorizedUser();
  if ("response" in access) return access.response;
  const { user } = access;
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide valid submission updates." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Provide a valid submission identifier." }, { status: 400 });
  if (body.status !== undefined && (typeof body.status !== "string" || !submissionStatuses.has(body.status))) {
    return NextResponse.json({ error: "Provide a valid submission status." }, { status: 400 });
  }
  if (body.answers !== undefined && (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers))) {
    return NextResponse.json({ error: "Answers must be an object." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    const submissionResult = await getPostgresPool().query<{ lesson_id: string; student_id: string }>(
      "SELECT lesson_id::text, student_id::text FROM public.submissions WHERE id = $1::uuid",
      [id],
    );
    const submission = submissionResult.rows[0];
    if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    if (!(await canAccessLesson(user, submission.lesson_id, submission.student_id))) {
      return NextResponse.json({ error: "You do not have access to this submission." }, { status: 403 });
    }
    const updates: string[] = [];
    const values: unknown[] = [id];
    if (body.answers !== undefined) {
      values.push(JSON.stringify(body.answers));
      updates.push(`answers = $${values.length}::jsonb`);
    }
    if (body.status !== undefined) {
      values.push(body.status);
      updates.push(`status = $${values.length}`);
    }
    if (!updates.length) return NextResponse.json({ error: "Provide at least one submission field to update." }, { status: 400 });
    const result = await getPostgresPool().query(
      `UPDATE public.submissions SET ${updates.join(", ")} WHERE id = $1::uuid
       RETURNING id, lesson_id, student_id, answers, status, submitted_at`,
      values,
    );
    return NextResponse.json({ submission: result.rows[0] });
  } catch (error) {
    return databaseError(error);
  }
}

export async function DELETE(request: Request) {
  const access = await getAuthorizedUser();
  if ("response" in access) return access.response;
  const id = new URL(request.url).searchParams.get("submissionId")?.trim() || "";
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Provide a valid submission identifier." }, { status: 400 });
  try {
    await initializeDatabase();
    const result = await getPostgresPool().query<{ lesson_id: string; student_id: string }>(
      "SELECT lesson_id::text, student_id::text FROM public.submissions WHERE id = $1::uuid",
      [id],
    );
    const submission = result.rows[0];
    if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    if (!(await canAccessLesson(access.user, submission.lesson_id, submission.student_id))) {
      return NextResponse.json({ error: "You do not have access to this submission." }, { status: 403 });
    }
    await getPostgresPool().query("DELETE FROM public.submissions WHERE id = $1::uuid", [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return databaseError(error);
  }
}
