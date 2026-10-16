/**
 * Browser-side submission and evaluation helpers.
 * Data access is performed by authenticated PostgreSQL-backed API routes.
 */

import type { EvaluationRow, SubmissionRow } from "@/types/database";
import type { LessonEvaluation } from "@/types/lesson";

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

export interface InstructorSubmissionData {
  submission: SubmissionWithEvaluation | null;
  draftEvaluation: LessonEvaluation | null;
  publishedEvaluation: EvaluationRow | null;
  publishedFeedback: Record<string, any> | null;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    credentials: "same-origin",
  });
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }
  if (!response.ok) {
    throw new Error(typeof result?.error === "string" ? result.error : "The request could not be completed.");
  }
  return result as T;
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export async function createSubmission(input: CreateSubmissionInput): Promise<SubmissionRow> {
  const result = await apiRequest<{ submission: SubmissionRow }>("/api/submissions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.submission;
}

export async function getSubmissionById(
  id: string,
  lessonId: string,
  studentId: string,
): Promise<SubmissionWithEvaluation | null> {
  const result = await apiRequest<{ submission: SubmissionWithEvaluation | null }>(
    `/api/submissions?${queryString({ submissionId: id, lessonId, studentId })}`,
  );
  return result.submission;
}

export async function getSubmissionsByLessonId(lessonId: string): Promise<SubmissionWithEvaluation[]> {
  const result = await apiRequest<{ submissions: SubmissionWithEvaluation[] }>(
    `/api/submissions?${queryString({ lessonId })}`,
  );
  return result.submissions;
}

export async function getSubmissionsByStudentId(studentId: string): Promise<SubmissionWithEvaluation[]> {
  const result = await apiRequest<{ submissions: SubmissionWithEvaluation[] }>(
    `/api/submissions?${queryString({ studentId })}`,
  );
  return result.submissions;
}

export async function getSubmissionByLessonAndStudent(
  lessonId: string,
  studentId: string,
): Promise<SubmissionWithEvaluation | null> {
  const result = await apiRequest<{ submission: SubmissionWithEvaluation | null }>(
    `/api/submissions?${queryString({ lessonId, studentId })}`,
  );
  if (!result.submission) return null;
  const evaluation = await getEvaluationBySubmissionId(result.submission.id);
  return { ...result.submission, evaluation: evaluation || undefined };
}

export async function getInstructorSubmissionData(
  lessonId: string,
  studentId: string,
  pendingSubmissionId?: string,
): Promise<InstructorSubmissionData> {
  const submissionResult = await apiRequest<{ submission: SubmissionWithEvaluation | null }>(
    `/api/submissions?${queryString({ lessonId, studentId, submissionId: pendingSubmissionId })}`,
  );
  const submission = submissionResult.submission;
  if (!submission) {
    return { submission: null, draftEvaluation: null, publishedEvaluation: null, publishedFeedback: null };
  }
  const evaluationResult = await apiRequest<{
    draftEvaluation: LessonEvaluation | null;
    publishedEvaluation: EvaluationRow | null;
    publishedFeedback: Record<string, any> | null;
  }>(`/api/evaluations?${queryString({ submissionId: submission.id })}`);
  return {
    submission: { ...submission, evaluation: evaluationResult.publishedEvaluation || undefined },
    draftEvaluation: evaluationResult.draftEvaluation,
    publishedEvaluation: evaluationResult.publishedEvaluation,
    publishedFeedback: evaluationResult.publishedFeedback,
  };
}

export async function updateSubmission(id: string, input: UpdateSubmissionInput): Promise<SubmissionRow> {
  const result = await apiRequest<{ submission: SubmissionRow }>("/api/submissions", {
    method: "PATCH",
    body: JSON.stringify({ id, ...input }),
  });
  return result.submission;
}

export async function deleteSubmission(id: string): Promise<void> {
  await apiRequest(`/api/submissions?${queryString({ submissionId: id })}`, { method: "DELETE" });
}

export async function saveInstructorEvaluation(
  submissionId: string,
  evaluation: LessonEvaluation,
  published: boolean,
): Promise<void> {
  await apiRequest("/api/evaluations", {
    method: "POST",
    body: JSON.stringify({ submissionId, evaluation, published }),
  });
}

export async function createEvaluation(input: CreateEvaluationInput): Promise<EvaluationRow> {
  const result = await apiRequest<{ record?: EvaluationRow }>("/api/evaluations", {
    method: "POST",
    body: JSON.stringify({
      submissionId: input.submission_id,
      published: true,
      evaluation: {
        comments: input.feedback || "",
        totalScore: input.score ?? 0,
        scores: {},
      },
    }),
  });
  if (!result.record) throw new Error("The evaluation was saved but no evaluation record was returned.");
  return result.record;
}

export async function getEvaluationById(id: string): Promise<EvaluationRow | null> {
  const result = await apiRequest<{ evaluation: EvaluationRow | null }>(
    `/api/evaluations?${queryString({ evaluationId: id })}`,
  );
  return result.evaluation;
}

export async function getEvaluationBySubmissionId(submissionId: string): Promise<EvaluationRow | null> {
  const result = await apiRequest<{ evaluation: EvaluationRow | null }>(
    `/api/evaluations?${queryString({ submissionId })}`,
  );
  return result.evaluation;
}

export async function getEvaluationsByLessonId(lessonId: string): Promise<EvaluationRow[]> {
  const result = await apiRequest<{ evaluations: EvaluationRow[] }>(
    `/api/evaluations?${queryString({ lessonId })}`,
  );
  return result.evaluations;
}

export async function getEvaluationsByInstructorId(instructorId: string): Promise<EvaluationRow[]> {
  const result = await apiRequest<{ evaluations: EvaluationRow[] }>(
    `/api/evaluations?${queryString({ instructorId })}`,
  );
  return result.evaluations;
}

export async function updateEvaluation(id: string, input: UpdateEvaluationInput): Promise<EvaluationRow> {
  const result = await apiRequest<{ evaluation: EvaluationRow }>("/api/evaluations", {
    method: "PUT",
    body: JSON.stringify({ id, ...input }),
  });
  return result.evaluation;
}

export async function deleteEvaluation(id: string): Promise<void> {
  await apiRequest(`/api/evaluations?${queryString({ evaluationId: id })}`, { method: "DELETE" });
}
