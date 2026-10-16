import { NextResponse } from "next/server";
import type { Pool, PoolClient } from "pg";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type SessionUser = { id: string; role: string };
type EvaluationPayload = Record<string, unknown>;

function missingSchema(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return ["42P01", "42703"].includes((error as { code?: string }).code || "");
}

function databaseError(error: unknown) {
  logDatabaseError("PostgreSQL evaluation request failed:", error);
  return NextResponse.json({
    error: missingSchema(error)
      ? "Evaluation storage is not configured in PostgreSQL. Apply the instructor feedback and instructor evaluation drafts schema before saving or loading evaluations."
      : "Unable to access evaluations right now.",
  }, { status: missingSchema(error) ? 503 : 500 });
}

async function authorizedUser() {
  const user = await getServerSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in to access evaluations." }, { status: 401 }) };
  if (user.role !== "instructor" && user.role !== "admin" && user.role !== "student") {
    return { response: NextResponse.json({ error: "You do not have access to evaluations." }, { status: 403 }) };
  }
  return { user };
}

async function getSubmissionContext(submissionId: string, user: SessionUser, client: Pool | PoolClient = getPostgresPool()) {
  const result = await client.query<{
    id: string;
    lesson_id: string;
    student_id: string;
    instructor_id: string | null;
  }>(
    `SELECT submissions.id, submissions.lesson_id::text, submissions.student_id::text,
            lessons.instructor_id::text
     FROM public.submissions
     JOIN public.lessons ON lessons.id = submissions.lesson_id
     WHERE submissions.id = $1::uuid`,
    [submissionId],
  );
  const submission = result.rows[0];
  if (!submission) return { response: NextResponse.json({ error: "Submission not found." }, { status: 404 }) };
  if (user.role === "admin") return { submission };
  if (user.role === "instructor" && submission.instructor_id === user.id) return { submission };
  if (user.role === "student" && submission.student_id === user.id) return { submission };
  return { response: NextResponse.json({ error: "You do not have access to this submission." }, { status: 403 }) };
}

function mapEvaluation(row: Record<string, any>, submissionId: string) {
  const details = row.criterion_feedback && typeof row.criterion_feedback === "object" ? row.criterion_feedback : {};
  const comments = typeof details.overallComments === "string" ? details.overallComments : row.comments || "";
  return {
    id: row.id,
    submission_id: submissionId,
    instructor_id: row.instructor_id || "",
    feedback: comments,
    score: row.total_score ?? null,
    evaluated_at: row.updated_at || "",
  };
}

function hasObjectValue(value: unknown): value is EvaluationPayload {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function parseBody(request: Request): Promise<EvaluationPayload | NextResponse> {
  try {
    const body = await request.json();
    return hasObjectValue(body) ? body : NextResponse.json({ error: "Provide a valid evaluation." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Provide a valid evaluation." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const access = await authorizedUser();
  if ("response" in access) return access.response;
  const { user } = access;
  const params = new URL(request.url).searchParams;
  const submissionId = params.get("submissionId")?.trim();
  const evaluationId = params.get("evaluationId")?.trim();
  const lessonId = params.get("lessonId")?.trim();
  const studentId = params.get("studentId")?.trim();
  const instructorId = params.get("instructorId")?.trim();
  if ([submissionId, evaluationId, lessonId, studentId, instructorId].some((id) => id && !uuidPattern.test(id))) {
    return NextResponse.json({ error: "Provide valid evaluation identifiers." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    let submission: { id: string; lesson_id: string; student_id: string; instructor_id: string | null } | undefined;
    if (submissionId) {
      const context = await getSubmissionContext(submissionId, user);
      if ("response" in context) return context.response;
      submission = context.submission;
    } else if (evaluationId) {
      const result = await getPostgresPool().query<{ id: string; lesson_id: string; student_id: string }>(
        "SELECT id, lesson_id::text, student_id::text FROM public.instructor_feedback WHERE id = $1::uuid AND is_published = true",
        [evaluationId],
      );
      const feedback = result.rows[0];
      if (!feedback) return NextResponse.json({ evaluation: null }, { status: 200 });
      const latest = await getPostgresPool().query(
        `SELECT submissions.id, submissions.lesson_id::text, submissions.student_id::text,
                lessons.instructor_id::text
         FROM public.submissions
         JOIN public.lessons ON lessons.id = submissions.lesson_id
         WHERE submissions.lesson_id = $1::uuid AND submissions.student_id = $2::uuid
         ORDER BY submissions.submitted_at DESC LIMIT 1`,
        [feedback.lesson_id, feedback.student_id],
      );
      submission = latest.rows[0];
      if (!submission) return NextResponse.json({ evaluation: null }, { status: 200 });
      const context = await getSubmissionContext(submission.id, user);
      if ("response" in context) return context.response;
      const resultEvaluation = await getPostgresPool().query(
        "SELECT * FROM public.instructor_feedback WHERE id = $1::uuid AND is_published = true",
        [evaluationId],
      );
      return NextResponse.json({ evaluation: mapEvaluation(resultEvaluation.rows[0], submission.id) });
    } else if (lessonId && studentId) {
      const lesson = await getPostgresPool().query<{ instructor_id: string | null; student_id: string | null }>(
        `SELECT lessons.instructor_id::text, lessons.student_id::text
         FROM public.lessons WHERE lessons.id = $1::uuid`,
        [lessonId],
      );
      const row = lesson.rows[0];
      const permitted = row && (user.role === "admin"
        || (user.role === "instructor" && row.instructor_id === user.id)
        || (user.role === "student" && user.id === studentId && (row.student_id === user.id
          || Boolean((await getPostgresPool().query(
            "SELECT 1 FROM public.lesson_assignments WHERE lesson_id = $1::uuid AND student_id = $2::uuid",
            [lessonId, studentId],
          )).rowCount))));
      if (!permitted) return NextResponse.json({ error: "You do not have access to these evaluations." }, { status: 403 });
      const latest = await getPostgresPool().query(
        `SELECT submissions.id, submissions.lesson_id::text, submissions.student_id::text,
                lessons.instructor_id::text
         FROM public.submissions
         JOIN public.lessons ON lessons.id = submissions.lesson_id
         WHERE submissions.lesson_id = $1::uuid AND submissions.student_id = $2::uuid
         ORDER BY submissions.submitted_at DESC LIMIT 1`,
        [lessonId, studentId],
      );
      if (!latest.rows[0]) return NextResponse.json({ draftEvaluation: null, publishedEvaluation: null });
      submission = latest.rows[0];
    } else if (instructorId || lessonId) {
      if (user.role === "student" || (user.role === "instructor" && instructorId && instructorId !== user.id)) {
        return NextResponse.json({ error: "You can only access evaluations for your own lessons." }, { status: 403 });
      }
      const result = await getPostgresPool().query(
        `SELECT feedback.id, feedback.lesson_id, feedback.student_id, feedback.instructor_id,
                feedback.comments, feedback.total_score, feedback.criterion_feedback, feedback.updated_at,
                submissions.id AS submission_id
         FROM public.instructor_feedback AS feedback
         JOIN public.lessons ON lessons.id = feedback.lesson_id
         JOIN LATERAL (
           SELECT id FROM public.submissions
           WHERE lesson_id = feedback.lesson_id AND student_id = feedback.student_id
           ORDER BY submitted_at DESC LIMIT 1
         ) AS submissions ON true
         WHERE feedback.is_published = true
           AND ($1::text = 'admin' OR lessons.instructor_id::text = $2)
           AND ($3::text IS NULL OR feedback.lesson_id::text = $3)
         ORDER BY feedback.updated_at DESC`,
        [user.role, user.id, lessonId || null],
      );
      return NextResponse.json({
        evaluations: result.rows.map((row) => mapEvaluation(row, row.submission_id)),
      });
    } else {
      return NextResponse.json({ error: "Provide a submission, evaluation, lesson/student, or instructor identifier." }, { status: 400 });
    }

    if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    const draft = await getPostgresPool().query<{ evaluation: unknown }>(
      `SELECT evaluation FROM public.instructor_evaluation_drafts
       WHERE submission_id = $1::uuid AND ($2::text = 'admin' OR instructor_id::text = $3)`,
      [submission.id, user.role, user.id],
    );
    const published = await getPostgresPool().query(
      `SELECT * FROM public.instructor_feedback
       WHERE lesson_id = $1::uuid AND student_id = $2::uuid AND is_published = true`,
      [submission.lesson_id, submission.student_id],
    );
    const feedback = published.rows[0]
      ? mapEvaluation(published.rows[0], submission.id)
      : null;
    return NextResponse.json({
      draftEvaluation: hasObjectValue(draft.rows[0]?.evaluation) ? draft.rows[0].evaluation : null,
      publishedEvaluation: feedback,
      publishedFeedback: published.rows[0] || null,
      evaluation: feedback,
      evaluations: feedback ? [feedback] : [],
    });
  } catch (error) {
    return databaseError(error);
  }
}

export async function POST(request: Request) {
  const access = await authorizedUser();
  if ("response" in access) return access.response;
  const { user } = access;
  if (user.role !== "instructor" && user.role !== "admin") {
    return NextResponse.json({ error: "Only instructors can save evaluations." }, { status: 403 });
  }
  const body = await parseBody(request);
  if (body instanceof NextResponse) return body;
  const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
  const evaluation = hasObjectValue(body.evaluation) ? body.evaluation : null;
  const published = body.published === true;
  if (!uuidPattern.test(submissionId) || !evaluation) {
    return NextResponse.json({ error: "Provide a submission identifier and evaluation object." }, { status: 400 });
  }
  const client = await getPostgresPool().connect();
  try {
    await initializeDatabase();
    await client.query("BEGIN");
    const context = await getSubmissionContext(submissionId, user, client);
    if ("response" in context) {
      await client.query("ROLLBACK");
      return context.response;
    }
    const submission = context.submission;
    const comment = typeof evaluation.comments === "string" ? evaluation.comments : "";
    const scores = hasObjectValue(evaluation.scores) ? evaluation.scores : {};
    const scoreValue = Number(evaluation.totalScore ?? 0);
    if (!Number.isFinite(scoreValue)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Evaluation score must be a valid number." }, { status: 400 });
    }

    if (!published) {
      await client.query(
        `INSERT INTO public.instructor_evaluation_drafts
           (submission_id, lesson_id, student_id, instructor_id, evaluation, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::jsonb, now())
         ON CONFLICT (submission_id) DO UPDATE SET
           lesson_id = EXCLUDED.lesson_id,
           student_id = EXCLUDED.student_id,
           instructor_id = EXCLUDED.instructor_id,
           evaluation = EXCLUDED.evaluation,
           updated_at = now()`,
        [submission.id, submission.lesson_id, submission.student_id, user.id, JSON.stringify({ ...evaluation, published: false })],
      );
      await client.query("COMMIT");
      return NextResponse.json({ evaluation: { ...evaluation, published: false }, saved: true });
    }

    const criterionFeedback = {
      overallComments: comment,
      comments: hasObjectValue(evaluation.criterionFeedback) ? evaluation.criterionFeedback : {},
      stages: hasObjectValue(evaluation.stageFeedback) ? evaluation.stageFeedback : {},
      stageScores: hasObjectValue(evaluation.stageScores) ? evaluation.stageScores : {},
      stageRubricScales: hasObjectValue(evaluation.stageRubricScales) ? evaluation.stageRubricScales : {},
      globalRubricScale: typeof evaluation.globalRubricScale === "string" ? evaluation.globalRubricScale : "standard-5",
      reportCardScoreOverrides: hasObjectValue(evaluation.reportCardScoreOverrides) ? evaluation.reportCardScoreOverrides : {},
      taskFeedback: hasObjectValue(evaluation.taskFeedback) ? evaluation.taskFeedback : {},
      inlineCorrections: hasObjectValue(evaluation.inlineCorrections) ? evaluation.inlineCorrections : {},
      stageVoiceFeedback: hasObjectValue(evaluation.stageVoiceFeedback) ? evaluation.stageVoiceFeedback : {},
    };
    const feedback = await client.query(
      `INSERT INTO public.instructor_feedback
         (lesson_id, student_id, instructor_id, scores, rubric_scores, total_score,
          criterion_feedback, comments, strengths, areas_to_improve, study_hub_prescription,
          voice_feedback_url, is_published, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::jsonb, $4::jsonb, $5,
               $6::jsonb, $7, $8, $9, $10, $11, true, now())
       ON CONFLICT (lesson_id, student_id) DO UPDATE SET
         instructor_id = EXCLUDED.instructor_id,
         scores = EXCLUDED.scores,
         rubric_scores = EXCLUDED.rubric_scores,
         total_score = EXCLUDED.total_score,
         criterion_feedback = EXCLUDED.criterion_feedback,
         comments = EXCLUDED.comments,
         strengths = EXCLUDED.strengths,
         areas_to_improve = EXCLUDED.areas_to_improve,
         study_hub_prescription = EXCLUDED.study_hub_prescription,
         voice_feedback_url = EXCLUDED.voice_feedback_url,
         is_published = true,
         updated_at = now()
       RETURNING *`,
      [
        submission.lesson_id, submission.student_id, user.id, JSON.stringify(scores),
        Math.round(scoreValue), JSON.stringify(criterionFeedback), comment,
        typeof evaluation.strengths === "string" ? evaluation.strengths : null,
        typeof evaluation.areasToImprove === "string" ? evaluation.areasToImprove : null,
        typeof evaluation.studyHubPrescription === "string" ? evaluation.studyHubPrescription : null,
        typeof evaluation.voiceFeedbackUrl === "string" ? evaluation.voiceFeedbackUrl : null,
      ],
    );
    await client.query("UPDATE public.submissions SET status = 'evaluated' WHERE id = $1::uuid", [submission.id]);
    await client.query("DELETE FROM public.instructor_evaluation_drafts WHERE submission_id = $1::uuid", [submission.id]);
    await client.query("COMMIT");
    const result = feedback.rows[0];
    return NextResponse.json({
      evaluation: { ...evaluation, published: true },
      saved: true,
      record: {
        id: result.id,
        submission_id: submission.id,
        instructor_id: user.id,
        feedback: comment,
        score: result.total_score,
        evaluated_at: result.updated_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return databaseError(error);
  } finally {
    client.release();
  }
}

export async function PUT(request: Request) {
  const access = await authorizedUser();
  if ("response" in access) return access.response;
  if (access.user.role !== "instructor" && access.user.role !== "admin") {
    return NextResponse.json({ error: "Only instructors can update evaluations." }, { status: 403 });
  }
  const body = await parseBody(request);
  if (body instanceof NextResponse) return body;
  const id = typeof body.id === "string" ? body.id : "";
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Provide a valid evaluation identifier." }, { status: 400 });

  try {
    await initializeDatabase();
    const current = await getPostgresPool().query<{ lesson_id: string; instructor_id: string | null; student_id: string }>(
      `SELECT feedback.lesson_id::text, lessons.instructor_id::text, feedback.student_id::text
       FROM public.instructor_feedback AS feedback
       JOIN public.lessons ON lessons.id = feedback.lesson_id
       WHERE feedback.id = $1::uuid`,
      [id],
    );
    const row = current.rows[0];
    if (!row) return NextResponse.json({ error: "Evaluation not found." }, { status: 404 });
    if (access.user.role !== "admin" && row.instructor_id !== access.user.id) {
      return NextResponse.json({ error: "You do not have access to this evaluation." }, { status: 403 });
    }
    const updates: string[] = ["updated_at = now()"];
    const values: unknown[] = [id];
    if (typeof body.feedback === "string") {
      values.push(body.feedback);
      updates.push(`comments = $${values.length}`);
      updates.push(`criterion_feedback = jsonb_set(COALESCE(criterion_feedback, '{}'::jsonb), '{overallComments}', to_jsonb($${values.length}::text), true)`);
    }
    if (body.score !== undefined) {
      const score = Number(body.score);
      if (!Number.isFinite(score)) return NextResponse.json({ error: "Evaluation score must be a valid number." }, { status: 400 });
      values.push(Math.round(score));
      updates.push(`total_score = $${values.length}`);
    }
    const result = await getPostgresPool().query(
      `UPDATE public.instructor_feedback SET ${updates.join(", ")}
       WHERE id = $1::uuid AND is_published = true RETURNING *`,
      values,
    );
    if (!result.rows[0]) return NextResponse.json({ error: "Evaluation not found." }, { status: 404 });
    const submission = await getPostgresPool().query<{ id: string }>(
      `SELECT id FROM public.submissions
       WHERE lesson_id = $1::uuid AND student_id = $2::uuid
       ORDER BY submitted_at DESC LIMIT 1`,
      [row.lesson_id, row.student_id],
    );
    return NextResponse.json({ evaluation: mapEvaluation(result.rows[0], submission.rows[0]?.id || "") });
  } catch (error) {
    return databaseError(error);
  }
}

export async function DELETE(request: Request) {
  const access = await authorizedUser();
  if ("response" in access) return access.response;
  if (access.user.role !== "instructor" && access.user.role !== "admin") {
    return NextResponse.json({ error: "Only instructors can delete evaluations." }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("evaluationId")?.trim() || "";
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Provide a valid evaluation identifier." }, { status: 400 });
  const client: PoolClient = await getPostgresPool().connect();
  try {
    await initializeDatabase();
    await client.query("BEGIN");
    const result = await client.query<{ lesson_id: string; student_id: string; instructor_id: string | null }>(
      `SELECT feedback.lesson_id::text, feedback.student_id::text, lessons.instructor_id::text
       FROM public.instructor_feedback AS feedback
       JOIN public.lessons ON lessons.id = feedback.lesson_id
       WHERE feedback.id = $1::uuid`,
      [id],
    );
    const evaluation = result.rows[0];
    if (!evaluation) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Evaluation not found." }, { status: 404 });
    }
    if (access.user.role !== "admin" && evaluation.instructor_id !== access.user.id) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "You do not have access to this evaluation." }, { status: 403 });
    }
    await client.query("DELETE FROM public.instructor_feedback WHERE id = $1::uuid", [id]);
    await client.query(
      "UPDATE public.submissions SET status = 'pending_evaluation' WHERE lesson_id = $1::uuid AND student_id = $2::uuid",
      [evaluation.lesson_id, evaluation.student_id],
    );
    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return databaseError(error);
  } finally {
    client.release();
  }
}
