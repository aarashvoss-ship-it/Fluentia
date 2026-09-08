"use client";

import React from "react";
import { Target, AlertCircle, History, Sparkles } from "lucide-react";
import { StudentProfile } from "@/types/lesson";

interface StudentContextPanelProps {
  studentName?: string;
  profile?: StudentProfile;
}

export function StudentContextPanel({
  studentName = "Arash",
  profile,
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

  return (
    <div className="bg-[#182635] border border-[#273647] rounded-xl p-5 shadow-sm text-[#d4e4fa]">
      <div className="flex items-start justify-between pb-4 border-b border-[#273647]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#122131] border border-[#ffc66b] flex items-center justify-center font-bold text-lg text-[#ffc66b]">
            {displayProfile.fullName.charAt(0)}
          </div>
          <div>
            <h2 className="font-semibold text-lg text-white">{displayProfile.fullName}</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-[#122131] text-[#7ed8ab] border border-[#273647] font-medium">
              {displayProfile.level}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Attendance</div>
          <div className="text-sm font-semibold text-[#7ed8ab]">{displayProfile.attendanceRate}%</div>
        </div>
      </div>

      <div className="mt-4 space-y-4 text-xs">
        <div>
          <div className="text-slate-400 font-medium flex items-center gap-1.5 mb-1">
            <Target className="w-3.5 h-3.5 text-[#ffc66b]" /> Core Goal
          </div>
          <p className="bg-[#122131] p-2.5 rounded-lg border border-[#273647] text-slate-200">
            {displayProfile.targetGoal}
          </p>
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
            <History className="w-3.5 h-3.5 text-indigo-400" /> Instructor Notes
          </div>
          <p className="bg-[#122131] p-2.5 rounded-lg border border-[#273647] text-slate-300 italic font-serif">
            "{displayProfile.teacherNotes}"
          </p>
        </div>

        <div className="pt-2 border-t border-[#273647] flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1 text-[#7ed8ab]">
            <Sparkles className="w-3 h-3" /> Personalized Mode Active
          </span>
          <span>{displayProfile.completedModulesCount} Modules Done</span>
        </div>
      </div>
    </div>
  );
}
