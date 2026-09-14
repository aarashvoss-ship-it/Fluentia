"use client";

import React from "react";
import { CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export interface StepResult {
  id: string;
  step: string;
  prompt?: string;
  answer: string;
  referenceAnswer?: string;
}

interface CelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onReview: () => void;
  studentName?: string;
  dashboardHref?: string;
  stepResults?: StepResult[];
}

export function CelebrationModal({
  isOpen,
  onClose,
  onSubmit,
  onReview,
  studentName = "Arash",
  dashboardHref = "/dashboard",
  stepResults = [],
}: CelebrationModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleSaveDraftAndExit = () => {
    onClose();
    router.push(dashboardHref);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-800 bg-[#141413] shadow-2xl">
        <div className="sticky top-0 z-10 shrink-0 space-y-6 border-b border-stone-800 bg-[#141413] p-8">
          {/* Checkmark Icon centered at top */}
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 shadow-inner">
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

        <div className="min-h-0 flex-1 px-8">
          {stepResults.length > 0 && (
            <div className="space-y-3 py-4 text-left">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Six-Step Review</p>
              <p className="mt-1 text-xs text-stone-500">Review each submitted response before finalizing the lesson.</p>
            </div>
            <div className="min-h-0 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              {stepResults.map((result) => (
                <div key={result.id} className="rounded-lg border border-stone-800 bg-stone-950/50 p-3 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold uppercase tracking-[0.12em] text-amber-400">{result.step}</p>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-stone-600">Submitted</span>
                  </div>
                  {result.prompt && <p className="mt-2 text-stone-400">{result.prompt}</p>}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.1em] text-stone-500">Your response</p>
                      <p className="mt-1 whitespace-pre-wrap text-stone-200">{result.answer || "No response submitted"}</p>
                    </div>
                    {result.referenceAnswer && <div>
                      <p className="text-[10px] uppercase tracking-[0.1em] text-amber-500/80">Reference / Correct Answer</p>
                      <p className="mt-1 whitespace-pre-wrap text-amber-200">{result.referenceAnswer}</p>
                    </div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 z-10 shrink-0 space-y-3 border-t border-stone-800 bg-[#141413] p-8 pt-4">
          {/* Primary CTA */}
          <button
            onClick={onSubmit}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-sm transition-all duration-150 shadow-lg shadow-amber-500/10 active:scale-[0.99]"
          >
            <span>Submit &amp; View Results</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Secondary & Ghost Actions */}
          <div className="flex flex-col space-y-1 pt-1">
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
  );
}
