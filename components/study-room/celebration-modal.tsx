"use client";

import React from "react";
import { CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface CelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onReview: () => void;
  studentName?: string;
}

export function CelebrationModal({
  isOpen,
  onClose,
  onSubmit,
  onReview,
  studentName = "Arash",
}: CelebrationModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleSaveDraftAndExit = () => {
    onClose();
    router.push("/dashboard");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-[#141413] border border-stone-800 p-8 shadow-2xl space-y-6">
        
        {/* Checkmark Icon centered at top */}
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-inner">
            <CheckCircle2 className="w-8 h-8" />
          </div>
        </div>

        {/* Left-aligned Content */}
        <div className="space-y-2 text-left">
          <h2 className="text-2xl font-sans text-stone-100 tracking-tight">
            Outstanding work, {studentName}.
          </h2>
          <p className="text-sm leading-relaxed text-stone-400">
            You&apos;ve completed all interactive steps. Take a moment to review your answers, or submit to finalize.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
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
              <span>Save Draft &amp; Exit to Dashboard</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
