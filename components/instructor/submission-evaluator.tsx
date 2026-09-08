"use client";

import React, { useState } from "react";
import { CheckCircle, Award } from "lucide-react";

export interface FeedbackPayload {
  scores: Record<string, number>;
  totalScore: number;
  comments: string;
}

interface SubmissionEvaluatorProps {
  lessonId?: string;
  studentName?: string;
  onSubmitFeedback?: (data: FeedbackPayload) => void;
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
}: SubmissionEvaluatorProps) {
  const [scores, setScores] = useState<Record<string, number>>({
    task: 4,
    coherence: 4,
    lexical: 3,
    grammar: 4,
  });

  const [comments, setComments] = useState<string>(
    "Great work on incorporating specific behavioral terms. Focus a bit more on hedging phrases in your introduction."
  );
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const handleScoreChange = (id: string, val: number) => {
    setScores((prev) => ({ ...prev, [id]: val }));
  };

  const totalScore = Object.values(scores).reduce((acc, curr) => acc + curr, 0);

  const handleSubmit = () => {
    if (onSubmitFeedback) {
      onSubmitFeedback({ scores, totalScore, comments });
    }
    setIsSubmitted(true);
    setTimeout(() => setIsSubmitted(false), 3000);
  };

  return (
    <div className="bg-[#182635] border border-[#273647] rounded-xl p-5 text-[#d4e4fa] shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[#273647] pb-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Award className="w-5 h-5 text-[#ffc66b]" />
          Submission Evaluation & Rubric
        </h3>
        <span className="text-xs bg-[#122131] text-[#ffc66b] px-2.5 py-1 rounded-full border border-[#273647] font-mono">
          Total: {totalScore}/20
        </span>
      </div>

      <div className="space-y-3">
        {RUBRIC_CRITERIA.map((criterion) => {
          const currentScore = scores[criterion.id] || 0;
          return (
            <div
              key={criterion.id}
              className="bg-[#122131] p-3 rounded-lg border border-[#273647] flex items-center justify-between text-xs"
            >
              <span className="font-medium text-slate-300">{criterion.label}</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleScoreChange(criterion.id, num)}
                    className={`w-6 h-6 rounded text-[11px] font-medium transition ${
                      currentScore === num
                        ? "bg-[#ffc66b] text-[#122131]"
                        : "bg-[#182635] text-slate-400 hover:text-white"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
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
          onChange={(e) => setComments(e.target.value)}
          placeholder="Provide detailed feedback for the student..."
          className="w-full bg-[#122131] border border-[#273647] rounded-lg p-3 text-xs text-[#d4e4fa] focus:outline-none focus:border-[#ffc66b] h-24 font-serif leading-relaxed"
        />
      </div>

      <button
        onClick={handleSubmit}
        className="w-full bg-[#ffc66b] hover:bg-[#e5b25f] text-[#122131] font-semibold text-xs py-2.5 rounded-lg transition flex items-center justify-center gap-1.5 shadow"
      >
        {isSubmitted ? (
          <>
            <CheckCircle className="w-4 h-4 text-emerald-800" /> Evaluation Saved & Sent
          </>
        ) : (
          "Publish Evaluation to Student"
        )}
      </button>
    </div>
  );
}

export default SubmissionEvaluator;
