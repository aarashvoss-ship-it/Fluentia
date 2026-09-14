"use client";

import React, { useEffect, useState } from "react";
import { Target, AlertCircle, History, Sparkles, Loader } from "lucide-react";
import { StudentProfile } from "@/types/lesson";
import { getSubmissionByLessonAndStudent, getEvaluationBySubmissionId } from "@/lib/evaluations";

interface StudentContextPanelProps {
  studentName?: string;
  profile?: StudentProfile;
  onUpdateProfile?: (profile: StudentProfile) => void;
  lessonId?: string;
  studentId?: string;
  useSupabase?: boolean;
}

export function StudentContextPanel({
  studentName = "Arash",
  profile,
  onUpdateProfile,
  lessonId,
  studentId,
  useSupabase = true,
}: StudentContextPanelProps) {
  const displayProfile: StudentProfile = profile || {
    id: "demo",
    fullName: studentName,
    avatarUrl: "",
    level: "B2 Intermediate",
    targetGoal: "Fluency & Professional Presentation",
    weaknesses: ["Complex Tenses", "Hedging Expressions", "Passive Voice"],
    teacherNotes: "Responds very well to reflective prompts. Needs more practice with natural transitional phrases.",
    attendanceRate: 94,
    completedModulesCount: 12,
  };

  const [submissionData, setSubmissionData] = useState<any>(null);
  const [evaluationData, setEvaluationData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load submission and evaluation data if useSupabase is enabled
  useEffect(() => {
    if (useSupabase && lessonId && studentId) {
      loadSubmissionAndEvaluation();
    }
  }, [lessonId, studentId, useSupabase]);

  const loadSubmissionAndEvaluation = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const submission = await getSubmissionByLessonAndStudent(lessonId!, studentId!);
      if (submission) {
        setSubmissionData(submission);
        if (submission.evaluation) {
          setEvaluationData(submission.evaluation);
        }
      }
    } catch (error) {
      console.error("Error loading submission data:", error);
      setLoadError("Failed to load submission data");
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = <K extends keyof StudentProfile>(
    field: K,
    value: StudentProfile[K]
  ) => {
    onUpdateProfile?.({ ...displayProfile, [field]: value });
  };

  return (
    <div className="bg-[#171d28]/60 border border-[#202631] rounded-xl p-5 text-[#d9dce0]">
      <div className="flex items-start justify-between pb-4 border-b border-[#202631]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#0c1017] border border-amber-500 flex items-center justify-center font-bold text-lg text-amber-400">
            {displayProfile.fullName.charAt(0)}
          </div>
          <div>
            <input
              value={displayProfile.fullName}
              onChange={(e) => updateProfile("fullName", e.target.value)}
              className="w-full bg-transparent font-[var(--font-fraunces)] font-semibold text-xl text-white focus:outline-none"
              aria-label="Student name"
            />
            <input
              value={displayProfile.level}
              onChange={(e) => updateProfile("level", e.target.value)}
              className="mt-1 w-full bg-transparent text-xs text-amber-400 focus:outline-none"
              aria-label="Student level"
            />
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Attendance</div>
          <div className="text-sm font-semibold text-amber-400">{displayProfile.attendanceRate}%</div>
        </div>
      </div>

      <div className="mt-4 space-y-4 text-xs">
        <div>
          <div className="text-slate-400 font-medium flex items-center gap-1.5 mb-1">
            <Target className="w-3.5 h-3.5 text-amber-400" /> Core Goal
          </div>
            <input
              value={displayProfile.targetGoal}
              onChange={(e) => updateProfile("targetGoal", e.target.value)}
              className="w-full bg-[#0c1017] p-2.5 rounded-lg border border-[#202631] text-stone-200 focus:outline-none focus:border-amber-500"
              aria-label="Student core goal"
            />
        </div>

        <div>
          <div className="text-slate-400 font-medium flex items-center gap-1.5 mb-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Focus Weaknesses
          </div>
          <div className="flex flex-wrap gap-1.5">
            {displayProfile.weaknesses.map((item, idx) => (
              <span
                key={idx}
                className="bg-amber-950/40 text-amber-300 border border-amber-800/40 px-2 py-1 rounded-md text-[11px]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="text-slate-400 font-medium flex items-center gap-1.5 mb-1">
            <History className="w-3.5 h-3.5 text-amber-400" /> Instructor Notes
          </div>
            <textarea
              value={displayProfile.teacherNotes}
              onChange={(e) => updateProfile("teacherNotes", e.target.value)}
              className="w-full bg-[#0c1017] p-2.5 rounded-lg border border-[#202631] text-stone-300 italic focus:outline-none focus:border-amber-500"
              aria-label="Instructor notes"
              rows={3}
            />
        </div>

        <div className="pt-2 border-t border-[#202631] flex items-center justify-between text-[11px] text-stone-400">
          <span className="flex items-center gap-1 text-amber-400">
            <Sparkles className="w-3 h-3" /> Personalized Mode Active
          </span>
          <span>{displayProfile.completedModulesCount} Modules Done</span>
        </div>

        {/* Submission & Evaluation Status (Supabase) */}
        {useSupabase && lessonId && studentId && (
          <div className="pt-4 border-t border-[#202631]">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400 font-medium text-xs">Submission Status</span>
            </div>

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-stone-400">
                <Loader className="w-3 h-3 animate-spin" />
                Loading submission data...
              </div>
            )}

            {loadError && (
              <div className="text-xs text-red-400 flex items-start gap-2">
                <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                {loadError}
              </div>
            )}

            {!isLoading && submissionData && (
              <div className="space-y-2 bg-[#0c1017] p-2 rounded-lg border border-[#202631]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-400">Submission Status:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      submissionData.status === "reviewed"
                        ? "bg-green-900/40 text-green-300"
                        : submissionData.status === "submitted"
                        ? "bg-blue-900/40 text-blue-300"
                        : "bg-yellow-900/40 text-yellow-300"
                    }`}
                  >
                    {submissionData.status}
                  </span>
                </div>

                {submissionData.submitted_at && (
                  <div className="text-xs text-stone-400">
                    <span className="text-stone-500">Submitted:</span> {new Date(submissionData.submitted_at).toLocaleDateString()}
                  </div>
                )}

                {evaluationData && (
                  <div className="pt-2 border-t border-[#202631]">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-stone-400">Score:</span>
                      <span className="text-amber-400 font-semibold">{evaluationData.score || "N/A"}</span>
                    </div>
                    {evaluationData.feedback && (
                      <div className="text-xs text-stone-300 bg-[#171d28] p-2 rounded mt-2 max-h-24 overflow-y-auto">
                        {evaluationData.feedback}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isLoading && !submissionData && !loadError && (
              <div className="text-xs text-stone-500 italic">
                No submission yet for this lesson.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
