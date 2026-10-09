"use client";

import { useState } from "react";
import { ContentBlock, StrictStepContent, StudyStepId } from "@/types/lesson";
import { DynamicLucideIcon } from "@/components/shared/lucide-icon-picker";
import { WritingBlockRenderer } from "@/components/shared/writing-block";
import { WordCountedTextarea } from "@/components/shared/word-counted-textarea";
import { InteractiveVideoBlock } from "@/components/shared/interactive-video-block";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { FillInBlanksMarkdown } from "@/components/study-room/fill-in-blanks-markdown";
import { ExerciseQuestions } from "@/components/study-room/exercise-questions";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { AmbientMusicPlayer } from "@/components/study-room/ambient-music-player";
import { StudyRoomStageLayout } from "@/components/study-room/study-room-stage-layout";
import { Stepper } from "@/components/study-room/stepper";
import { HeroBanner } from "@/components/shared/hero-banner";
import { SidebarBlockCard } from "@/components/shared/sidebar-block-card";
import type { BannerPosition } from "@/components/instructor/banner-manager";
import { LearningSidebar } from "@/components/study-room/learning-sidebar";
import type { StudyHubResource } from "@/components/shared/study-hub-resource-card";
import type { StudentNote } from "@/types/lesson";

export type StudentPreviewStep = StudyStepId;
export type PreviewSidebarBlock = { id: string; title: string; body: string; icon?: string; parentMainBlockId?: string; imageUrl?: string; altText?: string };
export type PreviewSidebarBlocksByStep = Partial<Record<Exclude<StudyStepId, "results">, PreviewSidebarBlock[]>>;
export const STUDENT_PREVIEW_CHANNEL = "fluentia:student-live-preview";

export interface StudentPreviewSnapshot {
  content: StrictStepContent;
  sidebarBlocksByStep: PreviewSidebarBlocksByStep;
  studyHubResources: StudyHubResource[];
  step: StudentPreviewStep;
  title: string;
  subtitle: string;
  bannerUrl?: string;
  bannerPosition?: BannerPosition;
  bannerDimness?: number;
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
  studyHubResources?: StudyHubResource[];
  step: StudentPreviewStep;
  onStepChange: (step: StudentPreviewStep) => void;
  title: string;
  subtitle: string;
  bannerUrl?: string;
  bannerPosition?: BannerPosition;
  bannerDimness?: number;
  moduleNumber?: number;
  embedded?: boolean;
}

export function StudentStudyRoomPreview({
  content,
  sidebarBlocksByStep,
  studyHubResources = [],
  step,
  onStepChange,
  title,
  subtitle,
  bannerUrl,
  bannerPosition = { x: 50, y: 50 },
  bannerDimness = 20,
  moduleNumber,
  embedded = false,
}: StudentStudyRoomPreviewProps) {
  const [isStudyHubOpen, setIsStudyHubOpen] = useState(false);
  const [previewNotes, setPreviewNotes] = useState<StudentNote[]>([]);
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
          <div className="rounded-lg border border-amber-500/40 bg-background p-4 text-sm text-stone-400">Results - correct answers as the student will see after submission.</div>
          {Object.keys(answerKeys).length
            ? Object.entries(answerKeys).map(([id, answer]) => <div key={id} className="rounded-lg border border-border bg-background p-3"><p className="text-xs text-stone-500">{id}</p><p className="text-sm text-amber-400">{answer}</p></div>)
            : <p className="text-xs text-stone-500">No answer keys configured.</p>}
        </div>
      );
    }

    const stageItems = blocks.map((block, blockIndex) => {
          const attachedSidebarBlocks = sidebarBlocks.filter((candidate) => candidate.parentMainBlockId === block.id);
          const linkedSidebarBlocks = attachedSidebarBlocks.length > 0
            ? attachedSidebarBlocks
            : block.layoutMode === "inline-row" && (block.sidebarBlockId || block.alignNextTo)
              ? sidebarBlocks.filter((candidate) => candidate.id === (block.sidebarBlockId || block.alignNextTo))
              : [];
          const rowEmptyMode = block.rowEmptyMode || block.whenEmpty;
          const article = (
            <article key={block.id} className="flex h-auto min-h-fit flex-col overflow-visible rounded-xl border border-border bg-surface p-5 pb-8">
              {block.title && (
                <h3 className="mb-3 flex items-center gap-2 font-sans text-xl font-semibold text-stone-100">
                  {block.icon && <DynamicLucideIcon name={block.icon} className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />}
                  {block.title}
                </h3>
              )}
              {block.type === "text" && <><MarkdownContent value={block.body || ""} className="text-sm leading-relaxed text-stone-300" />{(block.hasStudentResponseInput === true || block.studentResponseConfig?.enabled === true) && <WordCountedTextarea value="" onChange={() => undefined} wordCountConfig={block.wordCountConfig} rows={6} placeholder="Write your response here..." readOnly className="mt-4 min-h-[140px] w-full resize-y rounded border border-border bg-surface p-3 text-sm text-stone-400" ariaLabel="Student response field preview" />}</>}
              {block.type === "image" && <>{block.imageUrl && <img src={block.imageUrl} alt={block.caption || block.title || "Lesson image"} className="max-h-72 w-full rounded-md object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}{block.caption && <p className="mt-2 text-xs text-stone-500">{block.caption}</p>}</>}
              {block.type === "audio" && block.audioUrl && <CustomAudioPlayer src={block.audioUrl} label={block.title || "Audio lesson"} />}
              {block.type === "video" && <><InteractiveVideoBlock videoUrl={block.videoUrl} title={block.title || "Lesson video"} transcript={block.transcript} />{block.show_reflection_prompt !== false && block.reflection_prompt_text?.trim() && <div className="mt-4 flex h-auto min-h-fit flex-col overflow-visible rounded-lg border border-amber-500/40 bg-amber-500/20 p-4 pb-6"><p className="text-sm font-semibold text-amber-400">Reflection Question</p><MarkdownContent value={block.reflection_prompt_text.trim()} className="mt-2 text-sm leading-relaxed text-stone-300" /><textarea rows={4} placeholder="Write your reflection here..." readOnly className="mt-3 w-full resize-y rounded border border-border bg-surface p-3 text-sm text-stone-400" aria-label="Reflection question response preview" /></div>}</>}
              {block.type === "resource" && block.resourceUrl && <a href={block.resourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/20 p-3 text-sm text-amber-400 hover:border-amber-500/40">Open document{block.description ? `: ${block.description}` : ""}</a>}
              {block.type === "fill-in-the-blanks" && <FillInBlanksMarkdown blockId={block.id} text={block.textWithBlanks} acceptableAnswers={block.acceptableAnswers} wordBank={block.wordBank} caseSensitive={block.caseSensitive} values={{}} readOnly className="text-sm leading-relaxed text-stone-300" />}
              {block.type === "question" && <ExerciseQuestions mode="interactive" questions={[{ id: block.id, type: block.question_type === "open_ended" ? "short_answer" : "multiple_choice", prompt: block.prompt || "", options: block.options, correct_answer: block.correct_answer, sample_answer: block.sample_answer }]} readOnly />}
              {block.type === "quiz" && <ExerciseQuestions mode="interactive" questions={block.questions} readOnly />}
              {block.type === "writing" && <WritingBlockRenderer block={block} isPreview />}
            </article>
          );

          return {
            id: block.id,
            layoutMode: block.layoutMode || "global",
            main: article,
            sidebar: blockIndex === 0 || linkedSidebarBlocks.length > 0 ? (
              <div className="w-full space-y-4">
                {blockIndex === 0 && topSidebarBlocks.map((sidebarItem) => (
                  <SidebarBlockCard key={sidebarItem.id} {...sidebarItem} />
                ))}
                {linkedSidebarBlocks.map((sidebarItem) => (
                  <SidebarBlockCard key={sidebarItem.id} {...sidebarItem} />
                ))}
              </div>
            ) : undefined,
            fullWidth: block.layoutMode === "inline-row" && linkedSidebarBlocks.length === 0 && rowEmptyMode === "full",
          };
        });
    return (
      <>
        <StudyRoomStageLayout items={stageItems} />
        {blocks.length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-sm text-stone-500">This step has no content blocks yet.</p>}
      </>
    );
  };

  return (
    <div className={`fluentia-study-room h-auto overflow-visible bg-background text-[#e8e7e4] ${embedded ? "min-h-full" : "min-h-screen"}`}>
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6">
        <HeroBanner imageUrl={bannerUrl} position={bannerPosition} dimness={bannerDimness}>
          <div className="space-y-2.5">
            <p className="w-fit rounded-md border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400 md:text-sm">English - Module {moduleNumber || 1}</p>
            <h1 className="text-3xl font-bold tracking-tight text-stone-100 md:text-4xl lg:text-[36px]">{title || "Untitled Lesson"}</h1>
            {subtitle && <p className="text-sm text-stone-300 opacity-90 md:text-base">{subtitle}</p>}
          </div>
        </HeroBanner>
        <div className="py-8">
          <header>
            <div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
              {content.ambientMusicUrl && <AmbientMusicPlayer src={content.ambientMusicUrl} />}
              <button type="button" onClick={() => setIsStudyHubOpen(true)} aria-expanded={isStudyHubOpen} className="rounded-md border border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20">Open Study Hub</button>
            </div>
            <div className="mt-8">
              <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#556078]">Your journey</p>
              <Stepper currentStep={step} completedSteps={[]} lockedSteps={[]} onStepClick={onStepChange} />
            </div>
          </header>
        </div>
        <div className="border-t border-border" />
        <main className="h-auto min-h-[560px] overflow-visible pb-16 pt-5">{renderStep()}</main>
      </div>
      <LearningSidebar
        open={isStudyHubOpen}
        previewResources={studyHubResources}
        words={[]}
        notes={previewNotes}
        onClose={() => setIsStudyHubOpen(false)}
        onSaveNote={(note) => setPreviewNotes((current) => current.length ? [note, ...current.slice(1)] : [note])}
        onRemoveWord={() => undefined}
      />
    </div>
  );
}
