"use client";

import { ContentBlock, StrictStepContent, StudyStepId } from "@/types/lesson";
import { DynamicLucideIcon } from "@/components/shared/lucide-icon-picker";
import { WritingBlockRenderer } from "@/components/shared/writing-block";
import { InteractiveVideoBlock } from "@/components/shared/interactive-video-block";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { FillInBlanksMarkdown } from "@/components/study-room/fill-in-blanks-markdown";
import { ExerciseQuestions } from "@/components/study-room/exercise-questions";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { AmbientMusicPlayer } from "@/components/study-room/ambient-music-player";
import { StudyRoomBlockRow } from "@/components/study-room/study-room-block-row";
import { Stepper } from "@/components/study-room/stepper";
import type { BannerPosition } from "@/components/instructor/banner-manager";

export type StudentPreviewStep = StudyStepId;
export type PreviewSidebarBlock = { id: string; title: string; body: string; icon?: string; parentMainBlockId?: string };
export type PreviewSidebarBlocksByStep = Partial<Record<Exclude<StudyStepId, "results">, PreviewSidebarBlock[]>>;
export const STUDENT_PREVIEW_CHANNEL = "fluentia:student-live-preview";

export interface StudentPreviewSnapshot {
  content: StrictStepContent;
  sidebarBlocksByStep: PreviewSidebarBlocksByStep;
  step: StudentPreviewStep;
  title: string;
  subtitle: string;
  bannerUrl?: string;
  bannerPosition?: BannerPosition;
  moduleNumber?: number;
}

const PREVIEW_STEPS = [
  ["warm_up", "Warm-up"],
  ["lesson", "Lesson"],
  ["listening", "Listening"],
  ["reading", "Reading"],
  ["writing", "Writing"],
  ["speaking", "Speaking"],
  ["results", "Results"],
] as const;

export interface StudentStudyRoomPreviewProps {
  content: StrictStepContent;
  sidebarBlocksByStep: PreviewSidebarBlocksByStep;
  step: StudentPreviewStep;
  onStepChange: (step: StudentPreviewStep) => void;
  title: string;
  subtitle: string;
  bannerUrl?: string;
  bannerPosition?: BannerPosition;
  moduleNumber?: number;
  embedded?: boolean;
}

export function StudentStudyRoomPreview({
  content,
  sidebarBlocksByStep,
  step,
  onStepChange,
  title,
  subtitle,
  bannerUrl,
  bannerPosition = { x: 50, y: 50 },
  moduleNumber,
  embedded = false,
}: StudentStudyRoomPreviewProps) {
  const stepContent = step === "results" ? undefined : content[step] as { blocks?: ContentBlock[] } | undefined;
  const blocks = step === "results"
    ? []
    : (stepContent?.blocks || []).filter((block) => block.is_active !== false && block.enabled !== false);
  const sidebarBlocks = step === "results" ? [] : sidebarBlocksByStep[step] || [];
  const linkedSidebarIds = new Set([
    ...sidebarBlocks.filter((block) => block.parentMainBlockId).map((block) => block.id),
    ...blocks
      .filter((block) => block.layoutMode === "inline-row")
      .map((block) => block.sidebarBlockId || block.alignNextTo)
      .filter((id): id is string => Boolean(id)),
  ]);
  const topSidebarBlocks = sidebarBlocks.filter((block) => !linkedSidebarIds.has(block.id));

  const renderStep = () => {
    if (step === "results") {
      const answerKeys: Record<string, string> = {};
      for (const stepId of ["warm_up", "lesson", "listening", "reading"] as const) {
        const stepBlocks = ((content[stepId] as { blocks?: ContentBlock[] } | undefined)?.blocks || []);
        stepBlocks.forEach((block) => {
          if (block.type === "question" && block.correct_answer) answerKeys[block.id] = block.correct_answer;
          if (block.type === "quiz") block.questions.forEach((question) => {
            const answer = question.correct_answer || question.correctAnswer || "";
            if (answer) answerKeys[question.id] = answer;
          });
        });
      }
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-500/40 bg-[#0c1017] p-4 text-sm text-stone-400">Results - correct answers as the student will see after submission.</div>
          {Object.keys(answerKeys).length
            ? Object.entries(answerKeys).map(([id, answer]) => <div key={id} className="rounded-lg border border-[#293343] bg-[#0c1017] p-3"><p className="text-xs text-stone-500">{id}</p><p className="text-sm text-amber-400">{answer}</p></div>)
            : <p className="text-xs text-stone-500">No answer keys configured.</p>}
        </div>
      );
    }

    return (
      <div className="w-full space-y-6">
        {blocks.map((block, blockIndex) => {
          const sidebarBlock = sidebarBlocks.find((candidate) => candidate.parentMainBlockId === block.id)
            || (block.layoutMode === "inline-row" && (block.sidebarBlockId || block.alignNextTo)
              ? sidebarBlocks.find((candidate) => candidate.id === (block.sidebarBlockId || block.alignNextTo))
              : undefined);
          const rowEmptyMode = block.rowEmptyMode || block.whenEmpty;
          const expandsInlineRow = block.layoutMode === "inline-row" && !sidebarBlock && rowEmptyMode === "full";
          const article = (
            <article key={block.id} className="rounded-xl border border-[#202631] bg-[#121721] p-5">
              {block.title && (
                <h3 className="mb-3 flex items-center gap-2 font-sans text-xl font-semibold text-stone-100">
                  {block.icon && <DynamicLucideIcon name={block.icon} className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />}
                  {block.title}
                </h3>
              )}
              {block.type === "text" && <><MarkdownContent value={block.body || ""} className="text-sm leading-relaxed text-stone-300" />{block.hasStudentResponseInput === true && <textarea rows={6} placeholder="Write your response here..." readOnly className="mt-4 min-h-[140px] w-full resize-y rounded border border-[#394252] bg-[#171d28] p-3 text-sm text-stone-400" aria-label="Student response field preview" />}</>}
              {block.type === "image" && <>{block.imageUrl && <img src={block.imageUrl} alt={block.caption || block.title || "Lesson image"} className="max-h-72 w-full rounded-md object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}{block.caption && <p className="mt-2 text-xs text-stone-500">{block.caption}</p>}</>}
              {block.type === "audio" && block.audioUrl && <CustomAudioPlayer src={block.audioUrl} label={block.title || "Audio lesson"} />}
              {block.type === "video" && <><InteractiveVideoBlock videoUrl={block.videoUrl} title={block.title || "Lesson video"} transcript={block.transcript} />{block.show_reflection_prompt !== false && block.reflection_prompt_text?.trim() && <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/20 p-4"><p className="text-sm font-semibold text-amber-400">Reflection Question</p><p className="mt-2 text-sm leading-relaxed text-stone-300">{block.reflection_prompt_text.trim()}</p><textarea rows={4} placeholder="Write your reflection here..." readOnly className="mt-3 w-full resize-y rounded border border-[#394252] bg-[#171d28] p-3 text-sm text-stone-400" aria-label="Reflection question response preview" /></div>}</>}
              {block.type === "resource" && block.resourceUrl && <a href={block.resourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/20 p-3 text-sm text-amber-400 hover:border-amber-500/40">Open document{block.description ? `: ${block.description}` : ""}</a>}
              {block.type === "fill-in-the-blanks" && <FillInBlanksMarkdown blockId={block.id} text={block.textWithBlanks} acceptableAnswers={block.acceptableAnswers} wordBank={block.wordBank} caseSensitive={block.caseSensitive} values={{}} readOnly className="text-sm leading-relaxed text-stone-300" />}
              {block.type === "question" && <ExerciseQuestions questions={[{ id: block.id, type: block.question_type === "open_ended" ? "short_answer" : "multiple_choice", prompt: block.prompt || "", options: block.options, correct_answer: block.correct_answer, sample_answer: block.sample_answer }]} readOnly />}
              {block.type === "quiz" && <ExerciseQuestions questions={block.questions} readOnly />}
              {block.type === "writing" && <WritingBlockRenderer block={block} isPreview />}
            </article>
          );

          return (
            <StudyRoomBlockRow
              key={block.id}
              fullWidth={expandsInlineRow}
              sidebar={(
                <div className="h-full w-full space-y-4">
                  {blockIndex === 0 && topSidebarBlocks.map((sidebarItem) => (
                    <div key={sidebarItem.id} className="rounded-xl border border-[#202631] bg-[#121721] p-4">
                      <p className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                        {sidebarItem.icon && <DynamicLucideIcon name={sidebarItem.icon} className="h-4 w-4" aria-hidden="true" />}
                        {sidebarItem.title}
                      </p>
                      <MarkdownContent value={sidebarItem.body || ""} className="mt-2 text-sm leading-relaxed text-stone-300 [&_strong]:font-semibold [&_strong]:text-amber-400" />
                    </div>
                  ))}
                  {sidebarBlock && <div className="rounded-xl border border-[#202631] bg-[#121721] p-4"><p className="flex items-center gap-2 text-xs font-semibold text-amber-400">{sidebarBlock.icon && <DynamicLucideIcon name={sidebarBlock.icon} className="h-4 w-4" aria-hidden="true" />}{sidebarBlock.title}</p><MarkdownContent value={sidebarBlock.body || ""} className="mt-2 text-sm leading-relaxed text-stone-300 [&_strong]:font-semibold [&_strong]:text-amber-400" /></div>}
                </div>
              )}
            >
              {article}
            </StudyRoomBlockRow>
          );
        })}
        {blocks.length === 0 && <p className="rounded-lg border border-dashed border-[#394252] p-6 text-sm text-stone-500">This step has no content blocks yet.</p>}
      </div>
    );
  };

  return (
    <div className={`fluentia-study-room bg-[#0c1017] text-[#e8e7e4] ${embedded ? "h-full min-h-full" : "min-h-screen"}`}>
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6">
        <header className="overflow-hidden rounded-xl border border-[#202631] bg-[#121721]">
          <div className="relative flex h-[220px] w-full items-center overflow-hidden bg-slate-950 sm:h-[240px] md:h-[260px]">
            {bannerUrl ? <img src={bannerUrl} alt="" style={{ objectPosition: `${bannerPosition.x}% ${bannerPosition.y}%` }} className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-slate-950" aria-hidden="true" />}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-transparent" aria-hidden="true" />
            <div className="relative z-10 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">English - Module {moduleNumber || 1}</p>
              <h1 className="mt-2 text-2xl font-bold text-stone-100">{title || "Untitled Lesson"}</h1>
              {subtitle && <p className="mt-2 text-sm text-stone-300">{subtitle}</p>}
            </div>
          </div>
          {content.ambientMusicUrl && <div className="border-t border-[#293343] p-4"><AmbientMusicPlayer src={content.ambientMusicUrl} /></div>}
          <div className="border-t border-[#293343] px-4 py-4"><Stepper currentStep={step} completedSteps={[]} lockedSteps={[]} onStepClick={onStepChange} /></div>
        </header>
        <main className="min-h-[560px] py-5">{renderStep()}</main>
      </div>
    </div>
  );
}
