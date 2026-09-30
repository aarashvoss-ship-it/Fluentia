"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle, Award, AlertCircle } from "lucide-react";
import { LessonEvaluation } from "@/types/lesson";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getSubmissionByLessonAndStudent } from "@/lib/evaluations";
import { saveInstructorFeedback } from "@/services/storage-service";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";

export interface FeedbackPayload {
  scores: Record<string, number>;
  totalScore: number;
  comments: string;
  criterionFeedback: Record<string, string>;
}

export interface EvaluationReportAnswer {
  question: string;
  answer: string;
  modelAnswer?: string;
  audioUrl?: string;
}

export interface EvaluationReportStage {
  id: string;
  title: string;
  prompt?: string;
  answers: EvaluationReportAnswer[];
}

interface SubmissionEvaluatorProps {
  lessonId?: string;
  pendingSubmissionId?: string;
  studentName?: string;
  studentId?: string;
  instructorId?: string;
  onSubmitFeedback?: (data: FeedbackPayload) => void | Promise<void>;
  evaluation?: LessonEvaluation;
  reportCardStages?: EvaluationReportStage[];
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
        onSubmitFeedback({ scores, totalScore, comments, criterionFeedback });
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
        await onSubmitFeedback({ scores, totalScore: totalScoreNumeric, comments, criterionFeedback });
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
    onUpdateEvaluation?.({ ...evaluation, scores, comments, criterionFeedback, ...changes });
  };

  return (
    <div className="w-full rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-[#d9dce0] space-y-8">
      {reportCardStages.length > 0 && <section aria-label="Student report card" className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#202631] pb-3">
          <h3 className="font-sans text-xl font-semibold flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" /> Student Report Card
          </h3>
          <span className="text-xs bg-[#0c1017] text-amber-400 px-2.5 py-1 rounded-full border border-[#202631]">
            Total: {totalScore}/20
          </span>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {reportCardStages.map((stage) => <section key={stage.id} className="space-y-3 rounded-lg border border-[#293343] bg-[#121721] p-4">
            <div className="border-b border-[#293343] pb-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-400">{stage.title}</h4>
              {stage.prompt && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-400">{stripMarkdown(stage.prompt)}</p>}
            </div>
            {stage.answers.length > 0 ? <div className="space-y-3">
              {stage.answers.map((answer, index) => <article key={`${answer.question}-${index}`} className="rounded-lg border border-[#293343] bg-[#0c1017] p-4">
                <h5 className="text-sm font-medium leading-relaxed text-stone-200">{stripMarkdown(answer.question)}</h5>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Student&apos;s Submitted Answer</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-300">{stripMarkdown(answer.answer)}</p>
                    {answer.audioUrl && <div className="mt-2"><CustomAudioPlayer src={answer.audioUrl} label={`${stripMarkdown(answer.question)} recording`} /></div>}
                  </div>
                  {answer.modelAnswer && <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-500/80">Model / Correct Answer</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-amber-200">{stripMarkdown(answer.modelAnswer)}</p>
                  </div>}
                </div>
              </article>)}
            </div> : <p className="rounded-lg border border-dashed border-[#394252] px-4 py-5 text-center text-xs text-stone-500">No interactive response submitted for this stage.</p>}
          </section>)}
        </div>
      </section>}

      {submitError && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{submitError}</span>
        </div>
      )}

      {useSupabase && submissionLoadState === "missing" && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200">
          Student has not submitted work for this lesson yet.
        </div>
      )}

      <section aria-label="Feedback and corrections" className="space-y-3">
        <div className="border-b border-[#202631] pb-3">
          <h3 className="font-sans text-lg font-semibold text-stone-100">Feedback & Corrections</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-400">
            Personalized Feedback & Corrections
            <textarea
              value={comments}
              onChange={(event) => updateEvaluation({ comments: event.target.value })}
              placeholder="Provide detailed feedback for the student..."
              rows={4}
              className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-3 text-sm leading-relaxed text-[#d9dce0] focus:outline-none focus:border-amber-500"
            />
          </label>
          <label className="text-xs font-medium text-slate-400">
            Strengths
            <textarea
              value={evaluation?.strengths || ""}
              onChange={(event) => updateEvaluation({ strengths: event.target.value })}
              placeholder="Record specific strengths or successful choices..."
              rows={4}
              className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-3 text-sm leading-relaxed text-[#d9dce0] focus:outline-none focus:border-amber-500"
            />
          </label>
          <label className="text-xs font-medium text-slate-400">
            Areas to Improve
            <textarea
              value={evaluation?.areasToImprove || ""}
              onChange={(event) => updateEvaluation({ areasToImprove: event.target.value })}
              placeholder="List focused next steps or recurring issues..."
              rows={4}
              className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-3 text-sm leading-relaxed text-[#d9dce0] focus:outline-none focus:border-amber-500"
            />
          </label>
          <label className="text-xs font-medium text-slate-400">
            Study Hub Prescription
            <textarea
              value={evaluation?.studyHubPrescription || ""}
              onChange={(event) => updateEvaluation({ studyHubPrescription: event.target.value })}
              placeholder="Add a resource link or recommended topic..."
              rows={4}
              className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-3 text-sm leading-relaxed text-[#d9dce0] focus:outline-none focus:border-amber-500"
            />
          </label>
        </div>
      </section>

      <section aria-label="Rubric scores" className={`space-y-3 ${useSupabase && submissionLoadState === "missing" ? "opacity-60" : ""}`}>
        <div className="flex items-center justify-between border-b border-[#202631] pb-3">
          <h3 className="font-sans text-lg font-semibold text-stone-100">Submission Evaluation & Rubric</h3>
          <span className="text-xs text-amber-400">Total: {totalScore}/20</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
        {RUBRIC_CRITERIA.map((criterion) => {
          const currentScore = scores[criterion.id] || 0;
          return (
            <div
              key={criterion.id}
              className="bg-[#0c1017] p-3 rounded-lg border border-[#202631] space-y-3 text-xs"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-300">{criterion.label}</span>
                <span className="font-semibold text-amber-400">{currentScore}/5</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={currentScore}
                onChange={(event) => handleScoreChange(criterion.id, Number(event.target.value))}
                className="w-full accent-amber-500"
                aria-label={`${criterion.label} score`}
              />
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button key={num} type="button" onClick={() => handleScoreChange(criterion.id, num)} className={`h-6 flex-1 rounded text-[11px] font-medium transition ${currentScore === num ? "bg-amber-500 text-[#0c1017]" : "bg-[#171d28] text-stone-400 hover:text-white"}`}>
                    {num}
                  </button>
                ))}
              </div>
              <textarea
                value={criterionFeedback[criterion.id] || ""}
                onChange={(event) => updateEvaluation({ criterionFeedback: { ...criterionFeedback, [criterion.id]: event.target.value } })}
                placeholder={`Written feedback for ${criterion.label.toLowerCase()}...`}
                rows={2}
                className="w-full resize-none rounded-md border border-[#202631] bg-[#171d28] p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500"
                aria-label={`${criterion.label} written feedback`}
              />
            </div>
          );
        })}
        </div>
      </section>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || isSubmitted}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0c1017] font-semibold text-xs py-2.5 rounded-lg transition flex items-center justify-center gap-1.5 shadow"
      >
        {isSubmitting ? (
          <>
            <div className="h-4 w-4 border-2 border-[#0c1017] border-t-transparent rounded-full animate-spin" />
            Saving...
          </>
        ) : isSubmitted ? (
          <>
            <CheckCircle className="w-4 h-4 text-[#0c1017]" /> Evaluation Saved & Sent
          </>
        ) : (
          "Publish & Send Evaluation"
        )}
      </button>
    </div>
  );
}

export default SubmissionEvaluator;
