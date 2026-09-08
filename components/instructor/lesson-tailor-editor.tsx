"use client";

import React, { useState } from "react";
import { STUDY_STEPS, StudyStepId, StrictStepContent } from "@/types/lesson";
import { ToggleLeft, ToggleRight, Eye, Layers } from "lucide-react";

interface LessonTailorEditorProps {
  content: StrictStepContent;
  onChange: (updatedContent: StrictStepContent) => void;
  onPreview?: () => void;
}

export function LessonTailorEditor({
  content,
  onChange,
  onPreview,
}: LessonTailorEditorProps) {
  const [activeStep, setActiveStep] = useState<StudyStepId>("warm_up");

  const toggleBlock = (step: StudyStepId, blockKey: string) => {
    const stepObj = (content[step] as Record<string, any>) || {};
    const currentBlock = stepObj[blockKey] || { enabled: true };
    const updated = {
      ...content,
      [step]: {
        ...stepObj,
        [blockKey]: {
          ...currentBlock,
          enabled: !currentBlock.enabled,
        },
      },
    };
    onChange(updated);
  };

  const updateTextValue = (
    step: StudyStepId,
    blockKey: string,
    field: string,
    value: string
  ) => {
    const stepObj = (content[step] as Record<string, any>) || {};
    const currentBlock = stepObj[blockKey] || { enabled: true };
    const updated = {
      ...content,
      [step]: {
        ...stepObj,
        [blockKey]: {
          ...currentBlock,
          [field]: value,
        },
      },
    };
    onChange(updated);
  };

  return (
    <div className="bg-[#182635] border border-[#273647] rounded-xl p-5 text-[#d4e4fa] shadow-sm">
      <div className="flex items-center justify-between mb-4 border-b border-[#273647] pb-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#ffc66b]" />
          Lesson Content Tailor
        </h2>
        {onPreview && (
          <button
            onClick={onPreview}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-[#122131] px-3 py-1.5 rounded-lg border border-[#273647] transition"
          >
            <Eye className="w-3.5 h-3.5" /> Preview Student View
          </button>
        )}
      </div>

      {/* Stepper Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 border-b border-[#273647]">
        {STUDY_STEPS.map((step) => {
          const isActive = activeStep === step.id;
          return (
            <button
              key={step.id}
              onClick={() => setActiveStep(step.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                isActive
                  ? "bg-[#ffc66b] text-[#122131]"
                  : "bg-[#122131] text-slate-400 hover:bg-[#1e2f42] hover:text-slate-200"
              }`}
            >
              <span className="opacity-60 font-mono">{step.stepNumber}.</span>
              {step.label}
            </button>
          );
        })}
      </div>

      {/* Block Content Editor */}
      <div className="space-y-4">
        {activeStep === "warm_up" && (
          <>
            <div className="bg-[#122131] p-4 rounded-lg border border-[#273647] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#ffc66b]">Warm-up Prompt Block</span>
                <button
                  type="button"
                  onClick={() => toggleBlock("warm_up", "prompt")}
                  className="text-slate-400 hover:text-white transition"
                >
                  {content.warmup?.prompt?.enabled !== false ? (
                    <ToggleRight className="w-6 h-6 text-[#7ed8ab]" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-slate-500" />
                  )}
                </button>
              </div>
              <textarea
                value={content.warmup?.prompt?.text || ""}
                onChange={(e) => updateTextValue("warm_up", "prompt", "text", e.target.value)}
                placeholder="Enter warm-up reflection prompt..."
                className="w-full bg-[#182635] border border-[#273647] rounded-md p-2.5 text-xs text-[#d4e4fa] focus:outline-none focus:border-[#ffc66b] h-20"
              />
            </div>

            <div className="bg-[#122131] p-4 rounded-lg border border-[#273647] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#ffc66b]">Reflection Question Block</span>
                <button
                  type="button"
                  onClick={() => toggleBlock("warm_up", "reflectionQuestion")}
                  className="text-slate-400 hover:text-white transition"
                >
                  {content.warmup?.reflectionQuestion?.enabled !== false ? (
                    <ToggleRight className="w-6 h-6 text-[#7ed8ab]" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-slate-500" />
                  )}
                </button>
              </div>
              <input
                type="text"
                value={content.warmup?.reflectionQuestion?.text || ""}
                onChange={(e) => updateTextValue("warm_up", "reflectionQuestion", "text", e.target.value)}
                placeholder="Enter reflection question..."
                className="w-full bg-[#182635] border border-[#273647] rounded-md p-2 text-xs text-[#d4e4fa] focus:outline-none focus:border-[#ffc66b]"
              />
            </div>
          </>
        )}

        {activeStep === "lesson" && (
          <div className="bg-[#122131] p-4 rounded-lg border border-[#273647] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#ffc66b]">Main Article Content</span>
              <button
                type="button"
                onClick={() => toggleBlock("lesson", "mainArticle")}
                className="text-slate-400 hover:text-white transition"
              >
                {content.lesson?.mainArticle?.enabled !== false ? (
                  <ToggleRight className="w-6 h-6 text-[#7ed8ab]" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-slate-500" />
                )}
              </button>
            </div>
            <textarea
              value={content.lesson?.mainArticle?.content || ""}
              onChange={(e) => updateTextValue("lesson", "mainArticle", "content", e.target.value)}
              placeholder="Write or edit the main lesson article..."
              className="w-full bg-[#182635] border border-[#273647] rounded-md p-3 text-xs text-[#d4e4fa] focus:outline-none focus:border-[#ffc66b] h-36 font-serif leading-relaxed"
            />
          </div>
        )}

        {["listening", "reading", "writing", "speaking", "results"].includes(activeStep) && (
          <div className="bg-[#122131] p-6 rounded-lg border border-[#273647] text-center text-slate-400 text-xs">
            Step content for <span className="text-[#ffc66b] font-medium">{activeStep}</span> is ready for tailoring.
          </div>
        )}
      </div>
    </div>
  );
}

export default LessonTailorEditor;
