"use client";

import React from "react";
import { CheckCircle2, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
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
      <div className="relative flex h-[85vh] max-h-[52rem] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-amber-500/20 bg-[#141413] shadow-2xl shadow-amber-950/20">
        <div className="shrink-0 border-b border-stone-800 bg-gradient-to-b from-amber-500/[0.08] to-transparent px-6 pb-5 pt-7 text-center sm:px-10 sm:pt-8">
          <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-amber-400/50 bg-amber-500/15 text-amber-300 shadow-[0_0_38px_rgba(217,119,6,0.3)]">
            <span className="absolute -right-2 top-1 text-amber-300/80" aria-hidden="true"><Sparkles className="h-4 w-4" /></span>
            <span className="absolute -left-2 bottom-2 text-amber-400/70" aria-hidden="true"><Sparkles className="h-3 w-3" /></span>
            <CheckCircle2 className="h-11 w-11" strokeWidth={1.8} />
          </div>
          <h2 className="font-sans text-3xl font-bold tracking-tight text-amber-50 sm:text-4xl">
            Outstanding work, {studentName}.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-stone-300">
            You completed every interactive step. Celebrate the progress, then submit to see your results.
          </p>
        </div>

        <div className="review-response-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 sm:px-10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Six-Step Summary</p>
            <p className="text-[11px] text-stone-500">Optional · expand to review</p>
          </div>
          <div className="space-y-2">
            {stepResults.map((result) => {
              const firstResponse = result.responses[0];
              const preview = firstResponse?.answer?.trim() || (firstResponse ? "No response submitted" : "Learning content completed");
              return (
                <details key={result.id} className="group rounded-lg border border-stone-800 bg-stone-950/40 text-xs">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2.5 outline-none transition hover:bg-stone-900/70 focus-visible:ring-2 focus-visible:ring-amber-500/50 [&::-webkit-details-marker]:hidden">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-400"><CheckCircle2 className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold uppercase tracking-[0.08em] text-stone-200">{result.step}</span>
                      <span className="mt-0.5 block truncate text-stone-500">{preview}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-stone-500">{result.responses.length ? `${result.responses.length} ${result.responses.length === 1 ? "response" : "responses"}` : "Complete"}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-stone-500 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="space-y-2 border-t border-stone-800 px-3 pb-3 pt-2.5">
                    {result.prompt && <p className="line-clamp-2 text-stone-400">{result.prompt}</p>}
                    {result.responses.map((response, index) => (
                      <article key={`${response.question}-${index}`} className="rounded-md bg-[#141413] px-3 py-2.5">
                        <p className="font-medium text-stone-300">{response.question}</p>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">Your response</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-stone-200">{response.answer || "No response submitted"}</p>
                      </article>
                    ))}
                    {!result.responses.length && <p className="text-stone-500">This step focused on learning content and required no written response.</p>}
                  </div>
                </details>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="shrink-0 border-t border-stone-800 bg-[#141413] px-6 pb-4 pt-3 sm:px-10">
          {/* Primary CTA */}
          {submitError && <p role="alert" className="mb-3 text-xs text-red-300">Submission could not be saved: {submitError}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={onSubmit}
              disabled={isSubmitting}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500 px-6 py-3 text-sm font-bold text-zinc-950 shadow-md shadow-amber-500/25 transition-colors duration-200 hover:bg-amber-400 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              <span>{isSubmitting ? "Saving Submission..." : "Submit & View Results"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={onReview}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-stone-700 px-4 py-3 text-xs font-medium text-stone-300 transition-colors hover:border-amber-500/40 hover:bg-stone-800/50 hover:text-amber-200"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Review &amp; Edit</span>
            </button>
          </div>
          <div className="mt-2 text-right">
            <button
              onClick={handleSaveDraftAndExit}
              className="text-[11px] text-stone-500 transition-colors hover:text-stone-300"
            >
              Exit to Dashboard
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
