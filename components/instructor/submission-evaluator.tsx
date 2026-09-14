"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle, Award, AlertCircle } from "lucide-react";
import { LessonEvaluation } from "@/types/lesson";
import {
  getSubmissionByLessonAndStudent,
  createEvaluation,
  updateEvaluation,
} from "@/lib/evaluations";

export interface FeedbackPayload {
  scores: Record<string, number>;
  totalScore: number;
  comments: string;
  criterionFeedback: Record<string, string>;
}

interface SubmissionEvaluatorProps {
  lessonId?: string;
  studentName?: string;
  studentId?: string;
  instructorId?: string;
  onSubmitFeedback?: (data: FeedbackPayload) => void;
  evaluation?: LessonEvaluation;
  onUpdateEvaluation?: (evaluation: LessonEvaluation) => void;
  useSupabase?: boolean; // When true, submits to Supabase instead of callback
}

const RUBRIC_CRITERIA = [
  { id: "task", label: "Task Achievement & Depth", max: 5 },
  { id: "coherence", label: "Coherence & Flow", max: 5 },
  { id: "lexical", label: "Lexical Precision & Range", max: 5 },
  { id: "grammar", label: "Grammatical Accuracy", max: 5 },
];

export function SubmissionEvaluator({
  lessonId = "habits-01",
  studentName = "Arash",
  studentId,
  instructorId,
  onSubmitFeedback,
  evaluation,
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
  const [evaluationId, setEvaluationId] = useState<string | null>(null);

  // Load existing submission and evaluation if useSupabase is enabled
  useEffect(() => {
    if (useSupabase && lessonId && studentId) {
      loadSubmissionData();
    }
  }, [lessonId, studentId, useSupabase]);

  const loadSubmissionData = async () => {
    try {
      const submission = await getSubmissionByLessonAndStudent(lessonId, studentId!);
      if (submission) {
        setSubmissionId(submission.id);
        if (submission.evaluation) {
          setEvaluationId(submission.evaluation.id);
        }
      }
    } catch (error) {
      console.error("Error loading submission:", error);
    }
  };

  const handleScoreChange = (id: string, val: number) => {
    onUpdateEvaluation?.({ scores: { ...scores, [id]: val }, comments, criterionFeedback });
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
    if (!lessonId || !studentId || !instructorId || !submissionId) {
      setSubmitError("Missing required data for submission");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const feedbackText = `
Scores:
- Task Achievement & Depth: ${scores.task}/5
- Coherence & Flow: ${scores.coherence}/5
- Lexical Precision & Range: ${scores.lexical}/5
- Grammatical Accuracy: ${scores.grammar}/5

${Object.entries(criterionFeedback)
  .filter(([, value]) => value)
  .map(([criterion, feedback]) => `${criterion}: ${feedback}`)
  .join("\n\n")}

General Feedback:
${comments}
      `.trim();

      const totalScoreNumeric = Object.values(scores).reduce((a, b) => a + b, 0);

      if (evaluationId) {
        // Update existing evaluation
        await updateEvaluation(evaluationId, {
          feedback: feedbackText,
          score: totalScoreNumeric,
        });
      } else {
        // Create new evaluation
        const result = await createEvaluation({
          submission_id: submissionId,
          instructor_id: instructorId,
          feedback: feedbackText,
          score: totalScoreNumeric,
        });
        setEvaluationId(result.id);
      }

      setIsSubmitted(true);
      setTimeout(() => setIsSubmitted(false), 3000);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit evaluation";
      setSubmitError(errorMessage);
      console.error("Error submitting evaluation:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#171d28]/60 border border-[#202631] rounded-xl p-5 text-[#d9dce0] space-y-4">
      <div className="flex items-center justify-between border-b border-[#202631] pb-3">
        <h3 className="font-[var(--font-fraunces)] text-xl font-semibold flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-400" />
          Submission Evaluation & Rubric
        </h3>
        <span className="text-xs bg-[#0c1017] text-amber-400 px-2.5 py-1 rounded-full border border-[#202631]">
          Total: {totalScore}/20
        </span>
      </div>

      {submitError && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="space-y-3">
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
                onChange={(event) => onUpdateEvaluation?.({ scores, comments, criterionFeedback: { ...criterionFeedback, [criterion.id]: event.target.value } })}
                placeholder={`Written feedback for ${criterion.label.toLowerCase()}...`}
                rows={2}
                className="w-full resize-none rounded-md border border-[#202631] bg-[#171d28] p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500"
                aria-label={`${criterion.label} written feedback`}
              />
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-slate-400 font-medium block">
          Personalized Feedback & Corrections
        </label>
        <textarea
          value={comments}
          onChange={(e) =>
            onUpdateEvaluation?.({ scores, comments: e.target.value, criterionFeedback })
          }
          placeholder="Provide detailed feedback for the student..."
          className="w-full bg-[#0c1017] border border-[#202631] rounded-lg p-3 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500 h-24 leading-relaxed"
        />
      </div>

      <div className="grid gap-3 border-t border-[#202631] pt-4">
        {[
          ["strengths", "Strengths", evaluation?.strengths || "", "Record specific strengths or successful choices..."],
          ["areasToImprove", "Areas to Improve", evaluation?.areasToImprove || "", "List focused next steps or recurring issues..."],
          ["studyHubPrescription", "Study Hub Prescription", evaluation?.studyHubPrescription || "", "Add a resource link or recommended topic..."],
          ["voiceFeedbackUrl", "Voice Feedback URL / Recorder Placeholder", evaluation?.voiceFeedbackUrl || "", "Paste an audio URL or note where a recording will be added..."],
        ].map(([field, label, value, placeholder]) => (
          <label key={field} className="text-xs text-slate-400">
            {label}
            <textarea
              value={value}
              onChange={(event) => onUpdateEvaluation?.({ ...evaluation, scores, comments, criterionFeedback, [field]: event.target.value })}
              placeholder={placeholder}
              rows={field === "voiceFeedbackUrl" ? 2 : 3}
              className="mt-1 w-full resize-none rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500"
            />
          </label>
        ))}
      </div>

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
          "Publish Evaluation to Student"
        )}
      </button>
    </div>
  );
}

export default SubmissionEvaluator;
