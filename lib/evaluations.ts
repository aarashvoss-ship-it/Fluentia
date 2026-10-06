/**
 * Submissions and Evaluations Service
 * Handles student submissions and instructor evaluations with Supabase
 */

import { supabase, type SubmissionRow, type EvaluationRow, isSupabaseConfigured } from "@/lib/supabase";

function feedbackText(feedback: { criterion_feedback?: unknown; comments?: unknown }) {
  const criterionFeedback = feedback.criterion_feedback;
  if (criterionFeedback && typeof criterionFeedback === "object" && "overallComments" in criterionFeedback) {
    const overallComments = criterionFeedback.overallComments;
    if (typeof overallComments === "string") return overallComments;
  }
  return typeof feedback.comments === "string" ? feedback.comments : "";
}

function isMissingFeedbackTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const details = error as { code?: string; message?: string; status?: number };
  return details.status === 404
    || details.code === "42P01"
    || details.code === "PGRST204"
    || details.code === "PGRST205"
    || /does not exist|could not find the table|schema cache/i.test(details.message || "");
}

// ============================================================================
// Types
// ============================================================================

export interface CreateSubmissionInput {
  lesson_id: string;
  student_id: string;
  answers: Record<string, any>;
  status?: "submitted" | "pending_evaluation" | "in_progress";
}

export interface UpdateSubmissionInput {
  answers?: Record<string, any>;
  status?: "submitted" | "pending_evaluation" | "in_progress" | "reviewed" | "evaluated";
}

export interface CreateEvaluationInput {
  submission_id: string;
  instructor_id: string;
  feedback?: string;
  score?: number;
}

export interface UpdateEvaluationInput {
  feedback?: string;
  score?: number;
}

export interface SubmissionWithEvaluation extends SubmissionRow {
  evaluation?: EvaluationRow;
}

async function getFeedbackForSubmission(submission: SubmissionRow): Promise<EvaluationRow | undefined> {
  const { data, error } = await supabase
    .from("instructor_feedback")
    .select("*")
    .eq("lesson_id", submission.lesson_id)
    .eq("student_id", submission.student_id)
    .maybeSingle();
  if (error) {
    if (isMissingFeedbackTable(error) || error.code === "PGRST116") return undefined;
    throw error;
  }
  if (!data) return undefined;
  return {
    id: data.id,
    submission_id: submission.id,
    instructor_id: data.instructor_id || "",
    feedback: feedbackText(data),
    score: data.total_score ?? null,
    evaluated_at: data.updated_at || "",
  };
}

// ============================================================================
// Submissions
// ============================================================================

/**
 * Creates a new student submission
 */
export async function createSubmission(
  input: CreateSubmissionInput
): Promise<SubmissionRow> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const studentUuid = input.student_id;
    const { data, error } = await supabase
      .from("submissions")
      .insert([
        {
          lesson_id: input.lesson_id,
          student_id: studentUuid,
          answers: input.answers,
          status: input.status || "in_progress",
          submitted_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error creating submission:", error);
    throw error;
  }
}

/**
 * Gets a specific submission scoped to its lesson and student
 */
export async function getSubmissionById(
  id: string,
  lessonId: string,
  studentId: string,
): Promise<SubmissionWithEvaluation | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!id.trim() || !lessonId.trim() || !studentId.trim()) return null;

  try {
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", id)
      .eq("lesson_id", lessonId)
      .eq("student_id", studentId)
      .single();

    if (submissionError && submissionError.code !== "PGRST116") {
      throw submissionError;
    }

    if (!submission) return null;

    const evaluation = await getFeedbackForSubmission(submission);

    return {
      ...submission,
      evaluation: evaluation || undefined,
    };
  } catch (error) {
    console.error(`Error fetching submission ${id}:`, error);
    throw error;
  }
}

/**
 * Gets all submissions for a lesson
 */
export async function getSubmissionsByLessonId(
  lessonId: string
): Promise<SubmissionWithEvaluation[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const { data: submissions, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("submitted_at", { ascending: false });

    if (error) throw error;

    // Enrich with published instructor feedback.
    const enriched = await Promise.all(
      (submissions || []).map(async (submission) => ({
        ...submission,
        evaluation: await getFeedbackForSubmission(submission),
      }))
    );

    return enriched;
  } catch (error) {
    console.error(`Error fetching submissions for lesson ${lessonId}:`, error);
    throw error;
  }
}

/**
 * Gets all submissions for a student
 */
export async function getSubmissionsByStudentId(
  studentId: string
): Promise<SubmissionWithEvaluation[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const { data: submissions, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false });

    if (error) throw error;

    // Enrich with published instructor feedback.
    const enriched = await Promise.all(
      (submissions || []).map(async (submission) => ({
        ...submission,
        evaluation: await getFeedbackForSubmission(submission),
      }))
    );

    return enriched;
  } catch (error) {
    console.error(`Error fetching submissions for student ${studentId}:`, error);
    throw error;
  }
}

/**
 * Gets submissions for a specific lesson and student
 */
export async function getSubmissionByLessonAndStudent(
  lessonId: string,
  studentId: string
): Promise<SubmissionWithEvaluation | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("*")
      .eq("lesson_id", lessonId)
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (submissionError && submissionError.code !== "PGRST116") {
      throw submissionError;
    }

    if (!submission) return null;

    const evaluation = await getFeedbackForSubmission(submission);

    return {
      ...submission,
      evaluation: evaluation || undefined,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "PGRST116"
    ) {
      return null;
    }
    return null;
  }
}

/**
 * Updates a submission
 */
export async function updateSubmission(
  id: string,
  input: UpdateSubmissionInput
): Promise<SubmissionRow> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const { data, error } = await supabase
      .from("submissions")
      .update(input)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error updating submission ${id}:`, error);
    throw error;
  }
}

/**
 * Deletes a submission
 */
export async function deleteSubmission(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const { error } = await supabase.from("submissions").delete().eq("id", id);

    if (error) throw error;
  } catch (error) {
    console.error(`Error deleting submission ${id}:`, error);
    throw error;
  }
}

// ============================================================================
// Evaluations
// ============================================================================

/**
 * Creates an evaluation for a submission
 * Also updates submission status to 'reviewed'
 */
export async function createEvaluation(
  input: CreateEvaluationInput
): Promise<EvaluationRow> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("id,lesson_id,student_id")
    .eq("id", input.submission_id)
    .maybeSingle();
  if (submissionError) throw submissionError;
  if (!submission) throw new Error("Submission not found.");

  const evaluatedAt = new Date().toISOString();
  const { data: feedback, error: feedbackError } = await supabase
    .from("instructor_feedback")
    .upsert({
      lesson_id: submission.lesson_id,
      student_id: submission.student_id,
      rubric_scores: {},
      total_score: input.score || 0,
      criterion_feedback: { overallComments: input.feedback || "" },
      is_published: true,
      updated_at: evaluatedAt,
    }, { onConflict: "lesson_id,student_id" })
    .select("*")
    .single();
  if (feedbackError) throw feedbackError;

  const { error: statusError } = await supabase
    .from("submissions")
    .update({ status: "evaluated" })
    .eq("id", input.submission_id);
  if (statusError) throw statusError;

  return {
    id: feedback.id,
    submission_id: input.submission_id,
    instructor_id: input.instructor_id,
    feedback: feedbackText(feedback),
    score: feedback.total_score ?? input.score ?? null,
    evaluated_at: feedback.updated_at || evaluatedAt,
  };
}

/**
 * Gets an evaluation by ID
 */
export async function getEvaluationById(id: string): Promise<EvaluationRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const { data: feedback, error } = await supabase
      .from("instructor_feedback")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!feedback) return null;
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("id")
      .eq("lesson_id", feedback.lesson_id)
      .eq("student_id", feedback.student_id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (submissionError) throw submissionError;
    return submission ? {
      id: feedback.id,
      submission_id: submission.id,
      instructor_id: "",
      feedback: feedbackText(feedback),
      score: feedback.total_score ?? null,
      evaluated_at: feedback.updated_at || "",
    } : null;
  } catch (error) {
    if (isMissingFeedbackTable(error)) return null;
    console.error(`Error fetching evaluation ${id}:`, error);
    throw error;
  }
}

/**
 * Gets the latest evaluation for a submission
 */
export async function getEvaluationBySubmissionId(
  submissionId: string
): Promise<EvaluationRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    return submission ? await getFeedbackForSubmission(submission) || null : null;
  } catch (error) {
    if (isMissingFeedbackTable(error)) return null;
    console.error(`Error fetching evaluation for submission ${submissionId}:`, error);
    throw error;
  }
}

/**
 * Gets all evaluations for a lesson (across all submissions)
 */
export async function getEvaluationsByLessonId(lessonId: string): Promise<EvaluationRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const { data: feedbackRows, error } = await supabase
      .from("instructor_feedback")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    if (!feedbackRows?.length) return [];

    const { data: submissions, error: subError } = await supabase
      .from("submissions")
      .select("id,lesson_id,student_id")
      .eq("lesson_id", lessonId);
    if (subError) throw subError;
    return feedbackRows.flatMap((feedback) => {
      const submission = submissions?.find((row) => row.student_id === feedback.student_id);
      return submission ? [{
        id: feedback.id,
        submission_id: submission.id,
        instructor_id: "",
        feedback: feedbackText(feedback),
        score: feedback.total_score ?? null,
        evaluated_at: feedback.updated_at || "",
      }] : [];
    });
  } catch (error) {
    if (isMissingFeedbackTable(error)) return [];
    console.error(`Error fetching evaluations for lesson ${lessonId}:`, error);
    throw error;
  }
}

/**
 * Gets all evaluations by an instructor
 */
export async function getEvaluationsByInstructorId(
  instructorId: string
): Promise<EvaluationRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const { data: lessons, error: lessonError } = await supabase
      .from("lessons")
      .select("id")
      .eq("instructor_id", instructorId);
    if (lessonError) throw lessonError;
    const lessonIds = (lessons || []).map((lesson) => lesson.id);
    if (!lessonIds.length) return [];
    const { data: feedbackRows, error } = await supabase
      .from("instructor_feedback")
      .select("*")
      .in("lesson_id", lessonIds)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const { data: submissions, error: submissionsError } = await supabase
      .from("submissions")
      .select("id,lesson_id,student_id")
      .in("lesson_id", lessonIds);
    if (submissionsError) throw submissionsError;
    return (feedbackRows || []).flatMap((feedback) => {
      const submission = submissions?.find((row) => row.lesson_id === feedback.lesson_id && row.student_id === feedback.student_id);
      return submission ? [{
        id: feedback.id,
        submission_id: submission.id,
        instructor_id: instructorId,
        feedback: feedbackText(feedback),
        score: feedback.total_score ?? null,
        evaluated_at: feedback.updated_at || "",
      }] : [];
    });
  } catch (error) {
    if (isMissingFeedbackTable(error)) return [];
    console.error(`Error fetching evaluations for instructor ${instructorId}:`, error);
    throw error;
  }
}

/**
 * Updates an evaluation
 */
export async function updateEvaluation(
  id: string,
  input: UpdateEvaluationInput
): Promise<EvaluationRow> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    let criterionFeedback: Record<string, unknown> | undefined;
    if (input.feedback !== undefined) {
      const { data: currentFeedback, error: currentFeedbackError } = await supabase
        .from("instructor_feedback")
        .select("criterion_feedback")
        .eq("id", id)
        .maybeSingle();
      if (currentFeedbackError) throw currentFeedbackError;
      if (!currentFeedback) throw new Error("Evaluation not found.");
      const currentCriterionFeedback = currentFeedback.criterion_feedback;
      criterionFeedback = currentCriterionFeedback
        && typeof currentCriterionFeedback === "object"
        && !Array.isArray(currentCriterionFeedback)
        ? currentCriterionFeedback as Record<string, unknown>
        : {};
    }

    const { data: feedback, error } = await supabase
      .from("instructor_feedback")
      .update({
        ...(input.feedback !== undefined
          ? { criterion_feedback: { ...criterionFeedback, overallComments: input.feedback } }
          : {}),
        ...(input.score !== undefined ? { total_score: input.score } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("id")
      .eq("lesson_id", feedback.lesson_id)
      .eq("student_id", feedback.student_id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (!submission) throw new Error("Submission not found for this feedback row.");
    return {
      id: feedback.id,
      submission_id: submission.id,
      instructor_id: "",
      feedback: feedbackText(feedback),
      score: feedback.total_score ?? null,
      evaluated_at: feedback.updated_at || "",
    };
  } catch (error) {
    if (!isMissingFeedbackTable(error)) console.error(`Error updating evaluation ${id}:`, error);
    throw error;
  }
}

/**
 * Deletes an evaluation
 */
export async function deleteEvaluation(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const evaluation = await getEvaluationById(id);
    if (!evaluation) throw new Error("Evaluation not found");

    const { error: deleteError } = await supabase
      .from("instructor_feedback")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    await updateSubmission(evaluation.submission_id, { status: "pending_evaluation" });
  } catch (error) {
    if (!isMissingFeedbackTable(error)) console.error(`Error deleting evaluation ${id}:`, error);
    throw error;
  }
}
