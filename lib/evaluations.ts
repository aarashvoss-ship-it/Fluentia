/**
 * Submissions and Evaluations Service
 * Handles student submissions and instructor evaluations with Supabase
 */

import { supabase, type SubmissionRow, type EvaluationRow, isSupabaseConfigured } from "@/lib/supabase";
import { resolveUserUuid } from "@/lib/identity";

// ============================================================================
// Types
// ============================================================================

export interface CreateSubmissionInput {
  lesson_id: string;
  student_id: string;
  answers: Record<string, any>;
  status?: "submitted" | "in_progress";
}

export interface UpdateSubmissionInput {
  answers?: Record<string, any>;
  status?: "submitted" | "in_progress" | "reviewed";
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
    const studentUuid = await resolveUserUuid(input.student_id);
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
 * Gets a specific submission by ID
 */
export async function getSubmissionById(id: string): Promise<SubmissionWithEvaluation | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", id)
      .single();

    if (submissionError && submissionError.code !== "PGRST116") {
      throw submissionError;
    }

    if (!submission) return null;

    // Fetch evaluation if exists
    const { data: evaluation } = await supabase
      .from("evaluations")
      .select("*")
      .eq("submission_id", id)
      .order("evaluated_at", { ascending: false })
      .limit(1)
      .single();

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

    // Enrich with evaluations
    const enriched = await Promise.all(
      (submissions || []).map(async (submission) => {
        const { data: evaluation } = await supabase
          .from("evaluations")
          .select("*")
          .eq("submission_id", submission.id)
          .order("evaluated_at", { ascending: false })
          .limit(1)
          .single();

        return {
          ...submission,
          evaluation: evaluation || undefined,
        };
      })
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

    // Enrich with evaluations
    const enriched = await Promise.all(
      (submissions || []).map(async (submission) => {
        const { data: evaluation } = await supabase
          .from("evaluations")
          .select("*")
          .eq("submission_id", submission.id)
          .order("evaluated_at", { ascending: false })
          .limit(1)
          .single();

        return {
          ...submission,
          evaluation: evaluation || undefined,
        };
      })
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
      .single();

    if (submissionError && submissionError.code !== "PGRST116") {
      throw submissionError;
    }

    if (!submission) return null;

    // Fetch evaluation if exists
    const { data: evaluation } = await supabase
      .from("evaluations")
      .select("*")
      .eq("submission_id", submission.id)
      .order("evaluated_at", { ascending: false })
      .limit(1)
      .single();

    return {
      ...submission,
      evaluation: evaluation || undefined,
    };
  } catch (error) {
    console.error(
      `Error fetching submission for lesson ${lessonId} and student ${studentId}:`,
      error
    );
    throw error;
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

  try {
    // Insert evaluation
    const instructorUuid = await resolveUserUuid(input.instructor_id);
    const { data: evaluation, error: evalError } = await supabase
      .from("evaluations")
      .insert([
        {
          submission_id: input.submission_id,
          instructor_id: instructorUuid,
          feedback: input.feedback || null,
          score: input.score || null,
          evaluated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (evalError) throw evalError;

    // Update submission status to 'reviewed'
    const { error: updateError } = await supabase
      .from("submissions")
      .update({ status: "reviewed" })
      .eq("id", input.submission_id);

    if (updateError) throw updateError;

    return evaluation;
  } catch (error) {
    console.error("Error creating evaluation:", error);
    throw error;
  }
}

/**
 * Gets an evaluation by ID
 */
export async function getEvaluationById(id: string): Promise<EvaluationRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("evaluations")
      .select("*")
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return data || null;
  } catch (error) {
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
    const { data, error } = await supabase
      .from("evaluations")
      .select("*")
      .eq("submission_id", submissionId)
      .order("evaluated_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return data || null;
  } catch (error) {
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
    // First get all submissions for this lesson
    const { data: submissions, error: subError } = await supabase
      .from("submissions")
      .select("id")
      .eq("lesson_id", lessonId);

    if (subError) throw subError;

    const submissionIds = (submissions || []).map((s) => s.id);
    if (submissionIds.length === 0) return [];

    // Then get evaluations for those submissions
    const { data: evaluations, error } = await supabase
      .from("evaluations")
      .select("*")
      .in("submission_id", submissionIds)
      .order("evaluated_at", { ascending: false });

    if (error) throw error;

    return evaluations || [];
  } catch (error) {
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
    const { data, error } = await supabase
      .from("evaluations")
      .select("*")
      .eq("instructor_id", instructorId)
      .order("evaluated_at", { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
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
    const { data, error } = await supabase
      .from("evaluations")
      .update(input)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error updating evaluation ${id}:`, error);
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
    // Get submission ID before deleting evaluation
    const evaluation = await getEvaluationById(id);
    if (!evaluation) throw new Error("Evaluation not found");

    // Delete evaluation
    const { error: deleteError } = await supabase
      .from("evaluations")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    // Reset submission status back to 'submitted'
    await updateSubmission(evaluation.submission_id, { status: "submitted" });
  } catch (error) {
    console.error(`Error deleting evaluation ${id}:`, error);
    throw error;
  }
}
