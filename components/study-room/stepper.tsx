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
  lockedSteps = [],
}: StepperProps) {
  return (
    <nav aria-label="Study Progress" className="w-full">
      <div className="flex w-full items-center justify-between gap-2 overflow-x-auto scrollbar-none sm:gap-3">
        {STUDY_STEPS.map((step, index) => {
          const stepOrder = index + 1;
          const isActive = step.id === currentStep;
          const isCompleted = completedSteps.includes(step.id);
          const isLocked = lockedSteps.includes(step.id);

          return (
            <button
              key={step.id}
              onClick={() => onStepClick(step.id)}
              disabled={isLocked}
              aria-current={isActive ? "step" : undefined}
              className={`group flex shrink-0 items-center gap-2 rounded-none border-0 px-0 py-1 text-[12px] font-medium leading-none transition-all duration-200 ease-out whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${
                isActive
                  ? "text-[#d99d22]"
                  : isCompleted
                  ? "text-[#8e96a5]"
                  : "text-[#545d70] hover:text-[#858d9c]"
              }`}
            >
              <div
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-semibold transition-all duration-200 ease-out ${
                  isActive
                    ? "border border-[#d99d22] bg-[#d99d22] text-[#12161d]"
                    : isCompleted
                    ? "border border-[#5c6879] bg-transparent text-[#8e96a5]"
                    : "border border-[#293343] bg-transparent text-transparent"
                }`}
              >
                {isCompleted && !isActive ? (
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
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
