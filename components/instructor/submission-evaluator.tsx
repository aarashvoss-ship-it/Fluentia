"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle, Award, AlertCircle } from "lucide-react";
import { LessonEvaluation } from "@/types/lesson";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getSubmissionByLessonAndStudent } from "@/lib/evaluations";
import { saveInstructorFeedback } from "@/services/storage-service";
import { UnifiedReportCard, type UnifiedReportStage } from "@/components/shared/unified-report-card";

export interface FeedbackPayload {
  scores: Record<string, number>;
  totalScore: number;
  comments: string;
  criterionFeedback: Record<string, string>;
  stageFeedback: Record<string, string>;
}

interface SubmissionEvaluatorProps {
  lessonId?: string;
  pendingSubmissionId?: string;
  studentName?: string;
  studentId?: string;
  instructorId?: string;
  onSubmitFeedback?: (data: FeedbackPayload) => void | Promise<void>;
  evaluation?: LessonEvaluation;
  reportCardStages?: UnifiedReportStage[];
  onUpdateEvaluation?: (evaluation: LessonEvaluation) => void;
  useSupabase?: boolean; // When true, submits to Supabase instead of callback
}

const RUBRIC_CRITERIA = [
  { id: "task", label: "Task Achievement & Depth", max: 5 },
  { id: "coherence", label: "Coherence & Flow", max: 5 },
  { id: "lexical", label: "Lexical Precision & Range", max: 5 },
  { id: "grammar", label: "Grammatical Accuracy", max: 5 },
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stripMarkdown(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2")
    .replace(/[*_~`]/g, "")
    .trim();
}

function isMissingDatabaseObject(error: { code?: string; message?: string; status?: number } | null) {
  if (!error) return false;
  return error.status === 404
    || error.code === "42P01"
    || error.code === "42703"
    || error.code === "PGRST204"
    || error.code === "PGRST205"
    || /does not exist|could not find the table|schema cache/i.test(error.message || "");
}

export function SubmissionEvaluator({
  lessonId,
  pendingSubmissionId,
  studentName = "Student",
  studentId,
  instructorId,
  onSubmitFeedback,
  evaluation,
  reportCardStages = [],
  onUpdateEvaluation,
  useSupabase = true,
}: SubmissionEvaluatorProps) {
  const defaultScores: Record<string, number> = {
    task: 4,
    coherence: 4,
    lexical: 3,
    grammar: 4,
  };

  const scores = evaluation?.scores || defaultScores;
  const comments = evaluation?.comments || "";
  const criterionFeedback = evaluation?.criterionFeedback || {};
  const stageFeedback = evaluation?.stageFeedback || {};
  
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submissionLoadState, setSubmissionLoadState] = useState<
    "idle" | "loading" | "loaded" | "missing"
  >(useSupabase ? "idle" : "loaded");

  // Load existing submission and evaluation if useSupabase is enabled
  useEffect(() => {
    if (useSupabase && lessonId?.trim() && studentId?.trim()) {
      loadSubmissionData();
    }
  }, [lessonId, studentId, pendingSubmissionId, useSupabase]);

  const loadSubmissionData = async () => {
    const normalizedLessonId = lessonId?.trim() || "";
    const normalizedStudentId = studentId?.trim() || "";
    if (!isSupabaseConfigured() || !UUID_PATTERN.test(normalizedLessonId) || !UUID_PATTERN.test(normalizedStudentId)) {
      setSubmissionId(pendingSubmissionId || null);
      setSubmissionLoadState(pendingSubmissionId ? "loaded" : "missing");
      return;
    }
    setSubmissionLoadState("loading");
    try {
      const [submission, feedbackResult] = await Promise.all([
        getSubmissionByLessonAndStudent(normalizedLessonId, normalizedStudentId),
        supabase
          .from("instructor_feedback")
          .select("*")
          .eq("lesson_id", normalizedLessonId)
          .eq("student_id", normalizedStudentId)
          .maybeSingle(),
      ]);
      if (submission) {
        setSubmissionId(submission.id);
        setSubmissionLoadState("loaded");
      } else if (pendingSubmissionId) {
        setSubmissionId(pendingSubmissionId);
        setSubmissionLoadState("loaded");
      } else {
        setSubmissionLoadState("missing");
      }
      if (feedbackResult.error) {
        const message = feedbackResult.error.message || "Rubric is not available yet.";
        if (!isMissingDatabaseObject(feedbackResult.error) && feedbackResult.error.code !== "PGRST116") {
          console.warn("Student lesson rubric could not be loaded:", message);
        }
      }
      const feedback = feedbackResult.data;
      if (feedback) {
        const rubricScores = feedback.rubric_scores || feedback.scores || feedback.criterion_feedback?.scores || defaultScores;
        onUpdateEvaluation?.({
          scores: rubricScores,
          totalScore: Number(feedback.total_score ?? feedback.score ?? Object.values(rubricScores).reduce<number>((total, score) => total + Number(score), 0)),
          comments: feedback.comments || "",
          criterionFeedback: feedback.criterion_feedback?.comments || feedback.criterion_feedback || evaluation?.criterionFeedback || {},
          stageFeedback: feedback.criterion_feedback?.stages || evaluation?.stageFeedback || {},
          strengths: feedback.strengths || undefined,
          areasToImprove: feedback.areas_to_improve || undefined,
          studyHubPrescription: feedback.study_hub_prescription || undefined,
          voiceFeedbackUrl: feedback.voice_feedback_url || undefined,
          published: Boolean(feedback.is_published),
        });
      }
    } catch (error) {
      if (pendingSubmissionId) {
        setSubmissionId(pendingSubmissionId);
        setSubmissionLoadState("loaded");
      } else {
        setSubmissionLoadState("missing");
      }
      if (error instanceof Error) console.warn("Student submission could not be refreshed:", error.message);
    }
  };

  const handleScoreChange = (id: string, val: number) => {
    onUpdateEvaluation?.({ ...evaluation, scores: { ...scores, [id]: val }, comments, criterionFeedback });
  };

  const totalScore = Object.values(scores).reduce((acc, curr) => acc + curr, 0);

  const handleSubmit = async () => {
    // Legacy callback-based submission
    if (!useSupabase) {
      if (onSubmitFeedback) {
        onSubmitFeedback({ scores, totalScore, comments, criterionFeedback, stageFeedback });
      }
      setIsSubmitted(true);
      setTimeout(() => setIsSubmitted(false), 3000);
      return;
    }

    // Supabase-based submission
    if (!lessonId || !studentId || !submissionId) {
      setSubmitError("Missing required data for submission");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const totalScoreNumeric = Object.values(scores).reduce((a, b) => a + b, 0);
      if (onSubmitFeedback) {
        await onSubmitFeedback({ scores, totalScore: totalScoreNumeric, comments, criterionFeedback, stageFeedback });
        setIsSubmitted(true);
        window.setTimeout(() => setIsSubmitted(false), 3000);
        return;
      }

      await saveInstructorFeedback(lessonId, studentId, {
        ...evaluation,
        scores,
        totalScore: totalScoreNumeric,
        comments,
        criterionFeedback,
        stageFeedback,
        published: true,
      });

      setIsSubmitted(true);
      setTimeout(() => setIsSubmitted(false), 3000);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit evaluation";
      const databaseError = error && typeof error === "object"
        ? error as { code?: string; message?: string; status?: number }
        : null;
      if (isMissingDatabaseObject(databaseError)) {
        setSubmitError("Evaluation storage is unavailable. Apply the latest Supabase migrations and try again.");
      } else {
        setSubmitError(errorMessage);
        console.error("Error submitting evaluation:", error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateEvaluation = (changes: Partial<LessonEvaluation>) => {
    onUpdateEvaluation?.({ ...evaluation, scores, comments, criterionFeedback, stageFeedback, ...changes });
  };

  return <UnifiedReportCard
    stages={reportCardStages}
    isInstructorView
    isEvaluated={evaluation?.published === true}
    scores={scores}
    criterionFeedback={criterionFeedback}
    stageFeedback={stageFeedback}
    comments={comments}
    strengths={evaluation?.strengths}
    areasToImprove={evaluation?.areasToImprove}
    studyHubPrescription={evaluation?.studyHubPrescription}
    onScoreChange={handleScoreChange}
    onCriterionFeedbackChange={(criterion, value) => updateEvaluation({ criterionFeedback: { ...criterionFeedback, [criterion]: value } })}
    onStageFeedbackChange={(stageId, value) => updateEvaluation({ stageFeedback: { ...stageFeedback, [stageId]: value } })}
    onGeneralFeedbackChange={(field, value) => updateEvaluation({ [field]: value })}
    onPublish={handleSubmit}
    isSubmitting={isSubmitting}
    isSubmitted={isSubmitted}
    submitError={submitError || (useSupabase && submissionLoadState === "missing" ? "Student has not submitted work for this lesson yet." : null)}
  />;
}

export default SubmissionEvaluator;
