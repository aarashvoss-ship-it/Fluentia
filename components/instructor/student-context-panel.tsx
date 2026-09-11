"use client";

import React from "react";
import { Target, AlertCircle, History, Sparkles } from "lucide-react";
import { StudentProfile } from "@/types/lesson";
import { FluentiaUser } from "@/lib/users";

interface StudentContextPanelProps {
  studentName?: string;
  profile?: StudentProfile;
  onUpdateProfile?: (profile: StudentProfile) => void;
  students?: Array<FluentiaUser & { profile: StudentProfile; token: string }>;
  selectedStudentToken?: string;
  onSelectStudent?: (student: FluentiaUser & { profile: StudentProfile; token: string }) => void;
}

export function StudentContextPanel({
  studentName = "Arash",
  profile,
  onUpdateProfile,
  students = [],
  selectedStudentToken,
  onSelectStudent,
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

      {students.length > 0 && (
        <label className="mt-4 block text-xs text-slate-400">
          Active student
          <select
            value={selectedStudentToken}
            onChange={(event) => {
              const nextStudent = students.find((student) => student.token === event.target.value);
              if (nextStudent) onSelectStudent?.(nextStudent);
            }}
            className="mt-1 w-full rounded-lg border border-[#202631] bg-[#0c1017] px-3 py-2 text-xs text-stone-200 outline-none focus:border-amber-500"
            aria-label="Select active student"
          >
            {students.map((student) => (
              <option key={student.token} value={student.token}>{student.name}</option>
            ))}
          </select>
        </label>
      )}

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
      </div>
    </div>
  );
}
