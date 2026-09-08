"use client";

import React from "react";
import { Check } from "lucide-react";
import { StudyStepId, STUDY_STEPS } from "@/types/lesson";

interface StepperProps {
  currentStep: StudyStepId;
  completedSteps: StudyStepId[];
  onStepClick: (stepId: StudyStepId) => void;
  lockedSteps?: StudyStepId[];
}

export function Stepper({
  currentStep,
  completedSteps,
  onStepClick,
}: StepperProps) {
  return (
    <nav aria-label="Study Progress" className="w-full pt-6">
      <div className="flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto px-1 scrollbar-none">
        {STUDY_STEPS.map((step, index) => {
          const stepOrder = index + 1;
          const isActive = step.id === currentStep;
          const isCompleted = completedSteps.includes(step.id);

          return (
            <button
              key={step.id}
              onClick={() => onStepClick(step.id)}
              aria-current={isActive ? "step" : undefined}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all duration-200 ease-out whitespace-nowrap ${
                isActive
                  ? "bg-stone-800/90 text-amber-400 shadow-sm border border-stone-700/60 ring-1 ring-amber-500/20"
                  : isCompleted
                  ? "text-stone-300 hover:text-stone-100 hover:bg-stone-900/60 border border-transparent"
                  : "text-stone-500 hover:text-stone-400 hover:bg-stone-900/40 border border-transparent"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all duration-200 ease-out ${
                  isActive
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm scale-105"
                    : isCompleted
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-stone-900 text-stone-500 border border-stone-800"
                }`}
              >
                {isCompleted && !isActive ? (
                  <Check className="w-3 h-3 stroke-[2.5]" />
                ) : (
                  <span>{stepOrder}</span>
                )}
              </div>
              <span>{step.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
