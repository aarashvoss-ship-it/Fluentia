"use client";

import { useState } from "react";
import { STUDY_STEPS, StrictStepContent, StudyStepId } from "@/types/lesson";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";

interface LessonTailorEditorProps {
  content: StrictStepContent;
  onChange: (updated: StrictStepContent) => void;
  onPreview?: () => void;
}

export function LessonTailorEditor({
  content,
  onChange,
  onPreview,
}: LessonTailorEditorProps) {
  const [activeStep, setActiveStep] = useState<StudyStepId>("warm_up");

  function toggleBlock(
    step: keyof StrictStepContent,
    field: string,
    enabled: boolean
  ) {
    const stepData = (content[step] as Record<string, unknown>) ?? {};
    const block = (stepData[field] as Record<string, unknown>) ?? {};
    onChange({
      ...content,
      [step]: {
        ...stepData,
        [field]: { ...block, enabled },
      },
    });
  }

  function updateTextValue(
    step: keyof StrictStepContent,
    field: string,
    value: string
  ) {
    const stepData = (content[step] as Record<string, unknown>) ?? {};
    const block = (stepData[field] as Record<string, unknown>) ?? {};
    onChange({
      ...content,
      [step]: {
        ...stepData,
        [field]: { ...block, text: value },
      },
    });
  }

  return (
    <div className="bg-[#1a1a18] border border-stone-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800">
        <h2 className="text-sm font-semibold text-stone-300 tracking-wide uppercase">
          Lesson Tailor Editor
        </h2>
        {onPreview && (
          <button
            onClick={onPreview}
            className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Eye size={14} />
            Preview
          </button>
        )}
      </div>

      <div className="flex gap-1 px-4 pt-4 pb-0 overflow-x-auto">
        {STUDY_STEPS.map((step) => (
          <button
            key={step.id}
            onClick={() => setActiveStep(step.id)}
            className={`shrink-0 px-3 py-1.5 rounded-t text-xs font-medium transition-colors ${
              activeStep === step.id
                ? "bg-stone-700 text-amber-400 border border-stone-600 border-b-stone-700"
                : "text-stone-500 hover:text-stone-300"
            }`}
          >
            {step.label}
          </button>
        ))}
      </div>

      <div className="p-5 border-t border-stone-800 space-y-4">
        {activeStep === "warm_up" && (
          <>
            <EditorBlock
              label="Prompt"
              enabled={content.warm_up?.prompt?.enabled ?? true}
              onToggle={(val) => toggleBlock("warm_up", "prompt", val)}
            >
              <textarea
                className="w-full bg-stone-900 text-stone-200 text-sm rounded-lg p-3 border border-stone-700 focus:border-amber-500 focus:outline-none resize-none min-h-[80px]"
                value={content.warm_up?.prompt?.text ?? ""}
                onChange={(e) =>
                  updateTextValue("warm_up", "prompt", e.target.value)
                }
                placeholder="Enter the warm-up prompt..."
              />
            </EditorBlock>

            <EditorBlock
              label="Reflection Question"
              enabled={content.warm_up?.reflectionQuestion?.enabled ?? true}
              onToggle={(val) =>
                toggleBlock("warm_up", "reflectionQuestion", val)
              }
            >
              <textarea
                className="w-full bg-stone-900 text-stone-200 text-sm rounded-lg p-3 border border-stone-700 focus:border-amber-500 focus:outline-none resize-none min-h-[80px]"
                value={content.warm_up?.reflectionQuestion?.text ?? ""}
                onChange={(e) =>
                  updateTextValue(
                    "warm_up",
                    "reflectionQuestion",
                    e.target.value
                  )
                }
                placeholder="Enter the reflection question..."
              />
            </EditorBlock>
          </>
        )}

        {activeStep === "lesson" && (
          <EditorBlock
            label="Main Article"
            enabled={content.lesson?.mainArticle?.enabled ?? true}
            onToggle={(val) => toggleBlock("lesson", "mainArticle", val)}
          >
            <textarea
              className="w-full bg-stone-900 text-stone-200 text-sm rounded-lg p-3 border border-stone-700 focus:border-amber-500 focus:outline-none resize-none min-h-[120px]"
              value={content.lesson?.mainArticle?.text ?? ""}
              onChange={(e) =>
                updateTextValue("lesson", "mainArticle", e.target.value)
              }
              placeholder="Enter the lesson article text..."
            />
          </EditorBlock>
        )}

        {activeStep === "reading" && (
          <EditorBlock
            label="Reading Article"
            enabled={
              (content.reading as { mainArticle?: { enabled?: boolean } })
                ?.mainArticle?.enabled ?? true
            }
            onToggle={(val) => toggleBlock("reading", "mainArticle", val)}
          >
            <textarea
              className="w-full bg-stone-900 text-stone-200 text-sm rounded-lg p-3 border border-stone-700 focus:border-amber-500 focus:outline-none resize-none min-h-[120px]"
              value={
                (
                  content.reading as {
                    mainArticle?: { text?: string };
                  }
                )?.mainArticle?.text ?? ""
              }
              onChange={(e) =>
                updateTextValue("reading", "mainArticle", e.target.value)
              }
              placeholder="Enter the reading article text..."
            />
          </EditorBlock>
        )}

        {!["warm_up", "lesson", "reading"].includes(activeStep) && (
          <p className="text-sm text-stone-500 italic py-4 text-center">
            Step content for{" "}
            <span className="text-stone-400 font-medium">{activeStep}</span> is
            ready for tailoring.
          </p>
        )}
      </div>
    </div>
  );
}

interface EditorBlockProps {
  label: string;
  enabled: boolean;
  onToggle: (val: boolean) => void;
  children: React.ReactNode;
}

function EditorBlock({
  label,
  enabled,
  onToggle,
  children,
}: EditorBlockProps) {
  return (
    <div
      className={`rounded-lg border transition-colors ${
        enabled ? "border-stone-700" : "border-stone-800 opacity-50"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-800">
        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
          {label}
        </span>
        <button
          onClick={() => onToggle(!enabled)}
          className={`flex items-center gap-1 text-xs transition-colors ${
            enabled
              ? "text-amber-400 hover:text-amber-300"
              : "text-stone-600 hover:text-stone-400"
          }`}
        >
          {enabled ? (
            <>
              <ChevronUp size={12} /> Hide
            </>
          ) : (
            <>
              <ChevronDown size={12} /> Show
            </>
          )}
        </button>
      </div>
      {enabled && <div className="p-3">{children}</div>}
    </div>
  );
}
