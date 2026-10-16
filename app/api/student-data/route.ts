import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validSubmissionStatuses = new Set([
  "draft", "not_started", "in_progress", "submitted", "pending_evaluation", "completed", "reviewed", "evaluated",
]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function databaseFailure(error: unknown) {
  logDatabaseError("PostgreSQL student-data request failed:", error);
  const code = error !== null && typeof error === "object" && "code" in error
    ? (error as { code?: string }).code
    : undefined;
  const missingSchema = code === "42P01" || code === "42703";
  return NextResponse.json({
    error: missingSchema
      ? "Student data storage is not configured. Required schema: public.lessons (id, slug, title, banner_url, status, student_id, assigned_all_students); public.lesson_assignments (lesson_id, student_id, status); public.lesson_versions (lesson_id, version_number, content, created_at); public.submissions (id, lesson_id, student_id, answers JSONB, status accepting draft/not_started/in_progress/submitted/pending_evaluation/completed/reviewed/evaluated, submitted_at); public.instructor_feedback (lesson_id, student_id, is_published, rubric_scores JSONB, total_score, criterion_feedback JSONB, comments, strengths, areas_to_improve, study_hub_prescription, voice_feedback_url, updated_at); public.user_vocab (user_id, word, part_of_speech, definition, example, pronunciation_url, source, saved_at, UNIQUE(user_id, word)); public.user_notes (id UUID PRIMARY KEY, user_id, text, lesson_slug, updated_at)."
      : "Unable to access student data right now.",
  }, { status: missingSchema ? 503 : 500 });
}

async function readBody(request: Request): Promise<JsonRecord | NextResponse> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : NextResponse.json({ error: "Provide a valid request body." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Provide a valid request body." }, { status: 400 });
  }
}

async function authenticatedStudent() {
  const user = await getServerSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in to access student data." }, { status: 401 }) };
  if (user.role !== "student") return { response: NextResponse.json({ error: "Student access is required." }, { status: 403 }) };
  return { user };
}

async function getLessonForStudent(slug: string, studentId: string) {
  const result = await getPostgresPool().query<{
    id: string;
    slug: string | null;
    title: string;
    content: unknown;
    banner_url: string | null;
    status: string;
    assigned: boolean;
  }>(
    `SELECT lesson.id::text, lesson.slug, lesson.title, lesson.banner_url, lesson.status,
            COALESCE(version.content, '{}'::jsonb) AS content,
            (lesson.student_id = $2::uuid OR lesson.assigned_all_students = true OR EXISTS (
              SELECT 1 FROM public.lesson_assignments assignment
              WHERE assignment.lesson_id = lesson.id
                AND assignment.student_id = $2::uuid
                AND assignment.status = 'assigned'
            )) AS assigned
     FROM public.lessons AS lesson
     LEFT JOIN LATERAL (
       SELECT content FROM public.lesson_versions
       WHERE lesson_id = lesson.id ORDER BY version_number DESC, created_at DESC LIMIT 1
     ) AS version ON true
     WHERE (lesson.id::text = $1 OR lesson.slug = $1 OR version.content->>'slug' = $1)
     LIMIT 1`,
    [slug, studentId],
  );
  const lesson = result.rows[0];
  if (!lesson || !lesson.assigned || lesson.status !== "published") return null;
  return lesson;
}

function mapEvaluation(row: JsonRecord | undefined) {
  if (!row) return null;
  const details = isRecord(row.criterion_feedback) ? row.criterion_feedback : {};
  return {
    scores: isRecord(row.rubric_scores) ? row.rubric_scores : {},
    totalScore: Number(row.total_score || 0),
    comments: typeof details.overallComments === "string" ? details.overallComments : row.comments || "",
    criterionFeedback: isRecord(details.comments) ? details.comments : {},
    stageFeedback: isRecord(details.stages) ? details.stages : {},
    stageScores: isRecord(details.stageScores) ? details.stageScores : {},
    stageRubricScales: isRecord(details.stageRubricScales) ? details.stageRubricScales : {},
    globalRubricScale: typeof details.globalRubricScale === "string" ? details.globalRubricScale : "standard-5",
    reportCardScoreOverrides: isRecord(details.reportCardScoreOverrides) ? details.reportCardScoreOverrides : {},
    taskFeedback: isRecord(details.taskFeedback) ? details.taskFeedback : {},
    inlineCorrections: isRecord(details.inlineCorrections) ? details.inlineCorrections : {},
    stageVoiceFeedback: isRecord(details.stageVoiceFeedback) ? details.stageVoiceFeedback : {},
    strengths: row.strengths || "",
    areasToImprove: row.areas_to_improve || "",
    studyHubPrescription: row.study_hub_prescription || "",
    voiceFeedbackUrl: row.voice_feedback_url || "",
    published: row.is_published === true,
  };
}

async function lessonStateGet(request: Request, studentId: string) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug")?.trim() || "";
  if (!slug) return NextResponse.json({ error: "Provide a lesson slug." }, { status: 400 });
  try {
    await initializeDatabase();
    const lesson = await getLessonForStudent(slug, studentId);
    if (!lesson) return NextResponse.json({ error: "Lesson not found or not assigned to this student." }, { status: 404 });
    const requestedSubmissionId = params.get("submissionId")?.trim();
    if (requestedSubmissionId && !uuidPattern.test(requestedSubmissionId)) {
      return NextResponse.json({ error: "Provide a valid submission identifier." }, { status: 400 });
    }
    const submissionResult = await getPostgresPool().query<JsonRecord>(
      `SELECT id::text, answers, status, submitted_at
       FROM public.submissions
       WHERE lesson_id = $1::uuid AND student_id = $2::uuid
         AND ($3::text IS NULL OR id::text = $3)
       ORDER BY submitted_at DESC LIMIT 1`,
      [lesson.id, studentId, requestedSubmissionId || null],
    );
    const submission = submissionResult.rows[0] || null;
    let evaluation = null;
    if (params.get("mode") !== "interactive") {
      const feedbackResult = await getPostgresPool().query<JsonRecord>(
        `SELECT rubric_scores, total_score, criterion_feedback, comments, strengths,
                areas_to_improve, study_hub_prescription, voice_feedback_url, is_published
         FROM public.instructor_feedback
         WHERE lesson_id = $1::uuid AND student_id = $2::uuid AND is_published = true
         ORDER BY updated_at DESC LIMIT 1`,
        [lesson.id, studentId],
      );
      evaluation = mapEvaluation(feedbackResult.rows[0]);
    }
    return NextResponse.json({
      lesson,
      submission,
      evaluation,
    });
  } catch (error) {
    return databaseFailure(error);
  }
}

async function lessonStateWrite(request: Request, studentId: string) {
  const body = await readBody(request);
  if (body instanceof NextResponse) return body;
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) return NextResponse.json({ error: "Provide a lesson slug." }, { status: 400 });
  try {
    await initializeDatabase();
    const lesson = await getLessonForStudent(slug, studentId);
    if (!lesson) return NextResponse.json({ error: "Lesson not found or not assigned to this student." }, { status: 404 });
    const state = isRecord(body.state) ? body.state : {};
    const submission = isRecord(state.submission) ? state.submission : {};
    const progress = isRecord(body.progress) ? body.progress : {};
    const status = typeof submission.status === "string" && validSubmissionStatuses.has(submission.status)
      ? submission.status
      : typeof progress.status === "string" && validSubmissionStatuses.has(progress.status)
        ? progress.status
        : "in_progress";
    const answers: JsonRecord = {
      ...submission,
      ...(Object.keys(progress).length ? { progress } : {}),
    };
    const requestedSubmissionId = typeof body.submissionId === "string" ? body.submissionId : "";
    if (requestedSubmissionId && !uuidPattern.test(requestedSubmissionId)) {
      return NextResponse.json({ error: "Provide a valid submission identifier." }, { status: 400 });
    }
    const fallbacks: Record<string, string[]> = {
      not_started: ["draft", "not_started", "in_progress", "submitted", "pending_evaluation", "completed"],
      in_progress: ["draft", "in_progress", "not_started", "submitted", "pending_evaluation", "completed"],
      submitted: ["submitted", "pending_evaluation", "completed"],
      pending_evaluation: ["submitted", "pending_evaluation", "completed"],
      reviewed: ["reviewed", "completed"],
      evaluated: ["evaluated", "reviewed", "completed"],
      draft: ["draft", "not_started", "in_progress", "submitted", "pending_evaluation", "completed"],
      completed: ["completed", "pending_evaluation", "submitted"],
    };
    let saved: JsonRecord | undefined;
    let lastConstraintError: unknown;
    for (const databaseStatus of [...new Set(fallbacks[status] || [status])]) {
      try {
        const result = requestedSubmissionId
          ? await getPostgresPool().query<JsonRecord>(
              `UPDATE public.submissions
               SET answers = $4::jsonb, status = $5, submitted_at = now()
               WHERE id = $1::uuid AND lesson_id = $2::uuid AND student_id = $3::uuid
               RETURNING id::text, answers, status, submitted_at`,
              [requestedSubmissionId, lesson.id, studentId, JSON.stringify(answers), databaseStatus],
            )
          : await getPostgresPool().query<JsonRecord>(
              `WITH latest AS (
                 SELECT id FROM public.submissions
                 WHERE lesson_id = $1::uuid AND student_id = $2::uuid
                 ORDER BY submitted_at DESC LIMIT 1
               )
               UPDATE public.submissions
               SET answers = $3::jsonb, status = $4, submitted_at = now()
               WHERE id = (SELECT id FROM latest)
               RETURNING id::text, answers, status, submitted_at`,
              [lesson.id, studentId, JSON.stringify(answers), databaseStatus],
            );
        saved = result.rows[0];
        if (!saved) {
          if (requestedSubmissionId) {
            return NextResponse.json({ error: "Submission not found." }, { status: 404 });
          }
          const inserted = await getPostgresPool().query<JsonRecord>(
            `INSERT INTO public.submissions (lesson_id, student_id, answers, status, submitted_at)
             VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, now())
             RETURNING id::text, answers, status, submitted_at`,
            [lesson.id, studentId, JSON.stringify(answers), databaseStatus],
          );
          saved = inserted.rows[0];
        }
        if (saved) break;
      } catch (error) {
        const code = error !== null && typeof error === "object" && "code" in error
          ? (error as { code?: string }).code
          : undefined;
        if (code !== "23514") throw error;
        lastConstraintError = error;
      }
    }
    if (!saved) throw lastConstraintError || new Error("Unable to save student submission.");
    return NextResponse.json({ saved: true, submission: saved });
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function GET(request: Request) {
  const access = await authenticatedStudent();
  if ("response" in access) return access.response;
  const resource = new URL(request.url).searchParams.get("resource");
  try {
    await initializeDatabase();
    if (resource === "lesson-state") return lessonStateGet(request, access.user.id);
    if (resource === "vocabulary") {
      const result = await getPostgresPool().query(
        `SELECT word, part_of_speech, definition, example, pronunciation_url, source, saved_at
         FROM public.user_vocab WHERE user_id = $1::uuid ORDER BY saved_at DESC`,
        [access.user.id],
      );
      return NextResponse.json({ words: result.rows });
    }
    if (resource === "notes") {
      const result = await getPostgresPool().query(
        `SELECT id::text, text, lesson_slug, updated_at
         FROM public.user_notes WHERE user_id = $1::uuid ORDER BY updated_at DESC`,
        [access.user.id],
      );
      return NextResponse.json({ notes: result.rows });
    }
    return NextResponse.json({ error: "Unknown student data resource." }, { status: 400 });
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function POST(request: Request) {
  const access = await authenticatedStudent();
  if ("response" in access) return access.response;
  const resource = new URL(request.url).searchParams.get("resource");
  if (resource === "lesson-state") return lessonStateWrite(request, access.user.id);
  const body = await readBody(request);
  if (body instanceof NextResponse) return body;
  try {
    await initializeDatabase();
    if (resource === "vocabulary") {
      const word = typeof body.word === "string" ? body.word.trim() : "";
      const definition = typeof body.definition === "string" ? body.definition : "";
      if (!word || !definition) return NextResponse.json({ error: "A word and definition are required." }, { status: 400 });
      const result = await getPostgresPool().query(
        `INSERT INTO public.user_vocab
           (user_id, word, part_of_speech, definition, example, pronunciation_url, source, saved_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()))
         ON CONFLICT (user_id, word) DO UPDATE SET
           part_of_speech = EXCLUDED.part_of_speech, definition = EXCLUDED.definition,
           example = EXCLUDED.example, pronunciation_url = EXCLUDED.pronunciation_url,
           source = EXCLUDED.source, saved_at = EXCLUDED.saved_at
         RETURNING word, part_of_speech, definition, example, pronunciation_url, source, saved_at`,
        [
          access.user.id, word,
          typeof body.part_of_speech === "string" ? body.part_of_speech : null,
          definition,
          typeof body.example === "string" ? body.example : null,
          typeof body.pronunciation_url === "string" ? body.pronunciation_url : null,
          typeof body.source === "string" ? body.source : null,
          typeof body.saved_at === "string" ? body.saved_at : null,
        ],
      );
      return NextResponse.json({ word: result.rows[0] });
    }
    if (resource === "notes") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) return NextResponse.json({ error: "Note text is required." }, { status: 400 });
      const id = typeof body.id === "string" && uuidPattern.test(body.id) ? body.id : randomUUID();
      const result = await getPostgresPool().query(
        `INSERT INTO public.user_notes (id, user_id, text, lesson_slug, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, COALESCE($5::timestamptz, now()))
         ON CONFLICT (id) DO UPDATE SET
           text = EXCLUDED.text, lesson_slug = EXCLUDED.lesson_slug, updated_at = EXCLUDED.updated_at
         WHERE public.user_notes.user_id = EXCLUDED.user_id
         RETURNING id::text, text, lesson_slug, updated_at`,
        [id, access.user.id, text, typeof body.lesson_slug === "string" ? body.lesson_slug : null,
          typeof body.updated_at === "string" ? body.updated_at : null],
      );
      if (!result.rows[0]) return NextResponse.json({ error: "Unable to save this note." }, { status: 409 });
      return NextResponse.json({ note: result.rows[0] });
    }
    if (resource === "evaluation-viewed") {
      const slug = typeof body.slug === "string" ? body.slug.trim() : "";
      const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
      if (!slug) return NextResponse.json({ error: "Provide a lesson slug." }, { status: 400 });
      if (submissionId && !uuidPattern.test(submissionId)) return NextResponse.json({ error: "Invalid submission identifier." }, { status: 400 });
      const lesson = await getLessonForStudent(slug, access.user.id);
      if (!lesson) return NextResponse.json({ error: "Lesson not found or not assigned to this student." }, { status: 404 });
      const result = submissionId
        ? await getPostgresPool().query(
            `UPDATE public.submissions
             SET answers = jsonb_set(COALESCE(answers, '{}'::jsonb), '{evaluationViewedAt}', to_jsonb(now()::text), true)
             WHERE id = $1::uuid AND lesson_id = $2::uuid AND student_id = $3::uuid
             RETURNING id`,
            [submissionId, lesson.id, access.user.id],
          )
        : await getPostgresPool().query(
            `UPDATE public.submissions
             SET answers = jsonb_set(COALESCE(answers, '{}'::jsonb), '{evaluationViewedAt}', to_jsonb(now()::text), true)
             WHERE id = (
               SELECT id FROM public.submissions
               WHERE lesson_id = $1::uuid AND student_id = $2::uuid
               ORDER BY submitted_at DESC LIMIT 1
             )
             RETURNING id`,
            [lesson.id, access.user.id],
          );
      if (!result.rowCount) return NextResponse.json({ error: "The submission for this feedback was not found." }, { status: 404 });
      return NextResponse.json({ saved: true });
    }
    return NextResponse.json({ error: "Unknown student data resource." }, { status: 400 });
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function DELETE(request: Request) {
  const access = await authenticatedStudent();
  if ("response" in access) return access.response;
  const params = new URL(request.url).searchParams;
  if (params.get("resource") !== "vocabulary") {
    return NextResponse.json({ error: "Unknown student data resource." }, { status: 400 });
  }
  const word = params.get("word")?.trim() || "";
  if (!word) return NextResponse.json({ error: "Provide the word to remove." }, { status: 400 });
  try {
    await initializeDatabase();
    await getPostgresPool().query(
      "DELETE FROM public.user_vocab WHERE user_id = $1::uuid AND lower(word) = lower($2)",
      [access.user.id, word],
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return databaseFailure(error);
  }
}
