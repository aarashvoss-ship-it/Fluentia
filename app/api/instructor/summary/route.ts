import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError, shouldUseLocalSqlite } from "@/lib/db";
import { getLocalInstructorSummary } from "@/lib/local-sqlite.mjs";
import { getServerSessionUser } from "@/lib/server/session";
import { assignUnownedSampleLesson } from "@/lib/server/sample-lesson";
import { normalizeSubmissionAnswers } from "@/lib/submission-answers";

export const runtime = "nodejs";

export async function GET() {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to load the instructor dashboard." }, { status: 401 });
  if (user.role !== "instructor" && user.role !== "admin") {
    return NextResponse.json({ error: "Only instructors can load this dashboard." }, { status: 403 });
  }

  try {
    if (await shouldUseLocalSqlite()) {
      return NextResponse.json(await getLocalInstructorSummary(user));
    }

    await initializeDatabase();
    const pool = getPostgresPool();
    if (user.role === "instructor") {
      await assignUnownedSampleLesson(pool, user.id);
    }
    const [submissionResult, lessonCountResult] = await Promise.all([
      pool.query(
        `SELECT submissions.id, submissions.lesson_id, submissions.student_id,
               submissions.status, submissions.submitted_at, submissions.answers,
               submissions.allow_resubmission
         FROM public.submissions AS submissions
         JOIN public.lessons AS lessons ON lessons.id = submissions.lesson_id
         WHERE submissions.status IN ('submitted', 'pending_evaluation', 'completed', 'reviewed', 'evaluated')
           AND ($1::text = 'admin' OR lessons.instructor_id = $2::uuid)
         ORDER BY submissions.submitted_at DESC`,
        [user.role, user.id],
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'published' OR is_published = true)::int AS published_count,
           COUNT(*) FILTER (WHERE status = 'draft' AND is_published = false)::int AS draft_count
         FROM public.lessons
         WHERE ($1::text = 'admin' OR instructor_id = $2::uuid)`,
        [user.role, user.id],
      ),
    ]);
    return NextResponse.json({
      submissions: submissionResult.rows.map((submission) => ({
        ...submission,
        answers: normalizeSubmissionAnswers(submission.answers, `GET /api/instructor/summary submission ${submission.id}`),
      })),
      publishedLessonCount: lessonCountResult.rows[0]?.published_count ?? 0,
      draftLessonCount: lessonCountResult.rows[0]?.draft_count ?? 0,
    });
  } catch (error) {
    logDatabaseError("PostgreSQL instructor dashboard summary failed:", error);
    return NextResponse.json({ error: "Unable to load the instructor dashboard summary." }, { status: 500 });
  }
}
