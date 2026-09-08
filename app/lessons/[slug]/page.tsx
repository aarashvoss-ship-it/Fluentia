"use client";

import { useState } from "react";
import Link from "next/link";
import { StudyStepId, STUDY_STEPS, LessonContent } from "@/types/lesson";
import { Stepper } from "@/components/study-room/stepper";
import { CelebrationModal } from "@/components/study-room/celebration-modal";
import {
  ArrowRight,
  ChevronRight,
  Sparkles,
  BookOpen,
  Headphones,
  FileText,
  PenTool,
  Mic,
  Award,
} from "lucide-react";

const mockLesson: LessonContent = {
  id: "lesson-habits-01",
  slug: "habits-01",
  title: "The Architecture of Daily Habits",
  subtitle: "Understanding Cue, Routine, and Reward in Modern Productivity",
  moduleNumber: 1,
  studentName: "Arash",
  coverImage: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80",
};

function getLockedSteps(completedSteps: StudyStepId[]): StudyStepId[] {
  const locked: StudyStepId[] = [];
  for (let i = 0; i < STUDY_STEPS.length; i++) {
    const step = STUDY_STEPS[i];
    if (i === 0) continue;
    const prev = STUDY_STEPS[i - 1];
    if (!completedSteps.includes(prev.id)) {
      locked.push(step.id);
    }
  }
  return locked;
}

export default function LessonPage() {
  const [currentStep, setCurrentStep] = useState<StudyStepId>("warm_up");
  const [completedSteps, setCompletedSteps] = useState<StudyStepId[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const currentIndex = STUDY_STEPS.findIndex((s) => s.id === currentStep);
  const lockedSteps = getLockedSteps(completedSteps);

  function markStepComplete(stepId: StudyStepId) {
    setCompletedSteps((prev) =>
      prev.includes(stepId) ? prev : [...prev, stepId]
    );
  }

  function handleNext() {
    markStepComplete(currentStep);
    if (currentIndex < STUDY_STEPS.length - 2) {
      setCurrentStep(STUDY_STEPS[currentIndex + 1].id);
    } else if (currentIndex === STUDY_STEPS.length - 2) {
      setIsModalOpen(true);
    }
  }

  function handlePrev() {
    if (currentIndex > 0) {
      setCurrentStep(STUDY_STEPS[currentIndex - 1].id);
    }
  }

  function handleStepClick(stepId: StudyStepId) {
    if (lockedSteps.includes(stepId)) return;
    setCurrentStep(stepId);
  }

  function handleReviewAnswers() {
    setIsModalOpen(false);
    setCurrentStep("warm_up");
  }

  function handleSubmitFinal() {
    setIsModalOpen(false);
    markStepComplete("speaking");
    markStepComplete("results");
    setCurrentStep("results");
  }

  const isResultsStep = currentStep === "results";

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-stone-950/90 backdrop-blur-sm border-b border-stone-800/60">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="text-stone-400 hover:text-stone-200 transition-colors text-sm flex items-center gap-1"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back
          </Link>
          <div className="h-4 w-px bg-stone-700" />
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Module {mockLesson.moduleNumber}
          </span>
          <h1 className="text-sm font-medium text-stone-200 truncate flex-1">
            {mockLesson.title}
          </h1>
          <span className="text-xs text-stone-500 shrink-0">
            Student: {mockLesson.studentName}
          </span>
        </div>

        {/* Stepper */}
        <div className="max-w-4xl mx-auto px-4 pb-3">
          <Stepper
            currentStep={currentStep}
            completedSteps={completedSteps}
            lockedSteps={lockedSteps}
            onStepClick={handleStepClick}
          />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Hero Banner */}
        {!isResultsStep && (
          <div className="relative rounded-2xl overflow-hidden h-36 sm:h-44">
            <img
              src={mockLesson.coverImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-stone-950/20 to-transparent" />
            <div className="relative h-full flex flex-col justify-end p-5">
              <p className="text-xs text-amber-400/80 font-medium mb-1">
                Step {currentIndex + 1} of {STUDY_STEPS.length - 1} &bull;{" "}
                {STUDY_STEPS[currentIndex]?.label}
              </p>
              <h2 className="text-lg sm:text-xl font-semibold text-stone-100 leading-snug">
                {mockLesson.title}
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">{mockLesson.subtitle}</p>
            </div>
          </div>
        )}

        {/* Step Content */}
        <div className="space-y-6">
          {/* Warm Up */}
          {currentStep === "warm_up" && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Sparkles className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Phase 1: Priming &amp; Curiosity
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-100">
                Warm-up &amp; Context
              </h3>
              <p className="text-stone-400 text-sm leading-relaxed">
                Before we dive in, take a moment to reflect. What does a productive
                day look like for you? What habits are you trying to build or break?
              </p>
              <textarea
                className="w-full bg-stone-900 border border-stone-700/60 rounded-xl px-4 py-3 text-sm text-stone-200 placeholder-stone-600 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40 transition-colors"
                rows={4}
                placeholder="Write your thoughts here..."
              />
            </section>
          )}

          {/* Lesson */}
          {currentStep === "lesson" && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-amber-400">
                <BookOpen className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Core Lesson
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-100">
                The Habit Loop Anatomy
              </h3>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { label: "Cue", desc: "The trigger that initiates a behavior — a time, place, emotion, or preceding action." },
                  { label: "Routine", desc: "The behavior itself: physical, mental, or emotional." },
                  { label: "Reward", desc: "The benefit that reinforces the loop and signals the brain to remember it." },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-2"
                  >
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                      {item.label}
                    </p>
                    <p className="text-sm text-stone-400 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Listening */}
          {currentStep === "listening" && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Headphones className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Audio Immersion
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-100">
                Friction as Architecture
              </h3>
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 flex items-center gap-4">
                <button className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 hover:bg-amber-500/20 transition-colors">
                  ▶
                </button>
                <div className="flex-1 h-1.5 bg-stone-800 rounded-full" />
                <span className="text-xs text-stone-500 tabular-nums">02:45</span>
              </div>
            </section>
          )}

          {/* Reading */}
          {currentStep === "reading" && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-amber-400">
                <FileText className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Reading
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-100">
                Architectural Cue Management
              </h3>
              <blockquote className="border-l-2 border-amber-500/40 pl-4 text-stone-400 text-sm leading-relaxed italic">
                "You do not rise to the level of your goals. You fall to the level of
                your systems."
              </blockquote>
              <p className="text-stone-400 text-sm leading-relaxed">
                Designing your environment to make desired behaviors easier and
                undesired behaviors harder is the single highest-leverage habit
                intervention available.
              </p>
            </section>
          )}

          {/* Writing */}
          {currentStep === "writing" && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-amber-400">
                <PenTool className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Writing Task
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-100">
                Deliberate Writing Task
              </h3>
              <p className="text-stone-400 text-sm leading-relaxed">
                Describe one habit you want to build. Identify its cue, routine, and
                reward. How would you redesign your environment to support it?
              </p>
              <textarea
                className="w-full bg-stone-900 border border-stone-700/60 rounded-xl px-4 py-3 text-sm text-stone-200 placeholder-stone-600 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40 transition-colors"
                rows={6}
                placeholder="Write your response here..."
              />
            </section>
          )}

          {/* Speaking */}
          {currentStep === "speaking" && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Mic className="w-5 h-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Speaking
                </span>
              </div>
              <h3 className="text-xl font-semibold text-stone-100">
                Oral Summary Submission
              </h3>
              <p className="text-stone-400 text-sm leading-relaxed">
                Record a 60-second summary of your key takeaways from this lesson.
              </p>
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 flex items-center justify-center h-28">
                <button className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm hover:bg-amber-500/20 transition-colors">
                  <Mic className="w-4 h-4" />
                  Start Recording
                </button>
              </div>
            </section>
          )}

          {/* Results */}
          {currentStep === "results" && (
            <section className="space-y-6 text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <Award className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold text-stone-100">
                  Lesson Submitted &amp; Completed!
                </h3>
                <p className="text-stone-400 text-sm">
                  Outstanding work, {mockLesson.studentName}. Your instructor will
                  review your submission shortly.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-stone-800 border border-stone-700 text-stone-200 text-sm hover:bg-stone-700 transition-colors"
              >
                Return to Dashboard
              </Link>
            </section>
          )}
        </div>







        {/* Bottom Navigation */}
        {!isResultsStep && (
          <div className="flex items-center justify-between pt-4 border-t border-stone-800/60">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="px-4 py-2 rounded-lg text-sm text-stone-400 hover:text-stone-200 hover:bg-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm hover:bg-amber-500/20 transition-colors"
            >
              {currentIndex === STUDY_STEPS.length - 2 ? (
                <>
                  Next <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Next <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </main>

      <CelebrationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitFinal}
        onReview={handleReviewAnswers}
        studentName={mockLesson.studentName || "Arash"}
      />
    </div>
  );
}
