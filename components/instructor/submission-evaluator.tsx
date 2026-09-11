"use client";

import React, { useState } from "react";
import { CheckCircle, Award } from "lucide-react";
import { LessonEvaluation } from "@/types/lesson";

export interface FeedbackPayload {
  scores: Record<string, number>;
  totalScore: number;
  comments: string;
  criterionFeedback: Record<string, string>;
}

interface SubmissionEvaluatorProps {
  lessonId?: string;
  studentName?: string;
  onSubmitFeedback?: (data: FeedbackPayload) => void;
  evaluation?: LessonEvaluation;
  onUpdateEvaluation?: (evaluation: LessonEvaluation) => void;
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
  onSubmitFeedback,
  evaluation,
  onUpdateEvaluation,
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

  const handleScoreChange = (id: string, val: number) => {
    onUpdateEvaluation?.({ scores: { ...scores, [id]: val }, comments, criterionFeedback });
  };

  const totalScore = Object.values(scores).reduce((acc, curr) => acc + curr, 0);

  const handleSubmit = () => {
    if (onSubmitFeedback) {
      onSubmitFeedback({ scores, totalScore, comments, criterionFeedback });
    }
    setIsSubmitted(true);
    setTimeout(() => setIsSubmitted(false), 3000);
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
        className="w-full bg-amber-500 hover:bg-amber-400 text-[#0c1017] font-semibold text-xs py-2.5 rounded-lg transition flex items-center justify-center gap-1.5 shadow"
      >
        {isSubmitted ? (
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
