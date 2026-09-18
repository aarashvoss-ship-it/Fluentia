"use client";

import React, { useState } from "react";
import { Mic, Send, Save, Award, CheckCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function SubmissionReviewPage() {
  const [rubricScores, setRubricScores] = useState({
    cadence: 4.5,
    grammar: 4.0,
    vocab: 4.5,
    fluency: 4.0,
  });

  const [feedbackText, setFeedbackText] = useState(
    "Excellent control of pace during the speaking attempt! You used 'cognitive friction' accurately. Priority focus for next session: work on second conditional accuracy."
  );

  const calculateOverallScore = () => {
    const values = Object.values(rubricScores);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return avg.toFixed(1);
  };

  return (
    <div className="min-h-screen bg-[#09131e] text-[#d4e4fa] p-6 lg:p-10">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto flex items-center justify-between border-b border-[#273647] pb-4 mb-8">
        <div className="flex items-center gap-3">
          <Link href="/instructor" className="p-2 bg-[#122131] border border-[#273647] rounded-lg hover:bg-[#273647] transition">
            <ArrowLeft className="w-4 h-4 text-white" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white">Submission Review Workspace</h1>
            <p className="text-xs text-slate-400">Selected student • Module 03 Submission (Speaking & Writing)</p>
          </div>
        </div>
        <span className="text-xs bg-[#ffc66b]/10 text-[#ffc66b] border border-[#ffc66b]/20 px-3 py-1 rounded-full font-mono">
          Wizard-of-Oz Review Mode
        </span>
      </div>

      {/* 2-Column Grid matching reference UI */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Student Submission Dossier (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Audio Player Card */}
          <div className="bg-[#122131] border border-[#273647] rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-2">Audio Submission: Eliminating Morning Choice Fatigue</h3>
            <p className="text-xs text-slate-400 mb-4 font-mono">Duration: 01:18 • Studio Mic Clarity (92%)</p>
            <div className="bg-[#09131e] p-4 rounded-lg border border-[#273647] flex items-center gap-4">
              <button className="w-10 h-10 rounded-full bg-[#ffc66b] text-[#432c00] flex items-center justify-center font-bold shadow">
                ▶
              </button>
              <div className="flex-1 h-3 bg-[#273647] rounded-full overflow-hidden">
                <div className="w-2/3 h-full bg-[#ffc66b]"></div>
              </div>
              <span className="text-xs text-[#7ed8ab] font-mono font-bold">1.0x</span>
            </div>
          </div>

          {/* Student Essay Viewport */}
          <div className="bg-[#122131] border border-[#273647] rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">Written Response (165 words)</h3>
            <div className="bg-[#09131e] p-4 rounded-lg border border-[#273647] font-sans text-sm leading-relaxed text-slate-200">
              "Building robust daily habits requires minimizing cognitive friction. When I structure my morning routine beforehand, I notice a compound interest effect on my focus..."
            </div>
          </div>
        </div>

        {/* Right Column: Teacher Evaluation & Feedback Editor (5 cols - Sticky) */}
        <div className="lg:col-span-5 bg-[#122131] border border-[#273647] rounded-xl p-6 space-y-6 lg:sticky lg:top-6">
          {/* Score Header */}
          <div className="flex items-center justify-between border-b border-[#273647] pb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-[#ffc66b]" /> Evaluation Rubric
            </h3>
            <div className="text-right">
              <span className="text-2xl font-black text-[#ffc66b]">{calculateOverallScore()}</span>
              <span className="text-xs text-slate-400"> / 5.0</span>
            </div>
          </div>

          {/* Sliders */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Pronunciation & Cadence</span>
                <span className="text-[#ffc66b] font-bold">{rubricScores.cadence}</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="0.5"
                value={rubricScores.cadence}
                onChange={(e) => setRubricScores({ ...rubricScores, cadence: parseFloat(e.target.value) })}
                className="w-full accent-[#ffc66b]"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Grammar & Structure</span>
                <span className="text-[#ffc66b] font-bold">{rubricScores.grammar}</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="0.5"
                value={rubricScores.grammar}
                onChange={(e) => setRubricScores({ ...rubricScores, grammar: parseFloat(e.target.value) })}
                className="w-full accent-[#ffc66b]"
              />
            </div>
          </div>

          {/* Feedback Editor Area */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Teacher Feedback & Action Plan</label>
            <textarea
              rows={5}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full bg-[#09131e] border border-[#273647] rounded-lg p-3 text-xs text-white focus:outline-none focus:border-[#ffc66b] leading-relaxed"
            />
          </div>

          {/* Submit Action */}
          <button
            type="button"
            className="w-full py-3 bg-[#ffc66b] hover:bg-[#e8a838] text-[#432c00] font-bold rounded-lg text-sm transition shadow-lg flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" /> Publish Evaluation to Student
          </button>
        </div>
      </div>
    </div>
  );
}
