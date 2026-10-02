"use client";

import React from "react";
import { CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";

export interface StepResult {
  id: string;
  step: string;
  prompt?: string;
  responses: {
    id?: string;
    question: string;
    answer: string;
    correctAnswer?: string;
    explanation?: string;
    isCorrect?: boolean;
    mediaUrls?: string[];
  }[];
}

interface CelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onReview: () => void;
  studentName?: string;
  dashboardHref?: string;
  stepResults?: StepResult[];
  isSubmitting?: boolean;
  submitError?: string | null;
}

export function CelebrationModal({
  isOpen,
  onClose,
  onSubmit,
  onReview,
  studentName = "Student",
  dashboardHref = "/dashboard",
  stepResults = [],
  isSubmitting = false,
  submitError,
}: CelebrationModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleSaveDraftAndExit = () => {
    onClose();
    router.push(dashboardHref);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex h-[85vh] max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-800 bg-[#141413] shadow-2xl">
        <div className="sticky top-0 z-10 shrink-0 space-y-4 border-b border-stone-800 bg-[#141413] p-6">
          {/* Checkmark Icon centered at top */}
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/20 text-amber-400 shadow-inner">
              <CheckCircle2 className="h-8 w-8" />
            </div>
          </div>

          {/* Left-aligned Content */}
          <div className="space-y-2 text-left">
            <h2 className="font-sans text-2xl tracking-tight text-stone-100">
              Outstanding work, {studentName}.
            </h2>
            <p className="text-sm leading-relaxed text-stone-400">
              You&apos;ve completed all interactive steps. Take a moment to review your answers, or submit to finalize.
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-6">
          <div className="shrink-0 space-y-3 py-3 text-left">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Six-Step Review</p>
              <p className="mt-1 text-xs text-stone-500">Review each submitted response before finalizing the lesson.</p>
            </div>
          </div>
          <div className="review-response-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 scroll-smooth">
              {stepResults.map((result) => (
                <section key={result.id} className="rounded-lg border border-stone-800 bg-stone-950/50 p-3 text-xs">
                  <h3 className="font-semibold uppercase tracking-[0.12em] text-amber-400">{result.step}</h3>
                  {result.prompt && <p className="mt-2 whitespace-pre-wrap text-stone-400">{result.prompt}</p>}
                  <div className="mt-3 space-y-2">
                    {result.responses.map((response, index) => <article key={`${response.question}-${index}`} className="rounded-md border border-stone-800 bg-[#141413] p-3">
                      <p className="font-medium text-stone-200">Question {index + 1}: {response.question}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-[0.1em] text-stone-500">Your Response</p>
                      <p className="mt-1 whitespace-pre-wrap text-stone-200">{response.answer || "No response submitted"}</p>
                      {response.correctAnswer && <div className="mt-2">
                        <p className="text-[10px] uppercase tracking-[0.1em] text-amber-400">Correct Answer</p>
                        <p className="mt-1 whitespace-pre-wrap text-amber-400">{response.correctAnswer}</p>
                      </div>}
                      {(response.explanation || response.isCorrect === false) && <div className="mt-2">
                        <p className="text-[10px] uppercase tracking-[0.1em] text-stone-500">Explanation</p>
                        <p className="mt-1 whitespace-pre-wrap text-stone-300">{response.explanation || "Compare your response with the correct answer."}</p>
                      </div>}
                    </article>)}
                    {!result.responses.length && <div className="rounded-md border border-dashed border-stone-800 bg-black/20 px-3 py-4 text-center">
                      <p className="font-medium text-stone-300">Instructional Step Completed</p>
                      <p className="mt-1 leading-relaxed text-stone-500">This stage focused on learning content and required no interactive response.</p>
                    </div>}
                  </div>
                </section>
              ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 z-10 shrink-0 border-t border-stone-800 bg-[#141413] px-6 pb-2 pt-3">
          {/* Primary CTA */}
          {submitError && <p role="alert" className="mb-3 text-xs text-red-300">Submission could not be saved: {submitError}</p>}
          <div className="space-y-1.5">
            <button
              onClick={onSubmit}
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500 px-6 py-2.5 text-sm !font-semibold text-zinc-950 shadow-md shadow-amber-500/20 transition-colors duration-200 hover:bg-amber-400 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              <span>{isSubmitting ? "Saving Submission..." : "Submit & View Results"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Secondary & Ghost Actions */}
            <div className="flex flex-col space-y-1">
            <button
              onClick={onReview}
              className="w-full flex items-center gap-2 py-2.5 px-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800/40 rounded-lg text-sm transition-colors text-left font-normal"
            >
              <ArrowLeft className="w-4 h-4 text-stone-500 shrink-0" />
              <span>Review &amp; Edit Answers</span>
            </button>

            <button
              onClick={handleSaveDraftAndExit}
              className="w-full flex items-center gap-2 py-2.5 px-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800/40 rounded-lg text-sm transition-colors text-left font-normal"
            >
              <ArrowLeft className="w-4 h-4 text-stone-500 shrink-0" />
              <span>Exit to Dashboard</span>
            </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
