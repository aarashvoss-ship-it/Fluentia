"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Grid3X3, Image, List, MoreVertical, Pencil, Plus, Search, Trash2, X, Lightbulb, UploadCloud } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { StudentContextPanel } from "@/components/instructor/student-context-panel";
import { LessonTailorEditor } from "@/components/instructor/lesson-tailor-editor";
import { InstructorBannerManager, type BannerPosition } from "@/components/instructor/banner-manager";
import { normalizeBannerDimness } from "@/lib/banner-position";
import { SubmissionEvaluator, FeedbackPayload } from "@/components/instructor/submission-evaluator";
import type { UnifiedReportStage } from "@/components/shared/unified-report-card";
import { ContentBlock, LessonEvaluation, StrictStepContent, StudentProfile, StudentSubmission } from "@/types/lesson";
import { assignLessonToAllActiveStudents, assignLessonToStudent, createLesson, deleteLesson, getLessons, publishLessonAndAssign, setLessonAssignments, unassignLesson, updateLesson, type LessonTags, type LessonWithVersion } from "@/lib/lessons";
import { PublishedLessonState } from "@/lib/lesson-store";
import { deduplicateStudents, StudentUser } from "@/lib/users";
import { FLUENTIA_DATA_UPDATED_EVENT, saveInstructorFeedback } from "@/services/storage-service";
import { AccessCard } from "@/components/access/access-card";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { ExerciseQuestions } from "@/components/study-room/exercise-questions";
import { WritingBlockRenderer } from "@/components/shared/writing-block";
import { DataTableResource, getDataTableResourceTitle, isDataTableResourceTitle } from "@/components/shared/data-table-resource";
import { InteractiveVideoBlock } from "@/components/shared/interactive-video-block";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { Stepper } from "@/components/study-room/stepper";
import { StudyRoomBlockRow } from "@/components/study-room/study-room-block-row";
import { parseInteractiveTranscript } from "@/lib/transcripts";
import { getQuizQuestionPrompt, parseFillInBlanks } from "@/lib/fill-in-blanks";
import { AmbientMusicPlayer } from "@/components/study-room/ambient-music-player";
import { getStudentDirectory, getStudentProfile, normalizeStudentLevel, saveStudentProfile, STUDENT_CEFR_LEVELS, updateStudentTargetLevel, type StudentCefrLevel } from "@/lib/student-profiles";
import { getInstructorDirectory, type InstructorDirectoryEntry, type InstructorStatus } from "@/lib/instructors";
import { MusicLibraryManager } from "@/components/instructor/music-library-manager";
import { InstructorChatWidget } from "@/components/instructor/instructor-chat-widget";
import { useLessonEditorStore } from "@/lib/lesson-editor-store";
import { Tooltip } from "@/components/shared/tooltip";
import { DisplaySettingsControl } from "@/components/shared/display-settings";
import { TiptapEditor } from "@/components/shared/tiptap-editor";
import { DynamicLucideIcon, LucideIconPicker } from "@/components/shared/lucide-icon-picker";
import { SidebarBlockCard } from "@/components/shared/sidebar-block-card";
import { StudentStudyRoomPreview, STUDENT_PREVIEW_CHANNEL, type StudentPreviewSnapshot, type StudentPreviewStep } from "@/components/instructor/student-study-room-preview";

interface InstructorWorkstationProps {
  instructorId: string;
  lessonSlug: string;
}

function resizeTextareaToContent(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function LessonMetadataDisclosure({
  lessonId,
  lessonTitle,
  level,
  tags,
  expanded,
  compact = false,
  onToggle,
}: {
  lessonId: string;
  lessonTitle: string;
  level: string;
  tags: { label: string; className: string }[];
  expanded: boolean;
  compact?: boolean;
  onToggle: () => void;
}) {
  const disclosureId = `lesson-tags-${lessonId}`;

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`${compact ? "rounded px-1.5" : "rounded-full px-2"} shrink-0 bg-amber-500/20 py-1 text-[10px] text-amber-400`}>{level}</span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={disclosureId}
          aria-label={`${expanded ? "Hide" : "Show"} tags for ${lessonTitle}`}
          className="inline-flex min-w-0 cursor-pointer items-center gap-1 text-xs text-slate-400 transition-colors hover:text-amber-400"
        >
          <span className="truncate">{expanded ? "Hide tags" : `+${tags.length} tags`}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>
      <div
        id={disclosureId}
        aria-hidden={!expanded}
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-wrap gap-1.5 pt-2">
            {tags.map((tag, index) => (
              <span key={`${tag.label}-${index}`} className={`${tag.className} ${compact ? "rounded px-1.5" : "rounded-full px-2"} py-1 text-[10px]`}>
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type SidebarBlock = { id: string; title: string; body: string; icon?: string; parentMainBlockId?: string; imageUrl?: string; altText?: string };
type SidebarBlocksByStep = Partial<Record<"warm_up" | "lesson" | "listening" | "reading" | "writing" | "speaking", SidebarBlock[]>>;

const SIDEBAR_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const SIDEBAR_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function StepSidebarEditorPanel({
  sidebarStep,
  setSidebarStep,
  sidebarBlocksByStep,
  setSidebarBlocksByStep,
  mainBlocks,
}: {
  sidebarStep: keyof SidebarBlocksByStep;
  setSidebarStep: (step: keyof SidebarBlocksByStep) => void;
  sidebarBlocksByStep: SidebarBlocksByStep;
  setSidebarBlocksByStep: React.Dispatch<React.SetStateAction<SidebarBlocksByStep>>;
  mainBlocks: ContentBlock[];
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [imageUploadStatus, setImageUploadStatus] = useState<Record<string, string>>({});
  const contentId = "step-sidebar-editor-content";
  const updateSidebarBlock = (blockId: string, patch: Partial<SidebarBlock>) => {
    setSidebarBlocksByStep((current) => ({
      ...current,
      [sidebarStep]: (current[sidebarStep] || []).map((item) => item.id === blockId ? { ...item, ...patch } : item),
    }));
  };
  const uploadSidebarImage = async (block: SidebarBlock, file?: File) => {
    if (!file) return;
    if (!SIDEBAR_IMAGE_TYPES.has(file.type)) {
      setImageUploadStatus((current) => ({ ...current, [block.id]: "Choose a PNG, JPG, or WebP image." }));
      return;
    }
    if (file.size > SIDEBAR_IMAGE_MAX_SIZE) {
      setImageUploadStatus((current) => ({ ...current, [block.id]: "Sidebar images must be 5 MB or smaller." }));
      return;
    }
    setImageUploadStatus((current) => ({ ...current, [block.id]: "Uploading image..." }));
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `sidebar-images/${crypto.randomUUID()}-${safeName}`;
    try {
      const { error } = await supabase.storage.from("lesson-assets").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("lesson-assets").getPublicUrl(path);
      if (!data.publicUrl) throw new Error("Supabase did not return a public image URL.");
      updateSidebarBlock(block.id, { imageUrl: data.publicUrl });
      setImageUploadStatus((current) => ({ ...current, [block.id]: "Image uploaded." }));
    } catch (error) {
      console.error("Sidebar image upload failed:", error);
      const message = error instanceof Error && error.message ? error.message : "Check the lesson-assets bucket permissions and try again.";
      setImageUploadStatus((current) => ({ ...current, [block.id]: `Upload failed: ${message}` }));
    }
  };

  return (
    <section className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`} aria-hidden="true" />
          <h3 className="font-sans text-xl font-semibold text-stone-100">Step Sidebar</h3>
        </button>
        <button
          type="button"
          onClick={() => setSidebarBlocksByStep((current) => ({
            ...current,
            [sidebarStep]: [...(current[sidebarStep] || []), { id: `sidebar-${Date.now()}`, title: "Sidebar note", body: "" }],
          }))}
          className="inline-flex min-h-9 items-center gap-1.5 rounded border border-amber-500/40 bg-[#0c1017] px-3 text-xs font-normal text-stone-200 transition hover:border-amber-500/40"
        >
          <Plus className="h-3.5 w-3.5" /> Add Block
        </button>
      </div>
      <div
        id={contentId}
        aria-hidden={isCollapsed}
        inert={isCollapsed}
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: isCollapsed ? "0fr" : "1fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <label className="mt-3 block text-xs text-stone-500">
        Editing step
        <select value={sidebarStep} onChange={(event) => setSidebarStep(event.target.value as keyof SidebarBlocksByStep)} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-stone-200 [color-scheme:dark]" aria-label="Sidebar step">
          <option value="warm_up">Warm-up</option>
          <option value="lesson">Lesson</option>
          <option value="listening">Listening</option>
          <option value="reading">Reading</option>
          <option value="writing">Writing</option>
          <option value="speaking">Speaking</option>
        </select>
          </label>
          <div className="mt-4 space-y-3">
        {(sidebarBlocksByStep[sidebarStep] || []).map((block) => (
          <div key={block.id} className="space-y-3 rounded-md border border-[#202631] bg-[#171d28] p-3">
            <div className="flex items-center gap-2">
              <input
                value={block.title}
                onChange={(event) => setSidebarBlocksByStep((current) => ({
                  ...current,
                  [sidebarStep]: (current[sidebarStep] || []).map((item) => item.id === block.id ? { ...item, title: event.target.value } : item),
                }))}
                className="h-9 min-w-0 flex-1 rounded border border-[#394252] bg-[#0c1017] px-2.5 text-xs font-semibold text-stone-200 outline-none focus:border-amber-500/40"
                aria-label="Sidebar block title"
              />
              <Tooltip content="Delete sidebar block">
              <button
                type="button"
                onClick={() => setSidebarBlocksByStep((current) => ({
                  ...current,
                  [sidebarStep]: (current[sidebarStep] || []).filter((item) => item.id !== block.id),
                }))}
                aria-label={`Delete ${block.title}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#394252] text-stone-400 transition hover:border-red-500/60 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              </Tooltip>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#29303c] bg-[#0c1017]/60 px-3 py-2">
              <span className="text-xs font-medium text-stone-300">Block Icon</span>
              <LucideIconPicker
                value={block.icon || ""}
                triggerLabel="Select Icon"
                onChange={(icon) => setSidebarBlocksByStep((current) => ({
                  ...current,
                  [sidebarStep]: (current[sidebarStep] || []).map((item) => item.id === block.id ? { ...item, icon } : item),
                }))}
              />
            </div>
            <div className="space-y-3 rounded-md border border-[#29303c] bg-[#0c1017]/40 p-3">
              <p className="text-xs font-medium text-stone-300">Image (Optional)</p>
              <label className="block text-[11px] text-stone-500">
                Image URL
                <input
                  type="url"
                  value={block.imageUrl || ""}
                  onChange={(event) => {
                    updateSidebarBlock(block.id, { imageUrl: event.target.value });
                    setImageUploadStatus((current) => ({ ...current, [block.id]: "" }));
                  }}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1 w-full rounded border border-[#394252] bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                  aria-label={`Image URL for ${block.title || "sidebar block"}`}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-[#394252] px-3 py-2 text-xs text-stone-300 transition hover:border-amber-500/40 hover:text-amber-400">
                <Image className="h-4 w-4" aria-hidden="true" />
                Upload Image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label={`Upload sidebar image for ${block.title || "sidebar block"}`}
                  onChange={(event) => {
                    void uploadSidebarImage(block, event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {imageUploadStatus[block.id] && <p className="text-[11px] text-stone-400" role="status">{imageUploadStatus[block.id]}</p>}
              <label className="block text-[11px] text-stone-500">
                Alt Text / Caption (Optional)
                <input
                  value={block.altText || ""}
                  onChange={(event) => updateSidebarBlock(block.id, { altText: event.target.value })}
                  placeholder="Describe the image for students"
                  className="mt-1 w-full rounded border border-[#394252] bg-[#171d28] p-2 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                  aria-label={`Image alt text or caption for ${block.title || "sidebar block"}`}
                />
              </label>
              {block.imageUrl?.trim() && (
                <figure className="overflow-hidden rounded-lg border border-[#29303c] bg-[#0c1017]">
                  <img
                    src={block.imageUrl}
                    alt={block.altText || ""}
                    loading="lazy"
                    onError={(event) => { event.currentTarget.style.display = "none"; }}
                    className="aspect-[4/3] w-full object-cover transition-opacity duration-300"
                  />
                  {block.altText?.trim() && <figcaption className="px-2.5 py-2 text-[11px] leading-relaxed text-stone-500">{block.altText}</figcaption>}
                </figure>
              )}
            </div>
            <label className="block text-[11px] text-stone-500">
              Align Next To (Main Block)
              <select
                value={block.parentMainBlockId || ""}
                onChange={(event) => setSidebarBlocksByStep((current) => ({
                  ...current,
                  [sidebarStep]: (current[sidebarStep] || []).map((item) => item.id === block.id ? { ...item, parentMainBlockId: event.target.value || undefined } : item),
                }))}
                className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-stone-200 [color-scheme:dark] focus:border-amber-500/40"
                aria-label={`Align ${block.title || "sidebar block"} next to main block`}
              >
                <option value="">Top of Sidebar (Default Unlinked)</option>
                {mainBlocks.map((mainBlock, mainIndex) => <option key={mainBlock.id} value={mainBlock.id}>{mainIndex + 1}. {mainBlock.title || `${mainBlock.type} block`}</option>)}
              </select>
            </label>
            <TiptapEditor
              value={block.body}
              onChange={(body) => updateSidebarBlock(block.id, { body })}
              placeholder="Start typing sidebar content or use formatting options..."
              ariaLabel={`Sidebar content for ${block.title || "sidebar block"}`}
              compact
              wrapToolbar
            />
          </div>
        ))}
        {(sidebarBlocksByStep[sidebarStep] || []).length === 0 && <p className="rounded-md border border-dashed border-[#394252] p-4 text-xs text-stone-500">No sidebar blocks for this step.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

type AddStudentDraft = {
  fullName: string;
  email: string;
  currentLevel: StudentCefrLevel | "";
  assignedInstructor: string;
  focusWeaknesses: string;
  coreGoal: string;
  dashboardNote: string;
};
type AddInstructorDraft = {
  fullName: string;
  email: string;
  specialization: string;
  status: InstructorStatus;
  bio: string;
};
const EMPTY_ADD_STUDENT_DRAFT: AddStudentDraft = {
  fullName: "",
  email: "",
  currentLevel: "",
  assignedInstructor: "",
  focusWeaknesses: "",
  coreGoal: "",
  dashboardNote: "",
};
const EMPTY_ADD_INSTRUCTOR_DRAFT: AddInstructorDraft = {
  fullName: "",
  email: "",
  specialization: "",
  status: "active",
  bio: "",
};

function normalizeInstructorRecord(value: unknown, assignedCount = 0): InstructorDirectoryEntry {
  const record = value as Record<string, unknown>;
  return {
    id: typeof record.id === "string" ? record.id : "",
    name: typeof record.name === "string" ? record.name : "",
    email: typeof record.email === "string" ? record.email : "",
    slug: typeof record.slug === "string" ? record.slug : "",
    token: typeof record.token === "string" ? record.token : "",
    specialization: typeof record.specialization === "string" ? record.specialization : "",
    status: record.status === "on_leave" ? "on_leave" : "active",
    maxStudentCapacity: Number.isFinite(record.max_student_capacity) ? Number(record.max_student_capacity) : 20,
    assignedCount,
    bio: typeof record.bio === "string" ? record.bio : "",
    createdAt: typeof record.created_at === "string" ? record.created_at : "",
    updatedAt: typeof record.updated_at === "string" ? record.updated_at : "",
  };
}

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const EMPTY_LESSON_TAGS: LessonTags = { domain: "", skill_focus: "", practice_type: "", custom: [] };

function normalizeCefrLevel(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return CEFR_LEVELS.includes(normalized as (typeof CEFR_LEVELS)[number]) ? normalized : "B1";
}

function normalizeLessonTags(value: unknown, content: Record<string, any> = {}): LessonTags {
  const embeddedTags = content.tags && typeof content.tags === "object" && !Array.isArray(content.tags)
    ? content.tags as Record<string, unknown>
    : {};
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : embeddedTags;
  const custom = Array.isArray(source.custom) ? source.custom : Array.isArray(source.custom_tags) ? source.custom_tags : [];
  const stringValue = (candidate: unknown, fallback: unknown) => typeof candidate === "string" ? candidate : typeof fallback === "string" ? fallback : "";
  return {
    domain: stringValue(source.domain, content.domain || content.topicDomain),
    skill_focus: stringValue(source.skill_focus, content.skill_focus || content.skillFocus || content.primarySkill),
    practice_type: stringValue(source.practice_type, content.practice_type || content.practiceType),
    custom: custom.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean),
  };
}

function normalizeBannerPosition(value: unknown): BannerPosition {
  if (typeof value === "number" && Number.isFinite(value)) {
    const y = Math.max(0, Math.min(100, value));
    return { x: 50, y };
  }
  if (!value || typeof value !== "object") return { x: 50, y: 50 };
  const position = value as { x?: unknown; y?: unknown };
  return {
    x: typeof position.x === "number" && Number.isFinite(position.x) ? Math.max(0, Math.min(100, position.x)) : 50,
    y: typeof position.y === "number" && Number.isFinite(position.y) ? Math.max(0, Math.min(100, position.y)) : 50,
  };
}

function parseCustomLessonTags(value: string) {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

const SIDEBAR_STEP_KEYS = ["warm_up", "lesson", "listening", "reading", "writing", "speaking"] as const;

function normalizeSidebarBlocksByStep(raw: unknown): SidebarBlocksByStep {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: SidebarBlocksByStep = {};
  for (const key of SIDEBAR_STEP_KEYS) {
    const value = source[key];
    if (!Array.isArray(value)) continue;
    const blocks: SidebarBlock[] = value
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
      .map((item, index) => ({
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `sidebar-${key}-${Date.now()}-${index}`,
        title: typeof item.title === "string" ? item.title : typeof item.name === "string" ? item.name : "Sidebar note",
        body: typeof item.body === "string" ? item.body : typeof item.text === "string" ? item.text : "",
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
        altText: typeof item.altText === "string" ? item.altText : undefined,
        icon: typeof item.icon === "string" ? item.icon : undefined,
        parentMainBlockId: typeof item.parentMainBlockId === "string" && item.parentMainBlockId.trim() ? item.parentMainBlockId.trim() : undefined,
      }));
    if (blocks.length) out[key] = blocks;
  }
  return out;
}

function cloneSidebarBlocksByStep(blocks: SidebarBlocksByStep): SidebarBlocksByStep {
  const out: SidebarBlocksByStep = {};
  for (const key of SIDEBAR_STEP_KEYS) {
    const list = blocks[key];
    if (list?.length) out[key] = list.map((block) => ({ ...block }));
  }
  return out;
}

type LessonResource = { id: string; title: string; url: string; type: "PDF" | "Article" | "Video" };
type StudentResourceType = "note" | "reading" | "flashcard" | "flashcards" | "quiz" | "audio" | "data_table" | "file" | "image" | "video";
type ResourceEditorType = Exclude<StudentResourceType, "flashcards">;
type FlashcardItem = {
  id?: string;
  front: string;
  back: string;
  explanation?: string;
};
type StudentResourceEntry = {
  id: string;
  student_id: string;
  student_token: string;
  lesson_id: string | null;
  type?: StudentResourceType;
  resource_type: StudentResourceType;
  title: string;
  body?: string | null;
  link_url?: string | null;
  question?: string | null;
  answer?: string | null;
  explanation?: string | null;
  cards?: FlashcardItem[] | null;
  original_filename?: string | null;
  media_type?: string | null;
  storage_path?: string | null;
  is_external_url?: boolean;
  created_at?: string;
  updated_at?: string;
};

type PendingReviewSubmission = {
  id: string;
  lessonId: string;
  studentId: string;
  submittedAt: string | null;
  submission: StudentSubmission;
};

type InstructorReviewStageId = "warm_up" | "lesson" | "listening" | "reading" | "writing" | "speaking";

type InstructorReviewStage = UnifiedReportStage & { id: InstructorReviewStageId };

function stripReviewMarkdown(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2")
    .replace(/[*_~`]/g, "")
    .trim();
}

function normalizeReviewAnswer(value: string) {
  return stripReviewMarkdown(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function getReviewPrompt(...candidates: Array<string | undefined>) {
  const genericPrompt = /^(audio response|text response|reflection question|writing response|speaking recording|student response)$/i;
  return candidates.find((candidate) => candidate?.trim() && !genericPrompt.test(candidate.trim()))?.trim();
}

const EMPTY_RESOURCE_DRAFT = {
  type: "note" as ResourceEditorType,
  title: "",
  body: "",
  linkUrl: "",
  question: "",
  answer: "",
  explanation: "",
  cards: [] as FlashcardItem[],
};

function getResourceFlashcards(resource: StudentResourceEntry): FlashcardItem[] {
  const savedCards = resource.cards?.filter((card) => (
    card && typeof card.front === "string" && typeof card.back === "string"
  ));
  if (savedCards?.length) return savedCards;
  if (resource.resource_type === "flashcard" && resource.question && resource.answer) {
    return [{
      front: resource.question,
      back: resource.answer,
      explanation: resource.explanation || undefined,
    }];
  }
  return [];
}

function collectStudentFlashcards(resources: StudentResourceEntry[]) {
  const flashcardResources = resources
    .filter((resource) => resource.resource_type === "flashcard" || resource.resource_type === "flashcards")
    .slice()
    .sort((left, right) => {
      const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
      return leftTime - rightTime || left.id.localeCompare(right.id);
    });
  return flashcardResources.flatMap((resource) => getResourceFlashcards(resource).map((card, index) => ({
    ...card,
    id: card.id || `${resource.id}-${index}`,
    deckTitle: resource.title,
  })));
}

function FlashcardDraftList({ cards, onRemove }: { cards: FlashcardItem[]; onRemove?: (index: number) => void }) {
  if (cards.length === 0) {
    return <p className="rounded-md border border-dashed border-[#394252] px-3 py-3 text-xs text-stone-500">Cards you add will appear here before the deck is saved.</p>;
  }
  return (
    <ol className="space-y-2" aria-label="Cards in this draft deck">
      {cards.map((card, index) => (
        <li key={card.id || index} className="rounded-md border border-[#293343] bg-[#0c1017] p-3 text-xs text-stone-300">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-semibold text-amber-400">Card {index + 1}</span>
            {onRemove && <button type="button" onClick={() => onRemove(index)} className="text-stone-500 hover:text-red-300" aria-label={`Remove card ${index + 1}`}>Remove</button>}
          </div>
          <p><span className="font-semibold text-stone-100">Front:</span> <MarkdownContent value={card.front} /></p>
          <p className="mt-1"><span className="font-semibold text-stone-100">Back:</span> <MarkdownContent value={card.back} /></p>
          {card.explanation && <MarkdownContent value={card.explanation} className="mt-1 text-stone-400" />}
        </li>
      ))}
    </ol>
  );
}

function SavedResourcePreview({ resource, title }: { resource: StudentResourceEntry; title: string }) {
  const cards = getResourceFlashcards(resource);
  const href = getResourcePreviewHref(resource.link_url);
  const isDataTable = resource.resource_type === "data_table" || isDataTableResourceTitle(resource.title);

  if (resource.resource_type === "flashcard" || resource.resource_type === "flashcards") {
    return cards.length > 0
      ? <FlashcardDraftList cards={cards} />
      : <p className="text-sm text-stone-500">This deck does not contain any saved cards.</p>;
  }

  return (
    <div className="space-y-3">
      {resource.resource_type === "audio" && (
        <>
          {href ? <CustomAudioPlayer src={href} label={title} /> : <p className="text-sm text-stone-500">No audio file is available.</p>}
          {resource.body && <MarkdownContent value={resource.body} className="text-sm leading-relaxed text-stone-300" />}
          {href && <a href={href} target="_blank" rel="noreferrer" className="break-all text-xs text-sky-300 underline">Open audio file</a>}
        </>
      )}
      {resource.resource_type === "video" && (
        href ? <InteractiveVideoBlock videoUrl={href} title={title} /> : <p className="text-sm text-stone-500">No video is available.</p>
      )}
      {resource.resource_type === "image" && (
        href ? <img src={href} alt={resource.original_filename || title} className="max-h-[520px] w-full rounded-lg border border-[#293343] object-contain" /> : <p className="text-sm text-stone-500">No image is available.</p>
      )}
      {resource.resource_type === "file" && (
        <>
          <p className="text-xs text-stone-400">{resource.original_filename || title}</p>
          {href && resource.media_type?.startsWith("image/") && <img src={href} alt={resource.original_filename || title} className="max-h-[520px] w-full rounded-lg border border-[#293343] object-contain" />}
          {href && resource.media_type === "application/pdf" && <iframe src={href} title={`Preview of ${resource.original_filename || title}`} className="h-80 w-full rounded-md border border-[#293343] bg-white" />}
          {href && resource.media_type?.startsWith("audio/") && <CustomAudioPlayer src={href} label={title} />}
          {href && resource.media_type?.startsWith("video/") && <video src={href} controls preload="metadata" className="max-h-80 w-full rounded-md bg-black" aria-label={`Preview of ${resource.original_filename || title}`} />}
          {href && <a href={href} target="_blank" rel="noreferrer" download={resource.original_filename || undefined} className="inline-flex text-xs text-sky-300 underline">Open or download file</a>}
          {!href && <p className="text-sm text-stone-500">No file is available.</p>}
        </>
      )}
      {resource.resource_type === "reading" && (
        <>
          {href && <a href={href} target="_blank" rel="noreferrer" className="break-all text-xs text-sky-300 underline">Open reading attachment</a>}
          {resource.body && <MarkdownContent value={resource.body} className="text-sm leading-relaxed text-stone-300" />}
          {!href && !resource.body && <p className="text-sm text-stone-500">This reading has no saved text or attachment.</p>}
        </>
      )}
      {(resource.resource_type === "note" || resource.resource_type === "quiz" || isDataTable) && (
        resource.body
          ? isDataTable
            ? <DataTableResource title={title} markdown={resource.body} />
            : <MarkdownContent value={resource.body} className="text-sm leading-relaxed text-stone-300" />
          : <p className="text-sm text-stone-500">This resource has no saved text.</p>
      )}
    </div>
  );
}

function ResourceRichTextPreview({ html, fallback, className = "" }: { html: string; fallback: string; className?: string }) {
  const hasContent = html.trim() !== "" && html.trim() !== "<p></p>";
  return hasContent ? (
    <div className={`resource-rich-text ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <p className={className}>{fallback}</p>
  );
}

function getResourcePreviewHref(value?: string | null) {
  if (!value?.trim()) return null;
  const rawUrl = value.trim();
  if (!/^https?:\/\//i.test(rawUrl)) return null;
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? rawUrl : null;
  } catch {
    return null;
  }
}

const RESOURCE_FILE_MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

function getSupportedResourceMediaType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const extensionType = RESOURCE_FILE_MEDIA_TYPES[extension];
  if (extensionType && (!file.type || file.type === "application/octet-stream")) return extensionType;
  return Object.values(RESOURCE_FILE_MEDIA_TYPES).includes(file.type.toLowerCase()) ? file.type.toLowerCase() : null;
}

function AudioTranscriptAccordion({ resourceId, transcript }: { resourceId: string; transcript: string }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const richTextTranscript = /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|table|span)\b/i.test(transcript);
  const transcriptLines = richTextTranscript ? [] : parseInteractiveTranscript(transcript);
  const contentId = `audio-transcript-${resourceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <div className="overflow-hidden rounded-lg border border-[#293343] bg-[#0c1017]/70">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="flex w-full items-center justify-between gap-3 border-b border-[#293343] px-3 py-2 text-left text-[10px]  uppercase tracking-[0.14em] text-stone-400 transition hover:bg-amber-500/20 hover:text-amber-400"
      >
        <span>Transcript</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-amber-400 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div id={contentId} className={`grid transition-[grid-template-rows] duration-300 ease-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          {richTextTranscript ? <MarkdownContent value={transcript} className="p-3 text-xs leading-relaxed text-stone-300" /> : transcriptLines.length > 0 ? <div className="divide-y divide-[#202631]">
            {transcriptLines.map((line, index) => <div key={`${line.seconds}-${index}`} className="flex items-start gap-3 px-3 py-2.5">
              <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-amber-400">{line.timestamp}</span>
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-stone-300">{line.text}</p>
            </div>)}
          </div> : <p className="whitespace-pre-wrap break-words p-3 text-xs leading-relaxed text-stone-300">{transcript}</p>}
        </div>
      </div>
    </div>
  );
}

export default function InstructorWorkstationPage({
  instructorId,
  lessonSlug,
}: InstructorWorkstationProps) {
  const lessonId = lessonSlug;
  const resetStore = useLessonEditorStore((state) => state.resetStore);
  const bindLesson = useLessonEditorStore((state) => state.bindLesson);
  const editorLesson = useLessonEditorStore((state) => state.lesson);

  const [isMounted, setIsMounted] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [resourceLessonId, setResourceLessonId] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentUser[]>([]);
  const [instructors, setInstructors] = useState<InstructorDirectoryEntry[]>([]);
  const [instructorsLoading, setInstructorsLoading] = useState(false);
  const [instructorsError, setInstructorsError] = useState<string | null>(null);
  const [expandedInstructorIds, setExpandedInstructorIds] = useState<Set<string>>(() => new Set());
  const [savingInstructorId, setSavingInstructorId] = useState<string | null>(null);
  const [instructorSaveMessages, setInstructorSaveMessages] = useState<Record<string, string>>({});
  const [isAddInstructorOpen, setIsAddInstructorOpen] = useState(false);
  const [addInstructorDraft, setAddInstructorDraft] = useState<AddInstructorDraft>(EMPTY_ADD_INSTRUCTOR_DRAFT);
  const [isAddingInstructor, setIsAddingInstructor] = useState(false);
  const [addInstructorError, setAddInstructorError] = useState<string | null>(null);
  const selectedStudent = students.find((student) => student.id === selectedStudentId) || null;
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  const [databaseLessonId, setDatabaseLessonId] = useState<string | null>(null);
  const [reviewSubmissionId, setReviewSubmissionId] = useState<string | null>(null);
  const [reviewSubmissionLessonId, setReviewSubmissionLessonId] = useState<string | null>(null);
  const [pendingSubmissionCount, setPendingSubmissionCount] = useState(0);
  const [pendingSubmissions, setPendingSubmissions] = useState<PendingReviewSubmission[]>([]);
  const [pendingSubmissionError, setPendingSubmissionError] = useState<string | null>(null);
  const [publishedLessonCount, setPublishedLessonCount] = useState(0);
  const [draftLessonCount, setDraftLessonCount] = useState(0);
  const [lessonStatus, setLessonStatus] = useState<"draft" | "published">("published");
  const [activeTab, setActiveTab] = useState<"dashboard" | "students" | "instructors" | "library" | "builder" | "evaluation" | "music" | "resources">("dashboard");
  const [studentLevelFilter, setStudentLevelFilter] = useState<"All" | StudentCefrLevel>("All");
  const [studentInstructorFilter, setStudentInstructorFilter] = useState("All instructors");
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [addStudentDraft, setAddStudentDraft] = useState<AddStudentDraft>(EMPTY_ADD_STUDENT_DRAFT);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [addStudentError, setAddStudentError] = useState<string | null>(null);
  const [savingProfileStudentId, setSavingProfileStudentId] = useState<string | null>(null);
  const [profileSaveMessages, setProfileSaveMessages] = useState<Record<string, string>>({});
  const [profileSaveToast, setProfileSaveToast] = useState<string | null>(null);
  const [expandedStudentIds, setExpandedStudentIds] = useState<Set<string>>(() => new Set());
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryLevel, setLibraryLevel] = useState("all");
  const [libraryDomain, setLibraryDomain] = useState("all");
  const [librarySortBy, setLibrarySortBy] = useState<"title" | "domain" | "practiceType" | "skillFocus">("title");
  const [libraryView, setLibraryView] = useState<"grid" | "table">("grid");
  const [expandedLibraryMetadata, setExpandedLibraryMetadata] = useState<Set<string>>(() => new Set());
  const [assignmentEditorLessonId, setAssignmentEditorLessonId] = useState<string | null>(null);
  const [quickTagEditor, setQuickTagEditor] = useState<{ lessonId: string; level: string; tags: LessonTags; customTagsText: string } | null>(null);
  const [quickTagSaving, setQuickTagSaving] = useState(false);
  const [quickTagError, setQuickTagError] = useState<string | null>(null);
  const [heroBannerOpen, setHeroBannerOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [isLessonGuidanceExpanded, setIsLessonGuidanceExpanded] = useState(false);
  const [activeStudentsOpen, setActiveStudentsOpen] = useState(false);
  const [sidebarStep, setSidebarStep] = useState<keyof SidebarBlocksByStep>("warm_up");
  const [sidebarBlocksByStep, setSidebarBlocksByStep] = useState<SidebarBlocksByStep>({});
  const [lessonResources, setLessonResources] = useState<LessonResource[]>([]);
  const [studentResources, setStudentResources] = useState<StudentResourceEntry[]>([]);
  const [builderResourcesExpanded, setBuilderResourcesExpanded] = useState(false);
  const [editingStudentResourceId, setEditingStudentResourceId] = useState<string | null>(null);
  const [expandedStudentResourceIds, setExpandedStudentResourceIds] = useState<Set<string>>(() => new Set());
  const [resourceDraft, setResourceDraft] = useState(EMPTY_RESOURCE_DRAFT);
  const [resourceBodyHtml, setResourceBodyHtml] = useState("");
  const [resourceQuestionHtml, setResourceQuestionHtml] = useState("");
  const [resourceAnswerHtml, setResourceAnswerHtml] = useState("");
  const [resourceExplanationHtml, setResourceExplanationHtml] = useState("");
  const [resourceInputMode, setResourceInputMode] = useState<"upload" | "url">("upload");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioFilePreviewUrl, setAudioFilePreviewUrl] = useState<string | null>(null);
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceFilePreviewUrl, setResourceFilePreviewUrl] = useState<string | null>(null);
  const [isResourceFileDragging, setIsResourceFileDragging] = useState(false);
  const [resourceStatus, setResourceStatus] = useState<string | null>(null);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [draftFlashcardFlipped, setDraftFlashcardFlipped] = useState(false);
  const [showFlashcardExplanation, setShowFlashcardExplanation] = useState(false);
  const [wrongCount, setWrongCount] = useState(0);
  const [rightCount, setRightCount] = useState(0);

  useEffect(() => {
    if (!audioFile) {
      setAudioFilePreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(audioFile);
    setAudioFilePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [audioFile]);

  useEffect(() => {
    if (!resourceFile) {
      setResourceFilePreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(resourceFile);
    setResourceFilePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [resourceFile]);

  const [workstationState, setWorkstationState] = useState<{
    content: StrictStepContent;
    bannerUrl: string;
    bannerPosition: BannerPosition;
    bannerDimness: number;
    customBannerUrl: string;
    studentProfile: StudentProfile;
    evaluation: LessonEvaluation;
    submission?: StudentSubmission;
  }>({
    content: {},
    bannerUrl: "",
    bannerPosition: { x: 50, y: 50 },
    bannerDimness: 20,
    customBannerUrl: "",
    studentProfile: {
      fullName: "",
      level: "",
      targetGoal: "",
      weaknesses: [],
      teacherNotes: "",
      attendanceRate: 0,
      completedModulesCount: 0,
    },
    evaluation: {
      scores: { task: 4, coherence: 4, lexical: 3, grammar: 4 },
      comments: "Great work on incorporating specific behavioral terms.",
      criterionFeedback: {},
      published: false,
    },
    submission: undefined,
  });

  const [isPublishing, setIsPublishing] = useState(false);
  const [isSplitPreviewOpen, setIsSplitPreviewOpen] = useState(false);
  const [previewStep, setPreviewStep] = useState<"warm_up" | "lesson" | "listening" | "reading" | "writing" | "speaking" | "results">("warm_up");
  const previewChannelRef = useRef<BroadcastChannel | null>(null);
  const [saveIndicator, setSaveIndicator] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isDirty, setIsDirty] = useState(false);
  const [showSuccessCheck, setShowSuccessCheck] = useState(false);
  const hasLoadedLesson = useRef(false);
  const lastSavedDraftSignature = useRef<string | null>(null);
  const saveRequestId = useRef(0);
  const activeLessonIdRef = useRef<string | null>(null);
  const lastEditQueryRef = useRef<string | null>(null);
  const workstationMountedRef = useRef(false);
  const saveInFlight = useRef(false);
  const pendingAutoSave = useRef(false);
  const lastInputAt = useRef(0);
  const inputTimer = useRef<number | null>(null);
  const autoSaveTimer = useRef<number | null>(null);
  const savedIndicatorTimer = useRef<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<Partial<Record<"selectedStudentId" | "title" | "slug" | "moduleNumber", string>>>({});
  const [createdLessons, setCreatedLessons] = useState<LessonWithVersion[]>([]);
  const [lessonPendingDelete, setLessonPendingDelete] = useState<LessonWithVersion | null>(null);
  const [isDeletingLesson, setIsDeletingLesson] = useState(false);
  const activeBuilderStudent = selectedStudent;
  const activeBuilderLessonId = resourceLessonId || databaseLessonId || null;
  const [openLessonMenuId, setOpenLessonMenuId] = useState<string | null>(null);
  const [newLesson, setNewLesson] = useState({
    studentId: "",
    title: "",
    slug: "",
    subtitle: "",
    instructorGuidance: "",
    moduleNumber: "",
    level: "B1",
    tags: { ...EMPTY_LESSON_TAGS },
    customTagsText: "",
    status: "draft" as "draft" | "published",
  });
  const lessonTitleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lessonSubtitleTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const livePreviewSnapshot: StudentPreviewSnapshot = {
    content: workstationState.content,
    sidebarBlocksByStep,
    step: previewStep,
    title: newLesson.title,
    subtitle: newLesson.subtitle,
    bannerUrl: workstationState.bannerUrl,
    bannerPosition: workstationState.bannerPosition,
    bannerDimness: workstationState.bannerDimness,
    moduleNumber: Number(newLesson.moduleNumber) || 1,
  };
  const livePreviewSnapshotRef = useRef(livePreviewSnapshot);
  livePreviewSnapshotRef.current = livePreviewSnapshot;

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(STUDENT_PREVIEW_CHANNEL);
    previewChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ type?: string; step?: StudentPreviewStep }>) => {
      if (event.data?.type === "preview-ready") {
        channel.postMessage({ type: "preview-state", snapshot: livePreviewSnapshotRef.current });
      }
      if (event.data?.type === "preview-step" && event.data.step) {
        setPreviewStep(event.data.step);
      }
    };
    return () => {
      channel.close();
      if (previewChannelRef.current === channel) previewChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    previewChannelRef.current?.postMessage({ type: "preview-state", snapshot: livePreviewSnapshot });
  }, [workstationState.content, sidebarBlocksByStep, previewStep, newLesson.title, newLesson.subtitle, newLesson.moduleNumber, workstationState.bannerUrl, workstationState.bannerPosition, workstationState.bannerDimness]);

  useEffect(() => {
    resizeTextareaToContent(lessonTitleTextareaRef.current);
    resizeTextareaToContent(lessonSubtitleTextareaRef.current);
  }, [newLesson.title, newLesson.subtitle]);

  useEffect(() => {
    if (!profileSaveToast) return;
    const timeout = window.setTimeout(() => setProfileSaveToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [profileSaveToast]);

  useEffect(() => {
    if (!isMounted || activeTab !== "instructors") return;
    let cancelled = false;
    setInstructorsLoading(true);
    setInstructorsError(null);
    getInstructorDirectory()
      .then((directory) => {
        if (cancelled) return;
        setInstructors(directory.map((instructor) => ({
          ...instructor,
          assignedCount: students.filter((student) => student.profile.assignedInstructor?.trim().toLowerCase() === instructor.name.trim().toLowerCase()).length,
        })));
      })
      .catch((error) => {
        if (!cancelled) setInstructorsError(error instanceof Error ? error.message : "Unable to load instructor profiles.");
      })
      .finally(() => {
        if (!cancelled) setInstructorsLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, isMounted, students]);

  const updateBuilderLevel = (level: string) => {
    setNewLesson((previous) => ({ ...previous, level }));
    setWorkstationState((previous) => ({ ...previous, content: { ...previous.content, level } }));
  };

  const updateBuilderTags = (tags: LessonTags, customTagsText = tags.custom.join(", ")) => {
    setNewLesson((previous) => ({ ...previous, tags, customTagsText }));
    setWorkstationState((previous) => ({
      ...previous,
      content: {
        ...previous.content,
        tags,
        domain: tags.domain,
        skill_focus: tags.skill_focus,
        practice_type: tags.practice_type,
      },
    }));
  };

  const readEditLessonQuery = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("lessonId") || params.get("edit");
  };

  const writeEditLessonQuery = (lessonId: string | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("lessonId");
    url.searchParams.delete("edit");
    if (lessonId) url.searchParams.set("lessonId", lessonId);
    window.history.pushState({}, "", url);
    lastEditQueryRef.current = lessonId;
  };

  const resetBuilderState = (studentId = "") => {
    saveRequestId.current += 1;
    if (autoSaveTimer.current !== null) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = null;
    if (savedIndicatorTimer.current !== null) window.clearTimeout(savedIndicatorTimer.current);
    savedIndicatorTimer.current = null;
    pendingAutoSave.current = false;
    saveInFlight.current = false;
    activeLessonIdRef.current = null;
    hasLoadedLesson.current = false;
    lastSavedDraftSignature.current = null;
    resetStore();
    setDatabaseLessonId(null);
    setResourceLessonId(null);
    setReviewSubmissionId(null);
    setReviewSubmissionLessonId(null);
    setSidebarBlocksByStep({});
    setSidebarStep("warm_up");
    setLessonResources([]);
    setSelectedStudentId(studentId || null);
    setNewLesson({ studentId, title: "", slug: "", subtitle: "", instructorGuidance: "", moduleNumber: "", level: "B1", tags: { ...EMPTY_LESSON_TAGS }, customTagsText: "", status: "draft" });
    setWorkstationState((previous) => ({
      ...previous,
      content: {},
      bannerUrl: "",
      bannerPosition: { x: 50, y: 50 },
      bannerDimness: 20,
      customBannerUrl: "",
      studentProfile: { fullName: "", level: "", targetGoal: "", weaknesses: [], teacherNotes: "", attendanceRate: 0, completedModulesCount: 0 },
      evaluation: { scores: { task: 4, coherence: 4, lexical: 3, grammar: 4 }, comments: "", criterionFeedback: {}, published: false },
      submission: undefined,
    }));
    setLessonStatus("draft");
    setSaveIndicator("idle");
    setIsDirty(false);
    setShowSuccessCheck(false);
    setValidationErrors({});
    setPublishStatus(null);
    setPreviewStep("warm_up");
    setAudioFile(null);
    setResourceFile(null);
    setResourceDraft(EMPTY_RESOURCE_DRAFT);
    setEditingStudentResourceId(null);
    setExpandedStudentResourceIds(new Set());
    setResourceStatus(null);
  };

  const resetNewLessonForm = (studentId = "") => {
    setNewLesson({
      studentId,
      title: "",
      slug: "",
      subtitle: "",
      instructorGuidance: "",
      moduleNumber: "",
      level: "B1",
      tags: { ...EMPTY_LESSON_TAGS },
      customTagsText: "",
      status: "draft",
    });
    setLessonResources([]);
  };

  const startNewLesson = () => {
    writeEditLessonQuery(null);
    resetBuilderState();
    setActiveTab("builder");
  };

  const getDraftSignature = (content: StrictStepContent, title: string, subtitle: string, moduleNumber: string, slug = newLesson.slug) =>
    JSON.stringify({
      content,
      title: title.trim() || "Untitled Lesson",
      subtitle: subtitle.trim() || "A new Fluentia learning journey.",
      moduleNumber: Number(moduleNumber) || 1,
      slug: slug.trim().toLowerCase(),
      level: normalizeCefrLevel(newLesson.level),
      tags: newLesson.tags,
      customTagsText: newLesson.customTagsText,
      studentId: selectedStudentId || newLesson.studentId || "",
      bannerUrl: workstationState.bannerUrl,
      bannerPosition: workstationState.bannerPosition,
      bannerDimness: workstationState.bannerDimness,
      sidebarBlocksByStep,
      instructorGuidance: newLesson.instructorGuidance,
      lessonResources,
    });
  const currentDraftSignature = getDraftSignature(
    workstationState.content,
    newLesson.title,
    newLesson.subtitle,
    newLesson.moduleNumber,
  );
  const currentDraftSignatureRef = useRef(currentDraftSignature);
  currentDraftSignatureRef.current = currentDraftSignature;
  const isDraftDirty = lastSavedDraftSignature.current === null
    ? isDirty
    : currentDraftSignature !== lastSavedDraftSignature.current;
  const isSaveBarVisible = isDraftDirty || saveIndicator === "saving" || showSuccessCheck;
  const saveLessonChangesRef = useRef<((status: "draft" | "published", isAutoSave?: boolean, isPublishAction?: boolean) => Promise<void>) | null>(null);

  async function handleStudentChange(student: StudentUser) {
    const id = student?.id?.trim();
    if (!id) {
      writeEditLessonQuery(null);
      resetBuilderState();
      return;
    }
    writeEditLessonQuery(null);
    resetBuilderState(id);
    setSelectedStudentId(id);
    setNewLesson((previous) => ({
      ...previous,
      studentId: id,
      level: normalizeStudentLevel(student.profile.targetLevel || student.profile.level) || previous.level,
    }));
    setWorkstationState((previous) => ({ ...previous, studentProfile: student.profile }));
    const studentToken = student.token || student.id;
    const savedProfile = await getStudentProfile(studentToken).catch(() => null);
    if (savedProfile) {
      setWorkstationState((previous) => ({
        ...previous,
        studentProfile: {
          ...previous.studentProfile,
          ...savedProfile,
          id: student.id,
          fullName: savedProfile.fullName || previous.studentProfile.fullName || student.name,
          targetLevel: normalizeStudentLevel(savedProfile.targetLevel || savedProfile.level) || undefined,
          level: normalizeStudentLevel(savedProfile.targetLevel || savedProfile.level) || previous.studentProfile.level,
          targetGoal: savedProfile.targetGoal || previous.studentProfile.targetGoal,
          teacherNotes: savedProfile.teacherNotes || previous.studentProfile.teacherNotes,
        },
      }));
      const profileLevel = normalizeStudentLevel(savedProfile.targetLevel || savedProfile.level);
      if (profileLevel) setNewLesson((previous) => ({ ...previous, level: profileLevel }));
    }
  }

  async function handleStudentLevelChange(student: StudentUser, targetLevel: StudentCefrLevel) {
    const previousStudent = student;
    setStudents((current) => current.map((item) => item.id === student.id
      ? { ...item, profile: { ...item.profile, level: targetLevel, targetLevel } }
      : item));
    if (selectedStudentId === student.id) {
      setWorkstationState((current) => ({
        ...current,
        studentProfile: { ...current.studentProfile, level: targetLevel, targetLevel },
      }));
    }
    setPublishStatus(`${student.name}'s level updated locally. Click Save Changes to persist it.`);
    void Promise.resolve(previousStudent);
  }

  async function saveStudentProfileEntry(student: StudentUser, profile: StudentProfile) {
    const studentToken = student.token || student.id;
    const targetLevel = normalizeStudentLevel(profile.targetLevel || profile.level);
    const nextProfile = {
      ...profile,
      id: student.id,
      fullName: profile.fullName.trim() || student.name,
      email: profile.email?.trim() ?? student.email ?? "",
      targetLevel: targetLevel || undefined,
      level: targetLevel || "",
      weaknesses: profile.weaknesses || [],
    };
    const saveMode = await saveStudentProfile(studentToken, nextProfile);
    setStudents((current) => current.map((currentStudent) => currentStudent.id === student.id ? {
      ...currentStudent,
      name: nextProfile.fullName,
      email: nextProfile.email ?? currentStudent.email,
      profile: nextProfile,
    } : currentStudent));
    if (selectedStudentId === student.id) setWorkstationState((current) => ({ ...current, studentProfile: nextProfile }));
    window.dispatchEvent(new CustomEvent(FLUENTIA_DATA_UPDATED_EVENT, { detail: { type: "student-profile", studentToken } }));
    return saveMode;
  }

  async function handleSaveSelectedStudentProfile(profile: StudentProfile) {
    if (!selectedStudent) throw new Error("Select a student before saving profile changes.");
    await saveStudentProfileEntry(selectedStudent, profile);
  }

  function updateDirectoryStudentProfile(studentId: string, changes: Partial<StudentProfile>) {
    setStudents((current) => current.map((student) => student.id === studentId ? {
      ...student,
      ...(changes.email !== undefined ? { email: changes.email } : {}),
      profile: { ...student.profile, ...changes },
    } : student));
    if (selectedStudentId === studentId) {
      setWorkstationState((current) => ({ ...current, studentProfile: { ...current.studentProfile, ...changes } }));
    }
  }

  function toggleStudentProfile(studentId: string) {
    setExpandedStudentIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function toggleInstructorProfile(instructorId: string) {
    setExpandedInstructorIds((current) => {
      const next = new Set(current);
      if (next.has(instructorId)) next.delete(instructorId);
      else next.add(instructorId);
      return next;
    });
  }

  function updateInstructorProfile(instructorId: string, changes: Partial<InstructorDirectoryEntry>) {
    setInstructors((current) => current.map((instructor) => instructor.id === instructorId
      ? { ...instructor, ...changes }
      : instructor));
  }

  async function handleSaveDirectoryStudent(event: React.MouseEvent<HTMLButtonElement>, student: StudentUser) {
    event.preventDefault();
    setSavingProfileStudentId(student.id);
    setProfileSaveMessages((current) => ({ ...current, [student.id]: "" }));
    setProfileSaveToast(null);
    try {
      await saveStudentProfileEntry(student, student.profile);
      setProfileSaveMessages((current) => ({ ...current, [student.id]: "Profile saved successfully!" }));
      setProfileSaveToast("Profile saved successfully!");
    } catch (error) {
      setProfileSaveMessages((current) => ({ ...current, [student.id]: error instanceof Error ? error.message : "Unable to save student profile." }));
    } finally {
      setSavingProfileStudentId(null);
    }
  }

  async function handleCreateStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAddingStudent(true);
    setAddStudentError(null);
    try {
      const response = await fetch("/api/instructor/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addStudentDraft),
      });
      const result = await response.json() as { student?: StudentUser; error?: string };
      if (!response.ok || !result.student) {
        throw new Error(result.error || "Unable to add student.");
      }

      const createdStudent = result.student;
      setStudents((current) => [createdStudent, ...current.filter((student) => student.id !== createdStudent.id)]);
      setStudentLevelFilter("All");
      setStudentInstructorFilter("All instructors");
      setExpandedStudentIds((current) => new Set(current).add(createdStudent.id));
      setAddStudentDraft(EMPTY_ADD_STUDENT_DRAFT);
      setIsAddStudentOpen(false);
      setProfileSaveToast("Student added successfully!");
    } catch (error) {
      setAddStudentError(error instanceof Error ? error.message : "Unable to add student.");
    } finally {
      setIsAddingStudent(false);
    }
  }

  async function handleCreateInstructor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAddingInstructor(true);
    setAddInstructorError(null);
    try {
      const response = await fetch("/api/instructor/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addInstructorDraft),
      });
      const result = await response.json() as { instructor?: unknown; error?: string };
      if (!response.ok || !result.instructor) throw new Error(result.error || "Unable to create instructor.");
      const createdInstructor = normalizeInstructorRecord(result.instructor);
      setInstructors((current) => [createdInstructor, ...current.filter((instructor) => instructor.id !== createdInstructor.id)]);
      setExpandedInstructorIds((current) => new Set(current).add(createdInstructor.id));
      setAddInstructorDraft(EMPTY_ADD_INSTRUCTOR_DRAFT);
      setIsAddInstructorOpen(false);
    } catch (error) {
      setAddInstructorError(error instanceof Error ? error.message : "Unable to create instructor.");
    } finally {
      setIsAddingInstructor(false);
    }
  }

  async function persistInstructorUpdate(instructor: InstructorDirectoryEntry, changes: Partial<InstructorDirectoryEntry>) {
    const response = await fetch(`/api/instructor/${encodeURIComponent(instructor.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: changes.name ?? instructor.name,
        email: changes.email ?? instructor.email,
        specialization: changes.specialization ?? instructor.specialization,
        status: changes.status ?? instructor.status,
        maxStudentCapacity: changes.maxStudentCapacity ?? instructor.maxStudentCapacity,
        bio: changes.bio ?? instructor.bio,
      }),
    });
    const result = await response.json() as { instructor?: unknown; error?: string };
    if (!response.ok || !result.instructor) throw new Error(result.error || "Unable to save instructor profile.");
    const updatedInstructor = normalizeInstructorRecord(result.instructor, instructor.assignedCount);
    setInstructors((current) => current.map((item) => item.id === instructor.id ? updatedInstructor : item));
    return updatedInstructor;
  }

  async function handleSaveInstructor(event: React.MouseEvent<HTMLButtonElement>, instructor: InstructorDirectoryEntry) {
    event.preventDefault();
    setSavingInstructorId(instructor.id);
    setInstructorSaveMessages((current) => ({ ...current, [instructor.id]: "" }));
    try {
      await persistInstructorUpdate(instructor, instructor);
      setInstructorSaveMessages((current) => ({ ...current, [instructor.id]: "Instructor profile saved." }));
    } catch (error) {
      setInstructorSaveMessages((current) => ({ ...current, [instructor.id]: error instanceof Error ? error.message : "Unable to save instructor profile." }));
    } finally {
      setSavingInstructorId(null);
    }
  }

  async function handleDeactivateInstructor(event: React.MouseEvent<HTMLButtonElement>, instructor: InstructorDirectoryEntry) {
    event.preventDefault();
    if (instructor.status === "on_leave" || !window.confirm(`Place ${instructor.name} on leave? Their profile will remain available for reactivation.`)) return;
    setSavingInstructorId(instructor.id);
    setInstructorSaveMessages((current) => ({ ...current, [instructor.id]: "" }));
    try {
      await persistInstructorUpdate(instructor, { status: "on_leave" });
      setInstructorSaveMessages((current) => ({ ...current, [instructor.id]: "Instructor placed on leave." }));
    } catch (error) {
      setInstructorSaveMessages((current) => ({ ...current, [instructor.id]: error instanceof Error ? error.message : "Unable to deactivate instructor." }));
    } finally {
      setSavingInstructorId(null);
    }
  }

  const handleWorkspaceTabChange = (tab: typeof activeTab) => {
    if (tab === "builder") {
      if (!readEditLessonQuery()) {
        writeEditLessonQuery(null);
        resetBuilderState();
      }
    } else if (activeTab === "builder") {
      writeEditLessonQuery(null);
      resetBuilderState();
    }
    setActiveTab(tab);
  };

  const createSlug = (title: string) => {
    const normalizedTitle = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return normalizedTitle || `lesson-${Date.now()}`;
  };

  const refreshCreatedLessons = async () => {
    try {
      const lessons = await getLessons();
      setCreatedLessons(lessons);
    } catch (error) {
      console.error("Failed to load lessons from Supabase:", (error as { message?: string })?.message || JSON.stringify(error));
      setPublishStatus("Unable to refresh lessons. Previously loaded lessons remain available.");
    }
  };

  const getSavedStudentId = (lesson: LessonWithVersion) => {
    const metadata = (lesson.content || {}) as Record<string, any>;
    const nestedMetadata = metadata.metadata && typeof metadata.metadata === "object"
      ? metadata.metadata
      : {};
    const candidates = [
      lesson.student_id,
      lesson.student_token,
      metadata.student_id,
      metadata.studentId,
      metadata.student_token,
      metadata.studentToken,
      nestedMetadata.student_id,
      nestedMetadata.studentId,
      nestedMetadata.student_token,
      nestedMetadata.studentToken,
    ];
    return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() || null;
  };

  const activateLesson = (lesson: LessonWithVersion) => {
    saveRequestId.current += 1;
    if (autoSaveTimer.current !== null) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = null;
    if (savedIndicatorTimer.current !== null) window.clearTimeout(savedIndicatorTimer.current);
    savedIndicatorTimer.current = null;
    pendingAutoSave.current = false;
    saveInFlight.current = false;
    activeLessonIdRef.current = lesson.id;
    lastSavedDraftSignature.current = null;
    setIsDirty(false);
    setSaveIndicator("idle");
    setShowSuccessCheck(false);
    bindLesson(lesson);
    const content = lesson.content || {};
    const lessonSlug = typeof content.slug === "string" ? content.slug : lesson.id;
    const savedStudentId = getSavedStudentId(lesson);
    const savedStudent = savedStudentId
      ? students.find((student) => student.id === savedStudentId || student.token === savedStudentId)
      : undefined;
    hasLoadedLesson.current = false;
    setSelectedStudentId(savedStudent?.id || null);
    setReviewSubmissionId(null);
    setReviewSubmissionLessonId(null);
    setNewLesson((previous) => ({
      ...previous,
      studentId: savedStudentId || previous.studentId,
      title: lesson.title,
      slug: lessonSlug,
      subtitle: typeof content.subtitle === "string" ? content.subtitle : lesson.subtitle || "",
      instructorGuidance: typeof content.instructorGuidance === "string" ? content.instructorGuidance : "",
      moduleNumber: String(content.moduleNumber || lesson.module_number || 1),
      level: normalizeCefrLevel(lesson.grade || content.level || content.cefrLevel),
      tags: normalizeLessonTags(lesson.tags, { ...content, domain: content.domain ?? lesson.subject }),
      customTagsText: normalizeLessonTags(lesson.tags, { ...content, domain: content.domain ?? lesson.subject }).custom.join(", "),
      status: lesson.status === "published" ? "published" : "draft",
    }));
    setWorkstationState((previous) => ({
      ...previous,
      content,
      bannerUrl: typeof content.coverImage === "string" ? content.coverImage : lesson.banner_url || "",
      bannerPosition: normalizeBannerPosition(content.bannerPosition ?? content.banner_position),
      bannerDimness: normalizeBannerDimness(content.bannerDimness ?? content.banner_dimness),
    }));
    setSidebarBlocksByStep(normalizeSidebarBlocksByStep((content as Record<string, any>).sidebarBlocks));
    const rawResources = (content as Record<string, any>).lessonResources;
    setLessonResources(
      Array.isArray(rawResources)
        ? rawResources.filter((r: unknown): r is LessonResource => !!r && typeof (r as LessonResource).id === "string" && typeof (r as LessonResource).url === "string")
        : []
    );
    setDatabaseLessonId(lesson.id);
    setResourceLessonId(lesson.id);
    setResourceFile(null);
    setLessonStatus(lesson.status === "published" ? "published" : "draft");
    window.setTimeout(() => {
      if (activeLessonIdRef.current === lesson.id) hasLoadedLesson.current = true;
    }, 0);
  };

  const handleEditLesson = (lesson: LessonWithVersion) => {
    writeEditLessonQuery(lesson.id);
    activateLesson(lesson);
    setActiveTab("builder");
  };

  const duplicateLesson = (lesson?: LessonWithVersion) => {
    writeEditLessonQuery(null);
    saveRequestId.current += 1;
    if (autoSaveTimer.current !== null) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = null;
    if (savedIndicatorTimer.current !== null) window.clearTimeout(savedIndicatorTimer.current);
    savedIndicatorTimer.current = null;
    pendingAutoSave.current = false;
    saveInFlight.current = false;
    activeLessonIdRef.current = null;
    lastSavedDraftSignature.current = null;
    setIsDirty(false);
    setSaveIndicator("idle");
    setShowSuccessCheck(false);
    resetStore();
    const sourceContent = (lesson?.content || workstationState.content) as Record<string, any>;
    const sourceTitle = lesson?.title || newLesson.title || "Untitled Lesson";
    const sourceSlug = typeof sourceContent.slug === "string" ? sourceContent.slug : createSlug(sourceTitle);
    const copySlug = `${sourceSlug.replace(/-copy(?:-\d+)?$/, "")}-copy-${Date.now()}`;
    let copyContent: Record<string, any> = {
      ...sourceContent,
      slug: copySlug,
      title: `${sourceTitle} Copy`,
      student_id: undefined,
      student_token: undefined,
      status: "draft",
    };
    const nextSidebar = cloneSidebarBlocksByStep(normalizeSidebarBlocksByStep((sourceContent as Record<string, any>).sidebarBlocks));
    // Deep-copy sidebar blocks so mutating the duplicated draft cannot alias the source lesson.
    const nextResources: LessonResource[] = Array.isArray(sourceContent.lessonResources)
      ? (sourceContent.lessonResources as LessonResource[]).map((r) => ({ ...r }))
      : [];
    copyContent = { ...copyContent, sidebarBlocks: nextSidebar, lessonResources: nextResources };
    hasLoadedLesson.current = false;
    setDatabaseLessonId(null);
    setResourceLessonId(null);
    setResourceFile(null);
    setSelectedStudentId(null);
    setReviewSubmissionId(null);
    setReviewSubmissionLessonId(null);
    setNewLesson((previous) => ({
      ...previous,
      studentId: "",
      title: `${sourceTitle} Copy`,
      slug: copySlug,
      subtitle: typeof copyContent.subtitle === "string" ? copyContent.subtitle : "",
      moduleNumber: String(copyContent.moduleNumber || 1),
      level: normalizeCefrLevel(lesson?.grade || copyContent.level || copyContent.cefrLevel),
      tags: normalizeLessonTags(lesson?.tags, copyContent),
      customTagsText: normalizeLessonTags(lesson?.tags, copyContent).custom.join(", "),
      status: "draft",
    }));
    setWorkstationState((previous) => ({
      ...previous,
      content: copyContent,
      bannerUrl: typeof copyContent.coverImage === "string" ? copyContent.coverImage : previous.bannerUrl,
    }));
    setSidebarBlocksByStep(nextSidebar);
    setLessonResources(nextResources);
    setLessonStatus("draft");
    setSaveIndicator("idle");
    setPublishStatus("Copy ready. Select a student before saving the new draft.");
    setActiveTab("builder");
  };

  const handleDeleteLesson = async () => {
    if (!lessonPendingDelete || isDeletingLesson) return;
    const lesson = lessonPendingDelete;
    setIsDeletingLesson(true);
    setCreatedLessons((current) => current.filter((item) => item.id !== lesson.id));
    if (databaseLessonId === lesson.id) {
      setDatabaseLessonId(null);
      setSaveIndicator("idle");
    }
    try {
      await deleteLesson(lesson.id);
      setLessonPendingDelete(null);
      window.dispatchEvent(new Event("fluentia:lesson-updated"));
      setPublishStatus(`Lesson '${lesson.title}' deleted.`);
    } catch (error) {
      const details = error && typeof error === "object" ? error as { code?: string; message?: string; details?: string; hint?: string; status?: number } : undefined;
      console.error("Lesson deletion failed:", {
        code: details?.code,
        message: error instanceof Error ? error.message : details?.message || String(error),
        details: details?.details,
        hint: details?.hint,
        status: details?.status,
      });
      setCreatedLessons((current) => current.some((item) => item.id === lesson.id) ? current : [lesson, ...current]);
      const failureMessage = error instanceof Error ? error.message : details?.message || "Unknown deletion error";
      const isPermissionFailure = details?.code === "42501" || /permission|row-level security|rls/i.test(`${failureMessage} ${details?.details || ""}`);
      const isConstraintFailure = details?.code === "23503" || /foreign key|constraint|referenced/i.test(`${failureMessage} ${details?.details || ""}`);
      setPublishStatus(
        isPermissionFailure
          ? "Lesson deletion blocked by Supabase permissions. Check instructor access policies."
          : isConstraintFailure
            ? "Lesson deletion blocked by related records. Remove the related records or check cascade rules."
            : `Lesson deletion failed: ${failureMessage}`,
      );
    } finally {
      setIsDeletingLesson(false);
    }
  };

  const getAssignedStudentNames = (lesson: LessonWithVersion) => {
    const metadata = (lesson.content || {}) as Record<string, any>;
    const assignedAll = metadata.assignedAllStudents === true
      || metadata.assigned_all_students === true
      || metadata.assignmentMode === "all";
    if (assignedAll) return ["All Students"];

    const assignedStudents = lesson.assigned_student_ids?.length
      ? lesson.assigned_student_ids
      : metadata.assignedStudents || metadata.assigned_students;
    if (Array.isArray(assignedStudents) && assignedStudents.length > 0) {
      return assignedStudents.map((assignedStudent: unknown) => {
        const identifier = typeof assignedStudent === "string"
          ? assignedStudent
          : typeof assignedStudent === "object" && assignedStudent !== null
            ? String((assignedStudent as Record<string, unknown>).id || (assignedStudent as Record<string, unknown>).token || (assignedStudent as Record<string, unknown>).name || "")
            : "";
        return students.find((student) => student.id === identifier || student.token === identifier)?.name || identifier;
      }).filter(Boolean);
    }

    const assignedStudentId = getSavedStudentId(lesson);
    const assignedStudentName = students.find((student) => student.id === assignedStudentId || student.token === assignedStudentId)?.name;
    return assignedStudentName || assignedStudentId ? [assignedStudentName || assignedStudentId!] : [];
  };

  const renderAssignedStudents = (lesson: LessonWithVersion) => {
    const names = getAssignedStudentNames(lesson);
    if (names.length === 0) return <span className="text-stone-500">Not assigned</span>;
    const label = names[0] === "All Students"
      ? names[0]
      : names.length > 1
        ? `${names[0]} +${names.length - 1} more`
        : names[0];
    return <span className="group relative inline-flex min-w-0 flex-1">
      <span className="min-w-0 truncate rounded-md border border-[#394252] bg-[#0c1017] px-2 py-1 text-[11px] text-stone-300">{label}</span>
      {(names.length > 1 || names[0] === "All Students") && <span role="tooltip" className="pointer-events-none invisible absolute left-0 top-full z-20 mt-2 w-56 rounded-md border border-[#394252] bg-[#171d28] p-2 text-[11px] leading-relaxed text-stone-300 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">{names[0] === "All Students" ? "Available to every student" : names.join(", ")}</span>}
    </span>;
  };

  const refreshLessonListAfterAssignment = async (updatedLesson: LessonWithVersion) => {
    setCreatedLessons((current) => current.map((item) => item.id === updatedLesson.id ? updatedLesson : item));
    await refreshCreatedLessons();
    window.dispatchEvent(new Event("fluentia:lesson-updated"));
  };

  const logAssignmentError = (context: string, error: unknown) => {
    const supabaseError = error && typeof error === "object" ? error as { code?: string; message?: string; details?: string; hint?: string; status?: number } : undefined;
    const message = error instanceof Error
      ? error.message
      : supabaseError?.message
        || (typeof error === "string" ? error : "Unknown assignment error");
    console.error(context, {
      code: supabaseError?.code,
      message,
      details: supabaseError?.details,
      hint: supabaseError?.hint,
      status: supabaseError?.status,
    });
  };

  const reviewPendingSubmission = (pendingSubmission: PendingReviewSubmission) => {
    const student = students.find((candidate) =>
      candidate.id === pendingSubmission.studentId || candidate.token === pendingSubmission.studentId,
    );
    if (!student) {
      setPendingSubmissionError("The student for this submission could not be found.");
      return;
    }
    const lesson = createdLessons.find((candidate) => candidate.id === pendingSubmission.lessonId);
    if (lesson) {
      activateLesson(lesson);
    } else {
      activeLessonIdRef.current = pendingSubmission.lessonId;
      setDatabaseLessonId(pendingSubmission.lessonId);
      setNewLesson((previous) => ({ ...previous, slug: pendingSubmission.lessonId }));
    }
    setSelectedStudentId(student.id);
    setReviewSubmissionId(pendingSubmission.id);
    setReviewSubmissionLessonId(pendingSubmission.lessonId);
    setNewLesson((previous) => ({ ...previous, studentId: student.id }));
    setWorkstationState((previous) => ({
      ...previous,
      submission: pendingSubmission.submission,
      studentProfile: student.profile,
      evaluation: { scores: { task: 4, coherence: 4, lexical: 3, grammar: 4 }, comments: "", criterionFeedback: {}, published: false },
    }));
    setActiveTab("evaluation");
  };

  const handleAssignStudent = async (lesson: LessonWithVersion, studentId: string) => {
    const normalizedStudentId = studentId.trim();
    if (!lesson.id.trim() || !normalizedStudentId) {
      setPublishStatus("Select a valid lesson and student before assigning.");
      return;
    }
    try {
      const updatedLesson = await assignLessonToStudent(lesson.id.trim(), normalizedStudentId);
      await refreshLessonListAfterAssignment(updatedLesson);
      setPublishStatus("Lesson assigned to the selected student.");
    } catch (error) {
      logAssignmentError("Lesson assignment failed:", error);
      setPublishStatus("Lesson assignment failed. Check the assignment details and try again.");
    }
  };

  const getAssignedStudentIds = (lesson: LessonWithVersion) => {
    if (lesson.assigned_student_ids) return lesson.assigned_student_ids;
    return getAssignedStudentNames(lesson)
      .map((name) => students.find((student) => student.name === name)?.id)
      .filter((id): id is string => Boolean(id));
  };

  const handleAssignmentToggle = async (lesson: LessonWithVersion, studentId: string) => {
    const currentIds = getAssignedStudentIds(lesson);
    const nextIds = currentIds.includes(studentId)
      ? currentIds.filter((id) => id !== studentId)
      : [...currentIds, studentId];
    try {
      await refreshLessonListAfterAssignment(await setLessonAssignments(lesson.id, nextIds));
      setPublishStatus(nextIds.length ? "Lesson assignments updated." : "Lesson unassigned.");
    } catch (error) {
      logAssignmentError("Lesson assignments update failed:", error);
      setPublishStatus("Lesson assignments update failed. Check the assignment details and try again.");
    }
  };

  const localStudentResourcesKey = (studentToken: string) => `fluentia:student-resources:${studentToken}`;

  const readStudentResourcesLocally = (studentToken: string): StudentResourceEntry[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(localStudentResourcesKey(studentToken));
      return raw ? (JSON.parse(raw) as StudentResourceEntry[]) : [];
    } catch {
      return [];
    }
  };

  const writeStudentResourcesLocally = (studentToken: string, resources: StudentResourceEntry[]) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(localStudentResourcesKey(studentToken), JSON.stringify(resources));
    } catch {
      // Ignore local storage quota issues.
    }
  };

  const loadStudentResources = async (student: StudentUser | null, lessonId: string | null) => {
    if (!student || !lessonId) {
      setStudentResources([]);
      return;
    }
    const studentToken = student.token || student.id;
    const localFallback = () => {
      const localResources = readStudentResourcesLocally(studentToken).filter((item) => item.lesson_id === lessonId);
      setStudentResources(localResources);
    };

    try {
      const { data, error } = await supabase
        .from("student_resources")
        .select("*")
        .eq("student_id", student.id)
        .eq("lesson_id", lessonId);
      if (error) throw error;

      const nextResources = ((data || []) as StudentResourceEntry[]).sort((left, right) => {
        const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
        return rightTime - leftTime;
      });
      setStudentResources(nextResources);
      writeStudentResourcesLocally(studentToken, nextResources);
    } catch (error) {
      console.warn("Student resources unavailable; using local fallback:", error);
      localFallback();
    }
  };

  const handleResourceFileSelection = (file: File | undefined) => {
    if (!file) return;
    if (!getSupportedResourceMediaType(file)) {
      setResourceFile(null);
      setResourceStatus("Choose an image, text document, PDF, audio, or video file.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setResourceFile(null);
      setResourceStatus("Files must be 50 MB or smaller.");
      return;
    }
    setResourceFile(file);
    setResourceStatus(null);
    setResourceDraft((previous) => ({
      ...previous,
      title: previous.title.trim() ? previous.title : file.name.replace(/\.[^.]+$/, ""),
    }));
  };

  const addFlashcardToDeck = () => {
    if (!resourceDraft.question.trim() || !resourceDraft.answer.trim()) {
      setResourceStatus("Add both a front and a back before adding this card to the deck.");
      return;
    }
    const card: FlashcardItem = {
      id: crypto.randomUUID(),
      front: resourceDraft.question.trim(),
      back: resourceDraft.answer.trim(),
      ...(resourceDraft.explanation.trim() ? { explanation: resourceDraft.explanation.trim() } : {}),
    };
    setResourceDraft((previous) => ({
      ...previous,
      cards: [...previous.cards, card],
      question: "",
      answer: "",
      explanation: "",
    }));
    setResourceQuestionHtml("");
    setResourceAnswerHtml("");
    setResourceExplanationHtml("");
    setDraftFlashcardFlipped(false);
    setResourceStatus(`Card added to this deck (${resourceDraft.cards.length + 1} total).`);
  };

  const editStudentResource = (resource: StudentResourceEntry) => {
    const type: ResourceEditorType = resource.resource_type === "flashcards" ? "flashcard" : resource.resource_type;
    setEditingStudentResourceId(resource.id);
    setResourceDraft({
      ...EMPTY_RESOURCE_DRAFT,
      type,
      title: resource.title,
      body: resource.body || "",
      linkUrl: resource.link_url || "",
      cards: getResourceFlashcards(resource).map((card) => ({ ...card })),
    });
    setResourceBodyHtml(resource.body || "");
    setResourceQuestionHtml("");
    setResourceAnswerHtml("");
    setResourceExplanationHtml("");
    setResourceInputMode(resource.link_url ? "url" : "upload");
    setAudioFile(null);
    setResourceFile(null);
    setResourceStatus(null);
    setActiveTab("builder");
    window.setTimeout(() => document.getElementById("student-resource-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const cancelStudentResourceEdit = () => {
    setEditingStudentResourceId(null);
    setResourceDraft(EMPTY_RESOURCE_DRAFT);
    setResourceBodyHtml("");
    setResourceQuestionHtml("");
    setResourceAnswerHtml("");
    setResourceExplanationHtml("");
    setAudioFile(null);
    setResourceFile(null);
    setResourceStatus(null);
  };

  const saveStudentResource = async () => {
    const resolvedStudent = selectedStudent ?? (selectedStudentId ? students.find((student) => student.id === selectedStudentId) ?? null : null);
    const resolvedLessonId = resourceLessonId || databaseLessonId || null;
    if (!resolvedStudent) {
      setResourceStatus("Select a student in Lesson Details before saving a resource.");
      return;
    }
    if (!resolvedLessonId) {
      setResourceStatus("Save the lesson draft first so the current builder lesson has an active lesson ID.");
      return;
    }

    const trimmedTitle = resourceDraft.title.trim();
    if (!trimmedTitle) {
      setResourceStatus("Add a title before saving this resource.");
      return;
    }
    const resourceType = resourceDraft.type;
    const resourceBeingEdited = editingStudentResourceId
      ? studentResources.find((resource) => resource.id === editingStudentResourceId) || null
      : null;
    if (editingStudentResourceId && !resourceBeingEdited) {
      setResourceStatus("This resource is no longer available. Refresh the list and try again.");
      return;
    }
    const resetDraftAfterSave = () => {
      setResourceDraft({ ...EMPTY_RESOURCE_DRAFT, type: resourceType });
      setResourceQuestionHtml("");
      setResourceAnswerHtml("");
      setResourceExplanationHtml("");
      setDraftFlashcardFlipped(false);
      setEditingStudentResourceId(null);
    };

    if (resourceType === "flashcard" && resourceDraft.cards.length === 0) {
      setResourceStatus("Add at least one card to the deck before saving it.");
      return;
    }
    if (resourceType === "flashcard" && (resourceDraft.question.trim() || resourceDraft.answer.trim() || resourceDraft.explanation.trim())) {
      setResourceStatus("Add the current front and back to the deck before saving the resource.");
      return;
    }

    const mediaUploadFile = resourceType === "audio" ? audioFile : resourceFile;
    const usesMediaUrl = ["reading", "audio", "file", "image", "video"].includes(resourceType)
      && Boolean(resourceDraft.linkUrl.trim())
      && !(resourceInputMode === "upload" && mediaUploadFile);
    const usesMediaUpload = ["reading", "audio", "file", "image", "video"].includes(resourceType)
      && resourceInputMode === "upload"
      && Boolean(mediaUploadFile);

    if (resourceType === "reading" && !resourceDraft.linkUrl.trim() && !resourceDraft.body.trim() && !resourceFile) {
      setResourceStatus("Add a link or reading notes for this resource.");
      return;
    }

    if (resourceType === "data_table" && !resourceDraft.body.trim()) {
      setResourceStatus("Add content before saving this Data Table.");
      return;
    }

    if (["audio", "file", "image", "video"].includes(resourceType) && !usesMediaUrl && !usesMediaUpload) {
      setResourceStatus(`Add a ${resourceType} URL or choose a file to upload.`);
      return;
    }

    if (usesMediaUrl && !getResourcePreviewHref(resourceDraft.linkUrl)) {
      setResourceStatus("Enter a valid external URL starting with http:// or https://.");
      return;
    }

    const resourceFileMediaType = usesMediaUpload && mediaUploadFile ? getSupportedResourceMediaType(mediaUploadFile) : null;
    if (usesMediaUpload && mediaUploadFile && !resourceFileMediaType) {
      setResourceStatus("Choose a supported image, document, audio, or video file.");
      return;
    }

    if (resourceType === "audio" && usesMediaUpload && !resourceFileMediaType?.startsWith("audio/")) {
      setResourceStatus("Choose a valid audio file.");
      return;
    }
    if (resourceType === "image" && usesMediaUpload && !resourceFileMediaType?.startsWith("image/")) {
      setResourceStatus("Choose a valid image file.");
      return;
    }
    if (resourceType === "video" && usesMediaUpload && !resourceFileMediaType?.startsWith("video/")) {
      setResourceStatus("Choose a valid video file.");
      return;
    }

    if (usesMediaUpload && mediaUploadFile && mediaUploadFile.size > 50 * 1024 * 1024) {
      setResourceStatus("Files must be 50 MB or smaller.");
      return;
    }

    const studentToken = resolvedStudent.token || resolvedStudent.id;
    const storedResourceType: StudentResourceType = resourceType === "flashcard" ? "flashcards" : resourceType;
    let resourceFileStoragePath: string | null = null;
    let oldFileCleanupFailed = false;
    try {
      let resourceUrl = resourceDraft.linkUrl.trim();
      if (usesMediaUpload && mediaUploadFile && resourceFileMediaType) {
        const safeFileName = mediaUploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        resourceFileStoragePath = `${resolvedStudent.id}/${resolvedLessonId}/${crypto.randomUUID()}-${safeFileName}`;
        const { error: uploadError } = await supabase.storage.from("student-resources").upload(resourceFileStoragePath, mediaUploadFile, {
          contentType: resourceFileMediaType,
          upsert: false,
        });
        if (uploadError) {
          setResourceStatus("Media upload failed. Check the student-resources bucket permissions and try again.");
          return;
        }
        resourceUrl = supabase.storage.from("student-resources").getPublicUrl(resourceFileStoragePath).data.publicUrl;
      }
      const payload = {
        student_id: resolvedStudent.id,
        student_token: studentToken,
        lesson_id: resolvedLessonId,
        type: storedResourceType,
        resource_type: storedResourceType,
        title: trimmedTitle,
        updated_at: new Date().toISOString(),
        body: ["note", "reading", "quiz", "audio", "data_table"].includes(resourceType)
          ? resourceDraft.body.trim() || null
          : null,
        link_url: ["reading", "audio", "file", "image", "video"].includes(resourceType)
          ? resourceUrl || null
          : null,
        ...(["reading", "audio", "file", "image", "video"].includes(resourceType)
          ? {
              original_filename: usesMediaUpload && mediaUploadFile
                ? mediaUploadFile.name
                : resourceBeingEdited?.original_filename || null,
              media_type: usesMediaUpload
                ? resourceFileMediaType
                : resourceBeingEdited?.media_type || null,
            }
          : {}),
        ...(resourceType === "flashcard"
          ? {
              cards: resourceDraft.cards.map((card) => ({ ...card })),
              question: null,
              answer: null,
              explanation: null,
            }
          : {}),
      } as Pick<StudentResourceEntry, "student_id" | "student_token" | "lesson_id" | "resource_type" | "title">
        & Partial<Pick<StudentResourceEntry, "type" | "body" | "link_url" | "question" | "answer" | "explanation" | "cards" | "original_filename" | "media_type">>
        & { updated_at: string };

      if (resourceBeingEdited?.id.startsWith("local-")) {
        const savedResource = { ...resourceBeingEdited, ...payload } as StudentResourceEntry;
        const next = studentResources.map((resource) => resource.id === resourceBeingEdited.id ? savedResource : resource);
        setStudentResources(next);
        writeStudentResourcesLocally(studentToken, next);
        resetDraftAfterSave();
        setAudioFile(null);
        setResourceFile(null);
        setResourceStatus("Resource updated for the selected student.");
        return;
      }

      const writeRequest = resourceBeingEdited
        ? supabase
            .from("student_resources")
            .update(payload)
            .eq("id", resourceBeingEdited.id)
            .eq("student_id", resolvedStudent.id)
        : supabase
            .from("student_resources")
            .insert(payload);
      const { data, error } = await writeRequest
        .select()
        .abortSignal(AbortSignal.timeout(8000))
        .single();

      if (error) {
        if (resourceFileStoragePath) {
          await supabase.storage.from("student-resources").remove([resourceFileStoragePath]);
          resourceFileStoragePath = null;
        }
        if (!resourceBeingEdited && (error.code === "PGRST205" || /does not exist|42P01/i.test(error.message || ""))) {
          if (resourceType === "file" || resourceType === "image" || resourceType === "video") throw new Error("Apply migration 028 before saving image and video resources.");
          const localEntry: StudentResourceEntry = {
            id: `local-${Date.now()}`,
            ...payload,
            created_at: new Date().toISOString(),
          };
          const next = [localEntry, ...readStudentResourcesLocally(studentToken)];
          setStudentResources(next);
          writeStudentResourcesLocally(studentToken, next);
          resetDraftAfterSave();
          setAudioFile(null);
          setResourceFile(null);
          setResourceStatus("Resource saved locally because the student_resources table is not available yet.");
          return;
        }
        if (error.code === "PGRST204" && /original_filename|media_type/i.test(error.message || "")) {
          throw new Error("Apply migration 022 before saving uploaded media resources.");
        }
        if (resourceType === "flashcard" && (
          error.code === "23514"
          || (error.code === "PGRST204" && /cards/i.test(error.message || ""))
        )) {
          throw new Error("Apply migration 029 before saving flashcard decks.");
        }
        if ((resourceType === "image" || resourceType === "video") && error.code === "23514") {
          throw new Error("Apply migration 028 before saving image and video resources.");
        }
        throw error;
      }

      const savedResource = {
        ...payload,
        ...data,
        id: data?.id || resourceBeingEdited?.id || `local-${Date.now()}`,
        created_at: data?.created_at || resourceBeingEdited?.created_at || new Date().toISOString(),
        updated_at: data?.updated_at || new Date().toISOString(),
      } as StudentResourceEntry;
      const next = resourceBeingEdited
        ? studentResources.map((resource) => resource.id === resourceBeingEdited.id ? savedResource : resource)
        : [savedResource, ...studentResources];
      setStudentResources(next);
      writeStudentResourcesLocally(studentToken, next);
      if (resourceBeingEdited && resourceFileStoragePath && resourceBeingEdited.link_url) {
        try {
          const oldUrl = new URL(resourceBeingEdited.link_url);
          const prefix = "/storage/v1/object/public/student-resources/";
          const prefixIndex = oldUrl.pathname.indexOf(prefix);
          if (prefixIndex >= 0) {
            const oldPath = decodeURIComponent(oldUrl.pathname.slice(prefixIndex + prefix.length));
            if (oldPath) {
              const { error: cleanupError } = await supabase.storage.from("student-resources").remove([oldPath]);
              if (cleanupError) throw cleanupError;
            }
          }
        } catch (cleanupError) {
          console.error("Replaced student resource file cleanup failed:", cleanupError);
          oldFileCleanupFailed = true;
        }
      }
      resetDraftAfterSave();
      setAudioFile(null);
      setResourceFile(null);
      setResourceStatus(oldFileCleanupFailed
        ? "Resource updated, but its previous stored file could not be removed."
        : resourceBeingEdited ? "Resource updated for the selected student." : "Resource saved to the selected student.");
    } catch (error: any) {
      if (resourceFileStoragePath) {
        await supabase.storage.from("student-resources").remove([resourceFileStoragePath]);
      }
      console.error("Full Student resource save error:", error);
      const errorObject = error && typeof error === "object" ? error as Record<string, unknown> : null;
      let serializedError = "";
      if (errorObject) {
        try {
          serializedError = JSON.stringify(errorObject) || "";
        } catch {
          serializedError = "";
        }
      }
      const fallbackMessage = errorObject ? "Unknown Supabase error" : String(error || "Unknown save error");
      const message =
        (typeof errorObject?.message === "string" && errorObject.message) ||
        (typeof errorObject?.error_description === "string" && errorObject.error_description) ||
        (serializedError && serializedError !== "{}" ? serializedError : fallbackMessage);
      console.error("Student resource save failed:", message);
      setResourceStatus(`Resource save failed: ${message}`);
    }
  };

  const deleteStudentResource = async (resource: StudentResourceEntry) => {
    const resolvedStudent = selectedStudent ?? (selectedStudentId ? students.find((student) => student.id === selectedStudentId) ?? null : null);
    if (!resolvedStudent) return;
    const studentToken = resolvedStudent.token || resolvedStudent.id;

    if (resource.id.startsWith("local-")) {
      const next = studentResources.filter((item) => item.id !== resource.id);
      setStudentResources(next);
      writeStudentResourcesLocally(studentToken, next);
      return;
    }

    const { error } = await supabase
      .from("student_resources")
      .delete()
      .eq("id", resource.id)
      .eq("student_id", resolvedStudent.id);

    if (error) {
      console.error("Student resource delete failed:", error.message);
      setResourceStatus("Resource could not be deleted. Check the Supabase permissions and try again.");
      return;
    }

    const next = studentResources.filter((item) => item.id !== resource.id);
    setStudentResources(next);
    writeStudentResourcesLocally(studentToken, next);
    if (resource.storage_path || resource.link_url) {
      try {
        let storageBucket = "student-resources";
        let storagePath = resource.storage_path || "";
        if (!storagePath && resource.link_url) {
          const resourceUrl = new URL(resource.link_url);
          const bucketName = ["student-resources", "lesson-audio"].find((bucket) => resourceUrl.pathname.includes(`/storage/v1/object/public/${bucket}/`));
          if (bucketName) {
            storageBucket = bucketName;
            storagePath = decodeURIComponent(resourceUrl.pathname.split(`/storage/v1/object/public/${bucketName}/`)[1] || "");
          }
        }
        if (storagePath) {
          const { error: storageError } = await supabase.storage.from(storageBucket).remove([storagePath]);
          if (storageError) throw storageError;
        }
      } catch (error) {
        console.error("Student resource file cleanup failed:", error);
        setResourceStatus("Resource deleted, but its stored file could not be removed.");
        return;
      }
    }
    setResourceStatus("Resource deleted.");
  };

  const handleAssignmentChange = async (lesson: LessonWithVersion, value: string) => {
    if (value === "__all_active__") {
      await handleAssignAllStudents(lesson);
      return;
    }
    if (value === "__unassign__") {
      await handleUnassignLesson(lesson);
      return;
    }
    await handleAssignStudent(lesson, value);
  };

  const handleAssignAllStudents = async (lesson: LessonWithVersion) => {
    try {
      await refreshLessonListAfterAssignment(await assignLessonToAllActiveStudents(lesson.id));
      setPublishStatus("Lesson assigned to all active students.");
    } catch (error) {
      logAssignmentError("Bulk lesson assignment failed:", error);
      setPublishStatus("Bulk lesson assignment failed. Check the assignment details and try again.");
    }
  };

  const handleUnassignLesson = async (lesson: LessonWithVersion) => {
    try {
      await refreshLessonListAfterAssignment(await unassignLesson(lesson.id));
      setPublishStatus("Lesson unassigned.");
    } catch (error) {
      logAssignmentError("Lesson unassignment failed:", error);
      setPublishStatus("Lesson unassignment failed. Check the assignment details and try again.");
    }
  };

  useEffect(() => {
    if (reviewSubmissionId || !databaseLessonId || students.length === 0) return;
    const currentLesson = createdLessons.find((lesson) => lesson.id === databaseLessonId);
    if (!currentLesson) return;
    const savedStudentId = getSavedStudentId(currentLesson);
    if (!savedStudentId) return;
    const matchingStudent = students.find(
      (student) => student.id === savedStudentId
    );
    if (!matchingStudent) return;
    setSelectedStudentId(matchingStudent.id);
    setNewLesson((previous) => ({ ...previous, studentId: matchingStudent.id }));
  }, [databaseLessonId, createdLessons, students, reviewSubmissionId]);

  async function handleCreateLesson() {
    const draftStudentId = selectedStudentId || newLesson.studentId || selectedStudent?.id || "";
    const student = students.find((item) => item.id === draftStudentId)
      || (selectedStudent?.id === draftStudentId ? selectedStudent : null);
    const title = newLesson.title.trim() || "Untitled Lesson";
    const slug = newLesson.slug.trim().toLowerCase() || `draft-${Date.now()}`;
    const moduleNumber = Number(newLesson.moduleNumber) || 1;
    const assignedStudentId = student?.id;
    const assignedStudentToken = student?.token;

    try {
      const content = {
        ...workstationState.content,
        slug,
        title,
        subtitle: newLesson.subtitle.trim() || "A new Fluentia learning journey.",
        moduleNumber,
        level: normalizeCefrLevel(newLesson.level),
        tags: { ...newLesson.tags, custom: parseCustomLessonTags(newLesson.customTagsText) },
        domain: newLesson.tags.domain,
        skill_focus: newLesson.tags.skill_focus,
        practice_type: newLesson.tags.practice_type,
        ...(assignedStudentId ? { student_id: assignedStudentId } : {}),
        ...(assignedStudentToken ? { student_token: assignedStudentToken } : {}),
        coverImage: workstationState.bannerUrl,
        bannerUrl: workstationState.bannerUrl,
        bannerPosition: workstationState.bannerPosition,
        bannerDimness: workstationState.bannerDimness,
        sidebarBlocks: sidebarBlocksByStep,
      instructorGuidance: newLesson.instructorGuidance,
      lessonResources,
      };
      const created = await createLesson({
        title,
        banner_url: workstationState.bannerUrl,
        student_id: student?.id || null,
        ...(student?.token ? { student_token: student.token } : {}),
        instructor_id: instructorId,
        grade: normalizeCefrLevel(newLesson.level),
        tags: { ...newLesson.tags, custom: parseCustomLessonTags(newLesson.customTagsText) },
        status: "draft",
        instructor_note: newLesson.instructorGuidance,
        content,
        changes_summary: "Initial lesson created in Lesson Builder",
      });
      const lesson = created;
      bindLesson(lesson);
      if (student) setSelectedStudentId(student.id);
      setNewLesson((previous) => ({ ...previous, studentId: student?.id || "", title: lesson.title, slug, moduleNumber: String(moduleNumber), status: "draft" }));
      setWorkstationState((previous) => ({ ...previous, content: created.content || previous.content }));
      setDatabaseLessonId(created.id);
      activeLessonIdRef.current = created.id;
      hasLoadedLesson.current = true;
      setSaveIndicator("saved");
      await refreshCreatedLessons();
      setValidationErrors({});
      setLessonStatus("draft");
      setPublishStatus(`Lesson '${lesson.title}' created successfully as draft.`);
    } catch (error) {
      const details = error && typeof error === "object" ? error as { code?: string; message?: string; details?: string; hint?: string; status?: number } : undefined;
      console.error("Lesson creation failed:", {
        code: details?.code,
        message: error instanceof Error ? error.message : details?.message || String(error),
        details: details?.details,
        hint: details?.hint,
        status: details?.status,
      });
      setPublishStatus("Lesson creation failed. Check the Supabase connection and try again.");
    }
  }

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    workstationMountedRef.current = true;
    return () => {
      workstationMountedRef.current = false;
      window.setTimeout(() => {
        if (workstationMountedRef.current) return;
        saveRequestId.current += 1;
        pendingAutoSave.current = false;
        activeLessonIdRef.current = null;
        hasLoadedLesson.current = false;
        resetStore();
      }, 0);
    };
  }, [resetStore]);

  useEffect(() => {
    void refreshCreatedLessons();
  }, []);

  useEffect(() => {
    const syncLessonFromUrl = () => {
      const editId = readEditLessonQuery();
      const previousEditId = lastEditQueryRef.current;
      lastEditQueryRef.current = editId;
      if (!editId) {
        if (activeTab === "builder" && previousEditId) resetBuilderState();
        if (window.location.pathname.endsWith("/builder") && activeTab !== "builder") {
          resetBuilderState();
          setActiveTab("builder");
        }
        return;
      }
      const requestedLesson = createdLessons.find((lesson) =>
        lesson.id === editId || lesson.slug === editId || lesson.content?.slug === editId,
      );
      if (requestedLesson && requestedLesson.id !== databaseLessonId) {
        activateLesson(requestedLesson);
        setActiveTab("builder");
      } else if (!requestedLesson && databaseLessonId) {
        resetBuilderState();
      }
    };
    syncLessonFromUrl();
    window.addEventListener("popstate", syncLessonFromUrl);
    return () => window.removeEventListener("popstate", syncLessonFromUrl);
  }, [createdLessons, activeTab, databaseLessonId]);

  useEffect(() => {
    if (databaseLessonId && !hasLoadedLesson.current) return;
    if (lastSavedDraftSignature.current === null) {
      lastSavedDraftSignature.current = currentDraftSignature;
      setIsDirty(false);
      return;
    }
    const draftIsDirty = currentDraftSignature !== lastSavedDraftSignature.current;
    setIsDirty(draftIsDirty);
    if (draftIsDirty) setShowSuccessCheck(false);
  }, [currentDraftSignature, databaseLessonId]);

  useEffect(() => {
    if (!databaseLessonId || !hasLoadedLesson.current) return;
    const draftSignature = currentDraftSignature;
    if (lastSavedDraftSignature.current === null) {
      lastSavedDraftSignature.current = draftSignature;
      setIsDirty(false);
      return;
    }
    if (lastSavedDraftSignature.current === draftSignature) {
      setIsDirty(false);
      return;
    }
    setIsDirty(true);
    const saveAfterInactivity = () => {
      autoSaveTimer.current = null;
      const elapsed = Date.now() - lastInputAt.current;
      if (elapsed < 3000) {
        autoSaveTimer.current = window.setTimeout(saveAfterInactivity, 3000 - elapsed);
        return;
      }
      void saveLessonChanges(newLesson.status === "published" ? "published" : "draft", true);
    };
    autoSaveTimer.current = window.setTimeout(saveAfterInactivity, 5000);
    return () => {
      if (autoSaveTimer.current !== null) window.clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    };
  }, [currentDraftSignature, databaseLessonId, newLesson.status]);

  useEffect(() => {
    if (saveIndicator !== "saved") return;
    savedIndicatorTimer.current = window.setTimeout(() => {
      savedIndicatorTimer.current = null;
      setSaveIndicator((current) => current === "saved" ? "idle" : current);
    }, 2000);
    return () => {
      if (savedIndicatorTimer.current !== null) window.clearTimeout(savedIndicatorTimer.current);
      savedIndicatorTimer.current = null;
    };
  }, [saveIndicator]);

  useEffect(() => {
    if (!showSuccessCheck) return;
    const timer = window.setTimeout(() => setShowSuccessCheck(false), 2000);
    return () => window.clearTimeout(timer);
  }, [showSuccessCheck]);

  useEffect(() => {
    const handleInput = () => {
      lastInputAt.current = Date.now();
      if (inputTimer.current) window.clearTimeout(inputTimer.current);
      inputTimer.current = window.setTimeout(() => { inputTimer.current = null; }, 3000);
    };
    document.addEventListener("input", handleInput, true);
    return () => {
      document.removeEventListener("input", handleInput, true);
      if (inputTimer.current) window.clearTimeout(inputTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!publishStatus) return;
    const timer = window.setTimeout(() => setPublishStatus(null), 3000);
    return () => window.clearTimeout(timer);
  }, [publishStatus]);

  useEffect(() => {
    let cancelled = false;
    const loadCounts = async () => {
      setStudentsLoading(true);
      setStudentsError(null);
      try {
        const [pendingResult, publishedResult, draftsResult] = await Promise.allSettled([
          supabase.from("submissions").select("id, lesson_id, student_id, status, submitted_at, answers").in("status", ["submitted", "pending_evaluation", "completed"]).order("submitted_at", { ascending: false }),
          supabase.from("lessons").select("id", { count: "exact", head: true }).eq("status", "published"),
          supabase.from("lessons").select("id", { count: "exact", head: true }).eq("status", "draft"),
        ]);
        const logCountError = (label: string, result: PromiseSettledResult<{ count: number | null; error: { code?: string; message: string; details?: string; hint?: string } | null }>) => {
          if (result.status === "rejected") {
            console.error(`Failed to load ${label} count:`, result.reason);
          } else if (result.value.error) {
            console.error(`Failed to load ${label} count:`, {
              code: result.value.error.code,
              message: result.value.error.message,
              details: result.value.error.details,
              hint: result.value.error.hint,
            });
          }
        };
        logCountError("published lesson", publishedResult);
        logCountError("draft lesson", draftsResult);
        if (pendingResult.status === "rejected") {
          console.error("Failed to load pending submissions:", pendingResult.reason);
          setPendingSubmissionError("Pending submissions could not be loaded.");
        } else if (pendingResult.value.error) {
          console.error("Failed to load pending submissions:", {
            code: pendingResult.value.error.code,
            message: pendingResult.value.error.message,
            details: pendingResult.value.error.details,
            hint: pendingResult.value.error.hint,
          });
          setPendingSubmissionError(pendingResult.value.error.message);
        } else {
          const latestByStudentLesson = new Map<string, PendingReviewSubmission>();
          for (const row of pendingResult.value.data || []) {
            const key = `${row.student_id}:${row.lesson_id}`;
            if (latestByStudentLesson.has(key)) continue;
            const answers = row.answers && typeof row.answers === "object"
              ? row.answers as Partial<StudentSubmission>
              : {};
            if (answers.status === "in_progress") continue;
            latestByStudentLesson.set(key, {
              id: row.id,
              lessonId: row.lesson_id,
              studentId: row.student_id,
              submittedAt: row.submitted_at,
              submission: {
                status: answers.status === "pending_evaluation" || row.status === "pending_evaluation" || row.status === "completed" ? "pending_evaluation" : "submitted",
                listeningAnswers: answers.listeningAnswers || {},
                readingAnswers: answers.readingAnswers || {},
                writingText: answers.writingText || "",
                writing_responses: answers.writing_responses || {},
                speakingAudioUrl: answers.speakingAudioUrl,
                blockResponses: answers.blockResponses || {},
                quizSelections: answers.quizSelections || {},
                audioUploads: answers.audioUploads || {},
                submittedAt: row.submitted_at || undefined,
              },
            });
          }
          const nextPendingSubmissions = [...latestByStudentLesson.values()];
          setPendingSubmissions(nextPendingSubmissions);
          setPendingSubmissionCount(nextPendingSubmissions.length);
          setPendingSubmissionError(null);
        }
        const studentDirectory = await getStudentDirectory();
        if (cancelled) return;
        if (pendingResult.status === "fulfilled" && !pendingResult.value.error && pendingResult.value.count !== null) {
          setPendingSubmissionCount(pendingResult.value.count);
        }
        if (publishedResult.status === "fulfilled" && !publishedResult.value.error && publishedResult.value.count !== null) {
          setPublishedLessonCount(publishedResult.value.count);
        }
        if (draftsResult.status === "fulfilled" && !draftsResult.value.error && draftsResult.value.count !== null) {
          setDraftLessonCount(draftsResult.value.count);
        }
        const nextStudents: StudentUser[] = deduplicateStudents(studentDirectory)
          .filter((student) => student.name.trim() !== "Navid Kabazi")
          .map((student) => ({
            id: student.id,
            token: student.token,
            name: student.name,
            email: student.email,
            enrolledDate: student.enrolledDate,
            role: "student",
            profile: student.profile,
          }));
        setStudents(nextStudents);
        if (nextStudents.length > 0 && (!selectedStudentId || !nextStudents.some((student) => student.id === selectedStudentId))) {
          setSelectedStudentId(nextStudents[0].id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load students";
        if (!cancelled) {
          setStudentsError(message);
          console.error("Instructor workstation student loading failed:", message);
        }
      } finally {
        if (!cancelled) setStudentsLoading(false);
      }
    };
    const refreshCounts = () => void loadCounts();
    const refreshCountsFromStorage = (event: StorageEvent) => {
      if (event.key === "fluentia:data-updated") refreshCounts();
    };
    void loadCounts();
    window.addEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshCounts);
    window.addEventListener("fluentia:lesson-updated", refreshCounts);
    window.addEventListener("storage", refreshCountsFromStorage);
    return () => {
      cancelled = true;
      window.removeEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshCounts);
      window.removeEventListener("fluentia:lesson-updated", refreshCounts);
      window.removeEventListener("storage", refreshCountsFromStorage);
    };
  }, []);

  useEffect(() => {
    if (!selectedStudent || !resourceLessonId) {
      setStudentResources([]);
      return;
    }
    void loadStudentResources(selectedStudent, resourceLessonId);
  }, [selectedStudent?.id, selectedStudent?.token, resourceLessonId]);

  const flashcards = collectStudentFlashcards(studentResources);

  useEffect(() => {
    if (activeTab !== "resources" || flashcards.length === 0) return;
    const updateIndex = (nextIndex: number) => {
      setFlashcardIndex(Math.max(0, Math.min(nextIndex, flashcards.length - 1)));
      setFlashcardFlipped(false);
      setShowFlashcardExplanation(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.code === "Space") {
        event.preventDefault();
        setFlashcardFlipped((current) => !current);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        updateIndex(flashcardIndex + 1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateIndex(flashcardIndex - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, flashcards.length, flashcardIndex]);

  const clearValidationError = (field: keyof typeof validationErrors) => {
    setValidationErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const setLessonTitle = (title: string) => {
    clearValidationError("title");
    setNewLesson((previous) => ({ ...previous, title }));
  };
  const setSlug = (slug: string) => {
    clearValidationError("slug");
    setNewLesson((previous) => ({ ...previous, slug }));
  };

  const saveLessonChanges = async (status: "draft" | "published", isAutoSave = false, isPublishAction = false) => {
    const selectedLessonId = databaseLessonId;
    if (selectedLessonId && activeLessonIdRef.current !== selectedLessonId) return;
    if (isAutoSave && saveInFlight.current) {
      pendingAutoSave.current = true;
      return;
    }
    saveInFlight.current = true;
    const title = newLesson.title.trim() || "Untitled Lesson";
    const slug = newLesson.slug.trim().toLowerCase() || `draft-${Date.now()}`;
    const moduleNumber = Number(newLesson.moduleNumber) || 1;
    const studentId = selectedStudentId || newLesson.studentId || selectedStudent?.id || "";
    if (isPublishAction) {
      const errors: typeof validationErrors = {};
      if (!studentId) errors.selectedStudentId = "Select a student.";
      if (!newLesson.title.trim()) errors.title = "Enter a lesson title.";
      else if (newLesson.slug.trim() && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newLesson.slug.trim().toLowerCase())) errors.slug = "Use lowercase letters, numbers, and hyphens only.";
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        setPublishStatus("Fix the highlighted fields before publishing.");
        saveInFlight.current = false;
        return;
      }
    }
    setValidationErrors({});
    setSaveIndicator("saving");
    setShowSuccessCheck(false);
    if (!isAutoSave) setIsPublishing(true);
    const assignedStudent = students.find(
      (student) => student.id === studentId
    ) || (selectedStudent?.id === studentId ? selectedStudent : null);
    if (status === "published" && !assignedStudent?.id) {
      setSaveIndicator("error");
      setValidationErrors({ selectedStudentId: "Select a valid student before publishing." });
      setPublishStatus("Select a valid student before publishing.");
      if (!isAutoSave) setIsPublishing(false);
      saveInFlight.current = false;
      return;
    }
    const content = {
      ...workstationState.content,
      slug,
      title,
      subtitle: newLesson.subtitle.trim() || "A new Fluentia learning journey.",
      moduleNumber,
      level: normalizeCefrLevel(newLesson.level),
      tags: { ...newLesson.tags, custom: parseCustomLessonTags(newLesson.customTagsText) },
      domain: newLesson.tags.domain,
      skill_focus: newLesson.tags.skill_focus,
      practice_type: newLesson.tags.practice_type,
      ...(assignedStudent ? { student_id: assignedStudent.id, student_token: assignedStudent.token } : {}),
      coverImage: workstationState.bannerUrl,
      bannerUrl: workstationState.bannerUrl,
      bannerPosition: workstationState.bannerPosition,
      bannerDimness: workstationState.bannerDimness,
      sidebarBlocks: sidebarBlocksByStep,
      instructorGuidance: newLesson.instructorGuidance,
      lessonResources,
    };
    const requestId = ++saveRequestId.current;
    let saveSucceeded = false;
    try {
      if (selectedLessonId && editorLesson?.id !== selectedLessonId) {
        throw new Error("The active lesson identity is not synchronized with the database record");
      }
      const lesson = selectedLessonId
        ? await updateLesson(selectedLessonId, {
          title,
          subtitle: newLesson.subtitle.trim() || "A new Fluentia learning journey.",
          module_number: moduleNumber,
          banner_url: workstationState.bannerUrl,
            ...(assignedStudent ? { student_id: assignedStudent.id, student_token: assignedStudent.token } : {}),
            instructor_id: instructorId,
            status,
            grade: normalizeCefrLevel(newLesson.level),
            tags: { ...newLesson.tags, custom: parseCustomLessonTags(newLesson.customTagsText) },
            is_published: status === "published",
            instructor_note: newLesson.instructorGuidance,
            instructor_guidance: newLesson.instructorGuidance,
            content,
            changes_summary: `Lesson updated as ${status}`,
          })
        : await createLesson({
            title,
            banner_url: workstationState.bannerUrl,
            ...(assignedStudent ? { student_id: assignedStudent.id, student_token: assignedStudent.token } : {}),
            instructor_id: instructorId,
            status,
            grade: normalizeCefrLevel(newLesson.level),
            tags: { ...newLesson.tags, custom: parseCustomLessonTags(newLesson.customTagsText) },
            is_published: status === "published",
            instructor_note: newLesson.instructorGuidance,
            content,
            changes_summary: `Initial lesson created as ${status}`,
          });
      const savedSlug = typeof lesson.content?.slug === "string" ? lesson.content.slug : slug;
      if (requestId !== saveRequestId.current || activeLessonIdRef.current !== selectedLessonId) return;
      saveSucceeded = true;
      const savedDraftSignature = getDraftSignature(
        workstationState.content,
        newLesson.title,
        newLesson.subtitle,
        newLesson.moduleNumber,
        savedSlug,
      );
      lastSavedDraftSignature.current = savedDraftSignature;
      const draftIsDirty = currentDraftSignatureRef.current !== savedDraftSignature;
      setIsDirty(draftIsDirty);
      setShowSuccessCheck(!draftIsDirty);
      if (currentDraftSignatureRef.current === savedDraftSignature) {
        if (autoSaveTimer.current !== null) window.clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = null;
      }
      setDatabaseLessonId(lesson.id);
      activeLessonIdRef.current = lesson.id;
      bindLesson(lesson);
      setNewLesson((previous) => ({
        ...previous,
        studentId,
        title,
        slug: savedSlug,
        moduleNumber: String(moduleNumber),
        status,
      }));
      setWorkstationState((previous) => ({
        ...previous,
        bannerUrl: workstationState.bannerUrl,
        bannerPosition: workstationState.bannerPosition,
        bannerDimness: workstationState.bannerDimness,
      }));
      hasLoadedLesson.current = true;
      await refreshCreatedLessons();
      window.dispatchEvent(new Event("fluentia:lesson-updated"));
      setLessonStatus(status);
      setSaveIndicator("saved");
      let assignmentSyncWarning = "";
      if (status === "published" && assignedStudent?.id) {
        try {
          await publishLessonAndAssign(lesson.id, assignedStudent.id, instructorId);
        } catch (assignmentError) {
          const assignmentDetails = assignmentError && typeof assignmentError === "object"
            ? assignmentError as { code?: string; message?: string; details?: string; hint?: string }
            : undefined;
          console.error("Lesson saved, but assignment sync failed:", {
            code: assignmentDetails?.code,
            message: assignmentError instanceof Error ? assignmentError.message : assignmentDetails?.message || String(assignmentError),
            details: assignmentDetails?.details,
            hint: assignmentDetails?.hint,
          });
          assignmentSyncWarning = " Assignment sync needs attention.";
        }
      }
      console.log("Lesson saved successfully", { lessonId: lesson.id, status });
      if (!isAutoSave) setPublishStatus(`Lesson saved as ${status}.${assignmentSyncWarning || " Synced with student view."}`);
    } catch (error) {
      if (requestId !== saveRequestId.current || activeLessonIdRef.current !== selectedLessonId) return;
      console.error("Lesson save failed raw:", JSON.stringify(error, Object.getOwnPropertyNames(error)), error);
      const details = error && typeof error === "object"
        ? error as { code?: string; message?: string; details?: string; hint?: string; status?: number }
        : undefined;
      console.error("Lesson save failed:", {
        code: details?.code,
        message: error instanceof Error ? error.message : details?.message || String(error),
        details: details?.details,
        hint: details?.hint,
        status: details?.status,
      });
      if (status === "published") {
        console.error(
          "Publish Error Detail:",
          error instanceof Error ? error.message : details?.message || String(error),
          details?.details,
          details?.hint,
        );
      }
      setSaveIndicator("error");
      if (!isAutoSave) setPublishStatus("Lesson save failed. Check the Supabase connection and try again.");
    } finally {
      if (requestId === saveRequestId.current) {
        saveInFlight.current = false;
        if (!isAutoSave) setIsPublishing(false);
        pendingAutoSave.current = false;
        if (saveSucceeded && currentDraftSignatureRef.current !== lastSavedDraftSignature.current) {
          window.setTimeout(() => {
            void saveLessonChangesRef.current?.(status, true);
          }, 0);
        }
      }
    }
  };

  saveLessonChangesRef.current = saveLessonChanges;

  const handleSaveDraft = () => {
    console.log("Saving lesson...", { ...newLesson, content: workstationState.content });
    void saveLessonChanges(lessonStatus);
  };

  const openQuickTagEditor = (lesson: LessonWithVersion) => {
    const content = (lesson.content || {}) as Record<string, any>;
    const tags = normalizeLessonTags(lesson.tags, content);
    setQuickTagError(null);
    setQuickTagEditor({
      lessonId: lesson.id,
      level: normalizeCefrLevel(lesson.grade || content.level || content.cefrLevel),
      tags,
      customTagsText: tags.custom.join(", "),
    });
  };

  const saveQuickTagEditor = async () => {
    if (!quickTagEditor) return;
    const lesson = createdLessons.find((item) => item.id === quickTagEditor.lessonId);
    if (!lesson) return;
    const tags = { ...quickTagEditor.tags, custom: parseCustomLessonTags(quickTagEditor.customTagsText) };
    const lessonFields = lesson as LessonWithVersion & { image_url?: string | null; banner?: string | null };
    const lessonContent = (lesson.content || {}) as Record<string, unknown>;
    const bannerUrl = [
      lesson.banner_url,
      lessonFields.image_url,
      lessonFields.banner,
      lessonContent.coverImage,
      lessonContent.bannerUrl,
      lessonContent.banner_url,
      lessonContent.image_url,
      lessonContent.banner,
    ].find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
    const content = {
      ...(lesson.content || {}),
      ...(bannerUrl ? {
        coverImage: bannerUrl,
        bannerUrl,
        banner_url: bannerUrl,
        image_url: bannerUrl,
        banner: bannerUrl,
      } : {}),
      level: normalizeCefrLevel(quickTagEditor.level),
      tags,
      domain: tags.domain,
      skill_focus: tags.skill_focus,
      practice_type: tags.practice_type,
    };
    setQuickTagSaving(true);
    setQuickTagError(null);
    try {
      const updatedLesson = await updateLesson(lesson.id, {
        grade: normalizeCefrLevel(quickTagEditor.level),
        tags,
        ...(bannerUrl ? { banner_url: bannerUrl } : {}),
        content,
        changes_summary: "Lesson level and tags updated",
      });
      setCreatedLessons((current) => current.map((item) => item.id === updatedLesson.id
        ? {
            ...updatedLesson,
            banner_url: updatedLesson.banner_url || bannerUrl || item.banner_url,
            content: {
              ...(updatedLesson.content || {}),
              ...(bannerUrl ? {
                coverImage: bannerUrl,
                bannerUrl,
                banner_url: bannerUrl,
                image_url: bannerUrl,
                banner: bannerUrl,
              } : {}),
            },
            assigned_student_ids: item.assigned_student_ids || [],
          }
        : item));
      if (databaseLessonId === lesson.id && bannerUrl) {
        setWorkstationState((previous) => ({ ...previous, bannerUrl }));
      }
      window.dispatchEvent(new Event("fluentia:lesson-updated"));
      setQuickTagEditor(null);
    } catch (error) {
      const details = error && typeof error === "object"
        ? error as { code?: string; message?: string; details?: string; hint?: string }
        : undefined;
      console.error("Quick tag update failed:", {
        code: details?.code,
        message: error instanceof Error ? error.message : details?.message || String(error),
        details: details?.details,
        hint: details?.hint,
        raw: error && typeof error === "object"
          ? JSON.stringify(error, Object.getOwnPropertyNames(error))
          : String(error),
      });
      setQuickTagError(error instanceof Error ? error.message : details?.message || "Unable to save lesson tags.");
    } finally {
      setQuickTagSaving(false);
    }
  };

  const handleConfirmPublish = () => {
    void saveLessonChanges("published", false, true);
  };

  const handleUnpublish = () => {
    if (lessonStatus !== "published") return;
    void saveLessonChanges("draft");
  };

  const submissionState = workstationState.submission?.status === "reviewed" || workstationState.submission?.status === "evaluated" || workstationState.evaluation.published
    ? "Evaluated"
    : workstationState.submission?.status === "submitted" || workstationState.submission?.status === "pending_evaluation"
      ? "Pending Evaluation"
      : workstationState.submission?.status === "in_progress"
        ? "In Progress"
        : "Not Started";
  const submissionStateClass = submissionState === "Evaluated"
    ? "border-amber-500/40 bg-amber-500/20 text-amber-400"
    : submissionState === "Pending Evaluation"
      ? "border-amber-500/40 bg-amber-500/20 text-amber-400"
      : "border-[#394252] bg-[#171d28] text-stone-400";
  const submittedAnswers = workstationState.submission;
  const reviewContent = workstationState.content as Record<string, any>;
  const reviewStages: InstructorReviewStage[] = [
    { id: "warm_up", title: "Warm-up", prompt: reviewContent.warm_up?.intro_narrative?.text || reviewContent.warm_up?.quote?.text, tasks: [] },
    { id: "lesson", title: "Lesson", prompt: reviewContent.lesson?.core_concept?.text, tasks: [] },
    {
      id: "listening",
      title: "Listening",
      referenceText: reviewContent.listening?.transcript?.text?.trim() || undefined,
      referenceAudioUrl: reviewContent.listening?.audio_url?.trim() || undefined,
      tasks: [],
    },
    {
      id: "reading",
      title: "Reading",
      referenceText: reviewContent.reading?.article_markdown?.text?.trim()
        || reviewContent.reading?.mainArticle?.text?.trim()
        || reviewContent.mainArticle?.text?.trim()
        || undefined,
      tasks: [],
    },
    { id: "writing", title: "Writing", prompt: reviewContent.writing?.prompt?.text, tasks: [] },
    { id: "speaking", title: "Speaking", prompt: reviewContent.speaking?.scenario?.text, tasks: [] },
  ];
  const reviewQuestionText: Record<string, string> = {};
  const warmUpPrompt = getReviewPrompt(reviewContent.warm_up?.prompt?.text, reviewContent.warm_up?.intro_narrative?.text, reviewContent.warm_up?.quote?.text);
  const writingPrompt = getReviewPrompt(reviewContent.writing?.prompt?.text);
  const speakingPrompt = getReviewPrompt(
    reviewContent.speaking?.scenario?.text,
    ...(reviewContent.speaking?.discussion_points || []).map((point: { text?: string }) => point.text),
  );
  if (warmUpPrompt) reviewQuestionText.warm_up = stripReviewMarkdown(warmUpPrompt);
  if (writingPrompt) reviewQuestionText.writingText = stripReviewMarkdown(writingPrompt);
  if (speakingPrompt) reviewQuestionText.speaking = stripReviewMarkdown(speakingPrompt);
  const reviewModelAnswers: Record<string, string> = {};
  const reviewAutoCheckKeys = new Set<string>();
  const reviewStageForKey: Record<string, InstructorReviewStageId> = { warm_up: "warm_up", writingText: "writing", speaking: "speaking" };
  const addReviewReference = (stage: InstructorReviewStageId, key: string, question: string | undefined, answer?: string, shouldAutoCheck = Boolean(answer?.trim())) => {
    const prompt = getReviewPrompt(question);
    if (prompt) reviewQuestionText[key] = stripReviewMarkdown(prompt);
    reviewStageForKey[key] = stage;
    if (answer?.trim()) {
      reviewModelAnswers[key] = answer;
      if (shouldAutoCheck) reviewAutoCheckKeys.add(key);
    }
  };
  (reviewContent.listening?.questions || []).forEach((question: { id: string; question?: string; prompt?: string; title?: string; correct_answer?: string }) => {
    addReviewReference("listening", question.id, getReviewPrompt(question.prompt, question.title, question.question), question.correct_answer || reviewContent.results?.answer_keys?.listening?.[question.id]);
  });
  (reviewContent.reading?.analytical_questions || []).forEach((question: { id: string; question?: string; prompt?: string; title?: string; correct_answer?: string }) => {
    addReviewReference("reading", question.id, getReviewPrompt(question.prompt, question.title, question.question), question.correct_answer || reviewContent.results?.answer_keys?.reading?.[question.id]);
  });
  (reviewStages.map((stage) => stage.id)).forEach((step) => {
    (reviewContent[step]?.blocks || []).forEach((block: ContentBlock) => {
      if (block.type === "question") {
        const taskDefinition = block as unknown as { prompt?: string; question?: string };
        addReviewReference(step, block.id, getReviewPrompt(taskDefinition.prompt, taskDefinition.question, block.title), block.question_type === "open_ended" ? block.sample_answer : block.correct_answer, block.question_type !== "open_ended");
      } else if (block.type === "quiz") {
        block.questions.forEach((question) => {
          const taskDefinition = question as typeof question & { title?: string; question?: string };
          const questionText = getQuizQuestionPrompt(taskDefinition);
          const prompt = getReviewPrompt(questionText, taskDefinition.title, taskDefinition.question);
          if (question.type === "fill_in_the_blanks") {
            const parsedBlanks = parseFillInBlanks(questionText);
            const acceptableAnswers = question.acceptableAnswers?.length
              ? question.acceptableAnswers
              : parsedBlanks.map((blank) => [blank.answer]);
            const plainPrompt = questionText.replace(/\[([^\]]+)\]/g, "_____ ");
            parsedBlanks.forEach((blank, index) => addReviewReference(
              step,
              `${question.id}-blank-${index}`,
              `${plainPrompt} (Blank ${index + 1})`,
              acceptableAnswers[index]?.join(" / ") || blank.answer,
            ));
          } else {
            const answerKey = question.correct_answer
              || question.correctAnswer
              || question.sample_answer
              || reviewContent.results?.answer_keys?.[step]?.[question.id];
            const correctOptionIndex = question.type === "multiple_choice"
              ? (question.options || []).findIndex((option, index) => {
                const key = (answerKey || "").trim();
                return Boolean(key) && (option.trim() === key
                  || String.fromCharCode(65 + index).toLowerCase() === key.toLowerCase()
                  || String(index + 1) === key);
              })
              : -1;
            addReviewReference(
              step,
              question.id,
              prompt,
              correctOptionIndex >= 0
                ? question.options?.[correctOptionIndex]
                : answerKey,
              question.type !== "short_answer",
            );
          }
        });
      } else if (block.type === "fill-in-the-blanks") {
        block.acceptableAnswers.forEach((answers, index) => addReviewReference(step, `${block.id}-blank-${index}`, `${block.textWithBlanks.replace(/\[[^\]]+\]/g, "_____ ")} (Blank ${index + 1})`, answers.join(" / ")));
      } else if (block.type === "video" && block.reflection_prompt_text) {
        addReviewReference(step, `${block.id}-reflection`, block.reflection_prompt_text);
      } else if (block.type === "writing") {
        const taskDefinition = block as unknown as { prompt?: string; question?: string };
        addReviewReference(step, block.id, getReviewPrompt(taskDefinition.prompt, taskDefinition.question, block.title));
      } else if (block.type === "text" && (block.hasStudentResponseInput === true || block.studentResponseConfig?.enabled === true)) {
        const taskDefinition = block as ContentBlock & { prompt?: string; question?: string };
        addReviewReference(step, block.id, getReviewPrompt(taskDefinition.prompt, taskDefinition.question, block.title, reviewStages.find((stage) => stage.id === step)?.prompt));
      } else if (block.type === "audio" && block.allowStudentVoiceResponse) {
        const taskDefinition = block as ContentBlock & { prompt?: string; question?: string };
        addReviewReference(step, block.id, getReviewPrompt(taskDefinition.prompt, taskDefinition.question, block.title, reviewStages.find((stage) => stage.id === step)?.prompt));
      }
    });
  });
  const getDisplayQuestion = (key: string, fallbackStage: InstructorReviewStageId) => {
    if (reviewQuestionText[key]) return stripReviewMarkdown(reviewQuestionText[key]);
    const blankMatch = key.match(/-blank-(\d+)$/i);
    if (blankMatch) return `Fill in the blank #${Number(blankMatch[1]) + 1}`;
    return stripReviewMarkdown(/^[0-9a-f-]{32,}$/i.test(key) ? `${reviewStages.find((stage) => stage.id === fallbackStage)?.title || "Lesson"} prompt not provided` : key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
  };
  const addReviewAnswer = (stageId: InstructorReviewStageId, key: string, answer: string, audioUrl?: string, markedIsCorrect?: boolean) => {
    const stage = reviewStages.find((item) => item.id === stageId);
    if (!stage) return;
    const isUrl = /^(?:https?:|blob:|data:audio\/)/i.test(answer.trim());
    const modelAnswer = reviewModelAnswers[key];
    const normalizedStudentAnswer = normalizeReviewAnswer(answer);
    const isCorrect = typeof markedIsCorrect === "boolean"
      ? markedIsCorrect
      : modelAnswer && reviewAutoCheckKeys.has(key)
        ? modelAnswer.split(/[\/|]/).some((candidate) => normalizeReviewAnswer(candidate) === normalizedStudentAnswer)
        : undefined;
    stage.tasks.push({
      id: key,
      title: getDisplayQuestion(key, stageId),
      studentAnswer: audioUrl || isUrl ? "Audio response submitted" : answer,
      modelAnswer,
      isCorrect,
      autoCheck: reviewAutoCheckKeys.has(key),
      audioUrls: audioUrl || isUrl ? [audioUrl || answer] : undefined,
    });
  };
  if (submittedAnswers?.writingText?.trim()) addReviewAnswer("writing", "writingText", submittedAnswers.writingText);
  const appendAnswers = (answers: Record<string, string> | undefined, fallbackStage: InstructorReviewStageId) => {
    Object.entries(answers || {}).forEach(([key, answer]) => {
      if (!answer?.trim()) return;
      const stage = reviewStageForKey[key] || fallbackStage;
      addReviewAnswer(stage, key, answer);
    });
  };
  appendAnswers(submittedAnswers?.listeningAnswers, "listening");
  appendAnswers(submittedAnswers?.readingAnswers, "reading");
  appendAnswers(submittedAnswers?.writing_responses, "writing");
  appendAnswers(submittedAnswers?.blockResponses, "warm_up");
  appendAnswers(submittedAnswers?.quizSelections, "warm_up");
  Object.entries(submittedAnswers?.audioUploads || {}).forEach(([key, url]) => {
    if (!url?.trim()) return;
    const speakingBlock = reviewContent.speaking?.blocks?.some((block: ContentBlock) => block.id === key && block.type === "audio" && block.allowStudentVoiceResponse);
    const stage = reviewStageForKey[key] || (key === "speaking" || speakingBlock ? "speaking" : "warm_up");
    addReviewAnswer(stage, key, "Audio response submitted", url);
  });
  if (submittedAnswers?.speakingAudioUrl?.trim() && !reviewStages.some((stage) => stage.tasks.some((task) => task.audioUrls?.includes(submittedAnswers.speakingAudioUrl!)))) {
    addReviewAnswer("speaking", "speaking", "Audio response submitted", submittedAnswers.speakingAudioUrl);
  }

  const previewSteps = [
    ["warm_up", "Warm-up"],
    ["lesson", "Lesson"],
    ["listening", "Listening"],
    ["reading", "Reading"],
    ["writing", "Writing"],
    ["speaking", "Speaking"],
    ["results", "Results"],
  ] as const;
  const previewContent = previewStep==="results" ? undefined : workstationState.content[previewStep as Exclude<typeof previewStep,"results">] as Record<string, any> | undefined;
  const previewBlocks: ContentBlock[] = previewStep==="results" ? [] : Array.isArray(previewContent?.blocks)
    ? (previewContent.blocks as ContentBlock[]).filter((block: ContentBlock) => block.is_active !== false && block.enabled !== false)
    : [];
  const renderPreviewStep = () => {
    if (previewStep==="results") {
      const answerKeys: Record<string,string> = {};
      for (const k of ["warm_up","lesson","listening","reading"] as const) {
        const bs=((workstationState.content[k] as {blocks?:ContentBlock[]}|undefined)?.blocks||[]) as ContentBlock[];
        bs.forEach(b=>{ if(b.type==="question"&&b.correct_answer) answerKeys[b.id]=b.correct_answer; if(b.type==="quiz") (b.questions||[]).forEach(q=>{ const v=q.correct_answer||q.correctAnswer||""; if(v) answerKeys[q.id]=v; }); });
      }
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-500/40 bg-[#0c1017] p-4 text-sm text-stone-400">Results — correct answers as the student will see after submission.</div>
          {Object.keys(answerKeys).length? Object.entries(answerKeys).map(([id,ans])=><div key={id} className="rounded-lg border border-[#293343] bg-[#0c1017] p-3"><p className="text-xs text-stone-500">{id}</p><p className="text-sm text-amber-400">{ans}</p></div>) : <p className="text-xs text-stone-500">No answer keys configured.</p>}
        </div>
      );
    }
    const previewSidebarBlocks = sidebarBlocksByStep[previewStep as keyof SidebarBlocksByStep] || [];
    const linkedSidebarIds = new Set([
      ...previewSidebarBlocks.filter((sidebarBlock) => sidebarBlock.parentMainBlockId).map((sidebarBlock) => sidebarBlock.id),
      ...previewBlocks
        .filter((block) => block.layoutMode === "inline-row")
        .map((block) => block.sidebarBlockId || block.alignNextTo)
        .filter((id): id is string => Boolean(id)),
    ]);
    const topSidebarBlocks = previewSidebarBlocks.filter((sidebarBlock) => !linkedSidebarIds.has(sidebarBlock.id));
    return (
    <div className="w-full space-y-6">
      {previewBlocks.map((block: ContentBlock, blockIndex) => {
        const sidebarBlock = (sidebarBlocksByStep[previewStep as keyof SidebarBlocksByStep] || []).find((candidate) => candidate.parentMainBlockId === block.id)
          || (block.layoutMode === "inline-row" && (block.sidebarBlockId || block.alignNextTo)
            ? (sidebarBlocksByStep[previewStep as keyof SidebarBlocksByStep] || []).find((candidate) => candidate.id === (block.sidebarBlockId || block.alignNextTo))
            : undefined);
        const rowEmptyMode = block.rowEmptyMode || block.whenEmpty;
        const article = (
        <article key={block.id} className="rounded-xl border border-[#202631] bg-[#121721] p-5">
          {block.title && <h3 className="mb-3 font-sans text-xl font-semibold text-stone-100">{block.title}</h3>}
          {block.type === "text" && <>{<MarkdownContent value={block.body || ""} className="text-sm leading-relaxed text-stone-300" />}{block.hasStudentResponseInput === true && <textarea rows={6} placeholder="Write your response here..." readOnly className="mt-4 min-h-[140px] w-full resize-y rounded border border-[#394252] bg-[#171d28] p-3 text-sm text-stone-400" aria-label="Student response field preview" />}</>}
          {block.type === "image" && <>{block.imageUrl && <img src={block.imageUrl} alt={block.caption || block.title || "Lesson image"} className="max-h-72 w-full rounded-md object-cover" onError={(e)=>{(e.target as HTMLImageElement).style.display="none";}} />}{block.caption && <p className="mt-2 text-xs text-stone-500">{block.caption}</p>}</>}
          {block.type === "audio" && block.audioUrl && <CustomAudioPlayer src={block.audioUrl} label={block.title || "Audio lesson"} />}
          {block.type === "video" && <><InteractiveVideoBlock videoUrl={block.videoUrl} title={block.title || "Lesson video"} transcript={block.transcript} />{block.show_reflection_prompt !== false && block.reflection_prompt_text?.trim() && <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/20 p-4"><p className="text-sm font-semibold text-amber-400">Reflection Question</p><MarkdownContent value={block.reflection_prompt_text.trim()} className="mt-2 text-sm leading-relaxed text-stone-300" /><textarea rows={4} placeholder="Write your reflection here..." readOnly className="mt-3 w-full resize-y rounded border border-[#394252] bg-[#171d28] p-3 text-sm text-stone-400" aria-label="Reflection question response preview" /></div>}</>}
          {block.type === "resource" && block.resourceUrl && <a href={block.resourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/20 p-3 text-sm text-amber-400 hover:border-amber-500/40">Open document{block.description ? `: ${block.description}` : ""}</a>}
          {block.type === "question" && <ExerciseQuestions questions={[{ id: block.id, type: block.question_type === "open_ended" ? "short_answer" : "multiple_choice", prompt: block.prompt || "", options: block.options, correct_answer: block.correct_answer, sample_answer: block.sample_answer }]} readOnly />}
          {block.type === "quiz" && <ExerciseQuestions questions={block.questions || []} readOnly />}
          {block.type === "writing" && <WritingBlockRenderer block={block} isPreview />}
        </article>
        );
        return (
          <StudyRoomBlockRow
            fullWidth={block.layoutMode === "inline-row" && !sidebarBlock && rowEmptyMode === "full"}
            key={block.id}
            sidebar={(
              <>
                {blockIndex === 0 && topSidebarBlocks.map((sidebarItem) => (
                  <SidebarBlockCard key={sidebarItem.id} {...sidebarItem} />
                ))}
                {sidebarBlock && (
                  <SidebarBlockCard {...sidebarBlock} />
                )}
              </>
            )}
          >
            {article}
          </StudyRoomBlockRow>
        );
      })}
      {previewBlocks.length === 0 && <p className="rounded-lg border border-dashed border-[#394252] p-6 text-sm text-stone-500">This step has no content blocks yet.</p>}
    </div>
  );};

  const getLessonMetadata = (lesson: LessonWithVersion) => {
    const content = (lesson.content || {}) as Record<string, any>;
    const tags = normalizeLessonTags(lesson.tags, { ...content, domain: content.domain ?? lesson.subject });
    const hasStoredDomain = Object.prototype.hasOwnProperty.call(lesson.tags || {}, "domain")
      || Object.prototype.hasOwnProperty.call(content, "domain")
      || Object.prototype.hasOwnProperty.call(content, "topicDomain");
    return {
      level: normalizeCefrLevel(lesson.grade || content.level || content.cefrLevel),
      domain: hasStoredDomain ? tags.domain || "General" : lesson.subject || "General",
      theme: String(content.theme || content.lessonTheme || "Open practice"),
      skillFocus: tags.skill_focus || "Integrated skills",
      practiceType: tags.practice_type,
      customTags: tags.custom,
      subtitle: String(content.subtitle || lesson.subtitle || "No subtitle"),
    };
  };
  const getLibraryMetadataTags = (metadata: ReturnType<typeof getLessonMetadata>) => [
    { label: metadata.domain, className: "bg-sky-500/15 text-sky-300" },
    { label: metadata.theme, className: "bg-stone-500/15 text-stone-300" },
    { label: metadata.skillFocus, className: "bg-emerald-500/15 text-emerald-300" },
    ...(metadata.practiceType ? [{ label: metadata.practiceType, className: "bg-rose-500/15 text-rose-300" }] : []),
    ...metadata.customTags.map((tag) => ({ label: tag, className: "bg-stone-500/15 text-stone-300" })),
  ];
  const toggleLibraryMetadata = (lessonId: string) => {
    setExpandedLibraryMetadata((current) => {
      const next = new Set(current);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  };
  const filteredLibraryLessons = createdLessons.filter((lesson) => {
    const metadata = getLessonMetadata(lesson);
    const query = librarySearch.trim().toLowerCase();
    return (!query || lesson.title.toLowerCase().includes(query) || metadata.subtitle.toLowerCase().includes(query))
      && (libraryLevel === "all" || metadata.level.toUpperCase() === libraryLevel)
      && (libraryDomain === "all" || metadata.domain === libraryDomain);
  }).sort((first, second) => {
    const firstMetadata = getLessonMetadata(first);
    const secondMetadata = getLessonMetadata(second);
    const firstValue = librarySortBy === "title" ? first.title : firstMetadata[librarySortBy];
    const secondValue = librarySortBy === "title" ? second.title : secondMetadata[librarySortBy];
    return firstValue.localeCompare(secondValue, undefined, { sensitivity: "base" }) || first.title.localeCompare(second.title);
  });
  const libraryDomains = [...new Set(createdLessons.map((lesson) => getLessonMetadata(lesson).domain))].sort();
  const studentInstructorOptions = [...new Set(students
    .map((student) => student.profile.assignedInstructor?.trim())
    .filter((instructor): instructor is string => Boolean(instructor)))].sort((first, second) => first.localeCompare(second));
  const filteredStudentDirectory = students.filter((student) => (studentLevelFilter === "All"
    || normalizeStudentLevel(student.profile.targetLevel || student.profile.level) === studentLevelFilter)
    && (studentInstructorFilter === "All instructors" || student.profile.assignedInstructor?.trim() === studentInstructorFilter));
  const activeResourceType = resourceDraft.type;
  const resourceAccept = activeResourceType === "image"
    ? "image/*"
    : activeResourceType === "video"
      ? "video/*"
      : activeResourceType === "audio"
        ? "audio/*"
        : activeResourceType === "reading"
          ? "application/pdf,.pdf,.doc,.docx,.rtf,.odt"
          : undefined;

  if (!isMounted) return null;
  if (accessDenied) return <AccessCard title="Access Denied" message="Your instructor account does not have access to this workspace." />;

  const lessonEditorPanel = (
    <LessonTailorEditor
      key={databaseLessonId || "new-lesson"}
      content={workstationState.content}
      sidebarBlocksByStep={sidebarBlocksByStep}
      onActiveStepChange={setSidebarStep}
      onChange={(content: StrictStepContent) => setWorkstationState((previous) => ({ ...previous, content }))}
    />
  );
  const heroBannerPanel = (
    <details className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5" open={heroBannerOpen} onToggle={(event) => setHeroBannerOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-stone-200">
        <span className="flex min-w-0 items-center gap-2"><Image className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" /><span className="truncate">Hero Banner</span></span>
        <span className="flex shrink-0 items-center gap-3"><span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-300">16:9 · Dynamic Storage</span><ChevronDown className={`h-4 w-4 text-amber-400 transition-transform ${heroBannerOpen ? "rotate-180" : ""}`} aria-hidden="true" /></span>
      </summary>
      <div className="mt-4 border-t border-[#29303c] pt-4">
        <InstructorBannerManager
          bannerUrl={workstationState.bannerUrl}
          customInput={workstationState.customBannerUrl}
          position={workstationState.bannerPosition}
          dimness={workstationState.bannerDimness}
          embedded
          onUpdateBanner={(bannerUrl) => setWorkstationState((previous) => ({ ...previous, bannerUrl }))}
          onUpdatePosition={(bannerPosition) => setWorkstationState((previous) => ({ ...previous, bannerPosition }))}
          onUpdateDimness={(bannerDimness) => setWorkstationState((previous) => ({ ...previous, bannerDimness }))}
          onUpdateCustomInput={(customBannerUrl) => setWorkstationState((previous) => ({ ...previous, customBannerUrl }))}
        />
      </div>
    </details>
  );
  const sidebarEditorPanel = (
    <StepSidebarEditorPanel
      sidebarStep={sidebarStep}
      setSidebarStep={setSidebarStep}
      sidebarBlocksByStep={sidebarBlocksByStep}
      setSidebarBlocksByStep={setSidebarBlocksByStep}
      mainBlocks={((workstationState.content[sidebarStep] as { blocks?: ContentBlock[] } | undefined)?.blocks || []) as ContentBlock[]}
    />
  );

  return (
    <div className="min-h-screen w-full bg-[#0c1017] font-sans text-[#e8e7e4]">
      <div className={`${activeTab === "students" || activeTab === "instructors" ? "w-full max-w-full px-6" : "mx-auto w-full max-w-6xl px-4 sm:px-6"} py-6 md:py-8 ${activeTab === "builder" ? "pb-28" : ""}`}>
        <div className="mb-6 flex items-center">
          <img src="/logo.png" alt="Fluentia" className="h-10 w-auto object-contain" />
        </div>
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-[#202631] pb-4 md:flex-row md:items-center">
          <div>
<span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400">Fluentia Instructor Studio</span>
<h1 className="mt-2 font-sans text-2xl font-semibold text-[#f1eee8]">Instructor Workstation</h1>
</div>
          {activeTab === "builder" && <div className="flex min-w-0 flex-col items-stretch gap-2 md:items-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold ${lessonStatus === "published" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/20 text-amber-400"}`}><span className={`h-1.5 w-1.5 rounded-full ${lessonStatus === "published" ? "bg-emerald-400" : "bg-amber-500/20"}`} />{lessonStatus === "published" ? "Published" : "Draft"}</span>
              <button type="button" aria-pressed={isSplitPreviewOpen} onClick={() => setIsSplitPreviewOpen((open) => !open)} className={`rounded border px-2.5 py-1.5 text-[11px]  transition ${isSplitPreviewOpen ? "border-amber-500/40 bg-amber-500/20 text-amber-400" : "border-[#394252] bg-[#0c1017] text-stone-300 hover:border-amber-500/40 hover:text-stone-100"}`}>Split Preview</button>
              <button type="button" onClick={() => { window.open("/instructor/preview", "fluentia-student-live-preview"); }} className="rounded border border-[#394252] bg-[#0c1017] px-2.5 py-1.5 text-[11px]  text-stone-300 transition hover:border-amber-500/40 hover:text-stone-100">Pop-out Preview</button>
              <Tooltip content="Save the current lesson draft"><button type="button" onClick={handleSaveDraft} className="rounded-md bg-amber-500/20 px-3 py-2 text-xs  text-amber-400 transition hover:bg-amber-500/20">Save Changes</button></Tooltip>
              {lessonStatus === "published" ? <Tooltip content="Remove this lesson from student access"><button type="button" onClick={handleUnpublish} disabled={isPublishing || !databaseLessonId} className="rounded-md border border-[#394252] px-3 py-2 text-xs  text-stone-300 transition hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50">Unpublish</button></Tooltip> : <Tooltip content="Publish this lesson for students"><button type="button" onClick={handleConfirmPublish} disabled={isPublishing} className="rounded-md border border-[#394252] px-3 py-2 text-xs  text-stone-300 transition hover:border-amber-500/40 hover:text-amber-400 disabled:cursor-wait disabled:opacity-60">Publish</button></Tooltip>}
            </div>
            <div className="flex min-h-5 w-full max-w-xl justify-end gap-3 text-xs" aria-live="polite">
              {publishStatus && <span className="truncate text-amber-400">{publishStatus}</span>}
              {databaseLessonId && <span className={saveIndicator === "error" ? "text-red-300" : "text-stone-500"}>{saveIndicator === "saving" ? "Saving" : saveIndicator === "saved" ? "Saved" : saveIndicator === "error" ? "Save failed" : "Ready"}</span>}
            </div>
          </div>}
        </header>

        <nav className="sticky top-0 z-20 mb-8 border-b border-[#202631] bg-[#0c1017]/95 backdrop-blur" aria-label="Instructor workstation views">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap gap-x-1">
              {([["dashboard", "Dashboard"], ["students", "Students Directory"], ["instructors", "Instructors Directory"], ["library", "Lesson Library"], ["builder", "Lesson Builder"], ["evaluation", "Student Evaluation"], ["music", "Music Library"]] as const).map(([tab, label]) => <Tooltip key={tab} content={`Open ${label}`}><button type="button" onClick={() => handleWorkspaceTabChange(tab)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs  transition sm:px-4 ${activeTab === tab ? "border-amber-500/40 text-amber-400" : "border-transparent text-stone-500 hover:text-stone-200"}`}>{label}</button></Tooltip>)}
            </div>
            <Tooltip content="Display and appearance"><DisplaySettingsControl /></Tooltip>
          </div>
        </nav>

        {activeTab === "dashboard" && <section className="space-y-6" aria-label="Instructor dashboard overview">
          <div className="grid items-start gap-4 md:grid-cols-4">
            <button type="button" onClick={() => setActiveTab("evaluation")} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-left transition hover:border-amber-500/40">
<p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Pending Evaluations</p>
<p className="mt-2 text-2xl  text-stone-100">{pendingSubmissionCount}</p>
<p className="mt-1 text-xs text-stone-500">Student submissions awaiting review</p>
</button>
            <button type="button" onClick={() => handleWorkspaceTabChange("builder")} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-left transition hover:border-amber-500/40">
<p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Drafts</p>
<p className="mt-2 text-2xl  text-stone-100">{draftLessonCount}</p>
<p className="mt-1 text-xs text-stone-500">Open the lesson builder</p>
</button>
            <button type="button" onClick={() => handleWorkspaceTabChange("builder")} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-left transition hover:border-amber-500/40">
<p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Published Lessons</p>
<p className="mt-2 text-2xl  text-stone-100">{publishedLessonCount}</p>
<p className="mt-1 text-xs text-stone-500">Open the lesson builder</p>
</button>
            <details open={activeStudentsOpen} onToggle={(event) => setActiveStudentsOpen(event.currentTarget.open)} className="relative self-start rounded-xl border border-[#202631] bg-[#171d28]/60 text-left transition hover:border-amber-500/40">
              <summary className="flex cursor-pointer list-none items-start justify-between p-5 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-[10px] uppercase tracking-[0.14em] text-amber-400">Active Students</span>
                  <span className="mt-2 block text-2xl font-semibold text-stone-100">{students.length}</span>
                  <span className="mt-1 block text-xs text-stone-500">Select an active student</span>
                </span>
                <ChevronDown className={`mt-0.5 h-4 w-4 text-amber-400 transition-transform ${activeStudentsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </summary>
              <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-lg border border-[#394252] bg-[#171d28] p-3 shadow-2xl">
                <label className="sr-only" htmlFor="active-student-selector">Select active student</label>
                <select id="active-student-selector" value={selectedStudentId || ""} onChange={(event) => { const nextStudent = students.find((student) => student.id === event.target.value); if (nextStudent) { void handleStudentChange(nextStudent); setActiveStudentsOpen(false); } }} className="w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-white [color-scheme:dark]" aria-label="Select active student">
                  <option value="" className="bg-[#0c1017] text-white">{studentsLoading ? "Loading students..." : studentsError ? "Unable to load students" : students.length === 0 ? "No registered students" : "Choose a student"}</option>
                  {students.map((student) => <option key={student.id} value={student.id} className="bg-[#0c1017] text-white">{student.name}</option>)}
                </select>
              </div>
            </details>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
<div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
<h2 className="font-sans text-xl font-semibold text-stone-100">Pending Submissions</h2>
<p className="mt-3 text-sm text-stone-400">{pendingSubmissionCount > 0 ? "Submissions are awaiting review." : "No submissions are currently awaiting feedback."}</p>
{pendingSubmissionError && <p role="alert" className="mt-3 text-xs text-red-300">{pendingSubmissionError}</p>}
{pendingSubmissions.length > 0 && <ul className="mt-4 divide-y divide-[#29303c]">
  {pendingSubmissions.map((pendingSubmission) => {
    const studentName = students.find((student) => student.id === pendingSubmission.studentId || student.token === pendingSubmission.studentId)?.name || "Student";
    const lessonTitle = createdLessons.find((lesson) => lesson.id === pendingSubmission.lessonId)?.title || "Lesson submission";
    return <li key={pendingSubmission.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-stone-200">{studentName}</p>
        <p className="truncate text-xs text-stone-500">{lessonTitle}</p>
        {pendingSubmission.submittedAt && <p className="mt-1 text-[10px] text-stone-600">{new Date(pendingSubmission.submittedAt).toLocaleString()}</p>}
      </div>
      <button type="button" onClick={() => reviewPendingSubmission(pendingSubmission)} className="shrink-0 rounded-md border border-amber-500/40 px-3 py-2 text-xs  text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/20">Review</button>
    </li>;
  })}
</ul>}
</div>
<div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
<h2 className="font-sans text-xl font-semibold text-stone-100">Recent Activity</h2>
<p className="mt-3 text-sm text-stone-400">{selectedStudent ? `${selectedStudent.name} is the active student workspace.` : "Choose a student to open a workspace."}</p>
<button type="button" onClick={() => setActiveTab("evaluation")} className="mt-4 text-xs  text-amber-400 hover:text-amber-400">Review student work</button>
</div>
</div>
          {false && <section className="overflow-visible rounded-xl border border-[#202631] bg-[#171d28]/60" aria-labelledby="lesson-management-title">
            <div className="flex items-center justify-between gap-4 border-b border-[#202631] px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Lesson Management</p>
                <h2 id="lesson-management-title" className="mt-1 font-sans text-xl font-semibold text-stone-100">All Lessons</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-stone-500">{createdLessons.length} lessons</span>
                <button type="button" onClick={startNewLesson} className="rounded-md bg-amber-500/20 px-3 py-2 text-xs  text-amber-400 transition hover:bg-amber-500/20">Create New Lesson</button>
              </div>
            </div>
            <div className="overflow-visible">
              <table className="min-w-[980px] w-full table-fixed text-left text-xs">
                <colgroup>
                  <col className="w-[29%]" />
                  <col className="w-[25%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead className="border-b border-[#202631] bg-[#0c1017] text-[10px] uppercase tracking-[0.12em] text-stone-500">
                  <tr><th className="px-5 py-3 font-semibold">Lesson</th><th className="px-4 py-3 font-semibold">Assigned Students</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Module</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-[#202631]">
                  {createdLessons.map((lesson) => <tr key={lesson.id} onClick={() => handleEditLesson(lesson)} className="cursor-pointer text-stone-300 transition hover:bg-[#202631]/30">
                    <td className="min-w-0 px-5 py-4"><button type="button" onClick={() => handleEditLesson(lesson)} className="block min-w-0 max-w-full text-left"><p className="truncate  text-stone-100" title={lesson.title}>{lesson.title}</p><p className="mt-1 truncate text-[11px] text-stone-400" title={lesson.content?.subtitle || lesson.subtitle || "No subtitle"}>{lesson.content?.subtitle || lesson.subtitle || "No subtitle"}</p><p className="mt-1 truncate text-[10px] text-stone-600" title={lesson.content?.slug || lesson.id}>{lesson.content?.slug || lesson.id}</p></button></td>
                    <td className="min-w-0 px-4 py-4 text-stone-300" onClick={(event) => event.stopPropagation()}><div className="flex min-w-0 items-center gap-2">{renderAssignedStudents(lesson)}<Tooltip content="Assign lesson to a student"><select defaultValue="" onChange={(event) => void handleAssignmentChange(lesson, event.target.value)} aria-label={`Assign ${lesson.title} to a student`} className="w-[4.5rem] shrink-0 rounded-md border border-amber-500/40 bg-[#0c1017] px-2 py-1.5 text-[11px] text-white outline-none [color-scheme:dark]"><option value="" className="bg-[#0c1017] text-white">Assign</option><option value="__all_active__" className="bg-[#0c1017] text-white">All active</option>{getAssignedStudentNames(lesson).length > 0 && <option value="__unassign__" className="bg-[#0c1017] text-white">Unassign</option>}{students.map((student) => <option key={student.id} value={student.id} className="bg-[#0c1017] text-white">{student.name}</option>)}</select></Tooltip></div></td>
                    <td className="px-4 py-4"><span className={`rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${lesson.status === "published" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/20 text-amber-400"}`}>{lesson.status === "published" ? "Published" : "Draft"}</span></td>
                    <td className="px-4 py-4 text-stone-300">Module {lesson.content?.moduleNumber || lesson.module_number || 1}</td>
                    <td className="px-4 py-4"><div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => handleEditLesson(lesson)} className="whitespace-nowrap rounded-md border border-amber-500/40 px-3 py-2 text-xs  text-amber-400 hover:bg-amber-500/20 hover:text-amber-400">Edit / Continue</button>
                      <div className="relative">
                        <Tooltip content="More actions"><button type="button" onClick={() => setOpenLessonMenuId((current) => current === lesson.id ? null : lesson.id)} aria-label={`More actions for ${lesson.title}`} aria-expanded={openLessonMenuId === lesson.id} className="flex h-8 w-8 items-center justify-center rounded-md border border-[#394252] text-stone-300 hover:border-amber-500/40 hover:text-amber-400"><MoreVertical className="h-4 w-4" /></button></Tooltip>
                        {openLessonMenuId === lesson.id && <div className="absolute right-0 top-full z-50 mt-2 w-36 rounded-md border border-[#394252] bg-[#171d28] p-1 shadow-xl">
                          <button type="button" onClick={() => { duplicateLesson(lesson); setOpenLessonMenuId(null); }} className="block w-full rounded px-3 py-2 text-left text-xs text-stone-300 hover:bg-[#202631] hover:text-stone-100">Duplicate</button>
                          <button type="button" onClick={() => { setLessonPendingDelete(lesson); setOpenLessonMenuId(null); }} className="block w-full rounded px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/10">Delete</button>
                        </div>}
                      </div>
                    </div></td>
                  </tr>)}
                  {createdLessons.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-stone-500">No lessons have been created yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>}
        </section>}

        {activeTab === "library" && <section className="space-y-5" aria-labelledby="lesson-library-title">
          <div className="flex flex-col gap-4 rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Lesson Management</p><h2 id="lesson-library-title" className="mt-1 font-sans text-2xl font-semibold text-stone-100">Lesson Library</h2><p className="mt-1 text-sm text-stone-500">{filteredLibraryLessons.length} of {createdLessons.length} lessons</p></div>
              <Tooltip content="Start a new lesson draft"><button type="button" onClick={startNewLesson} className="rounded-md bg-amber-500/20 px-3 py-2 text-xs  text-amber-400 transition hover:bg-amber-500/20">Create New Lesson</button></Tooltip>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative min-w-0 flex-1"><span className="sr-only">Search lessons</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-500" /><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search by title or subtitle" className="w-full rounded-md border border-[#394252] bg-[#0c1017] py-2.5 pl-9 pr-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label>
              <Tooltip content="Filter lessons by CEFR level"><select value={libraryLevel} onChange={(event) => setLibraryLevel(event.target.value)} aria-label="Filter by level" className="rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-xs text-white [color-scheme:dark]"><option value="all">All levels</option>{CEFR_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></Tooltip>
              <Tooltip content="Filter lessons by subject domain"><select value={libraryDomain} onChange={(event) => setLibraryDomain(event.target.value)} aria-label="Filter by domain" className="rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-xs text-white [color-scheme:dark]"><option value="all">All domains</option>{libraryDomains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</select></Tooltip>
              <Tooltip content="Choose how matching lessons are sorted"><label><span className="sr-only">Sort lessons</span><select value={librarySortBy} onChange={(event) => setLibrarySortBy(event.target.value as typeof librarySortBy)} aria-label="Sort lessons by tag" className="rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-xs text-white [color-scheme:dark]"><option value="title">Sort: Title</option><option value="domain">Sort: Domain</option><option value="practiceType">Sort: Practice Type</option><option value="skillFocus">Sort: Skill Focus</option></select></label></Tooltip>
              <div className="flex rounded-md border border-[#394252] bg-[#0c1017] p-1" role="group" aria-label="Lesson view mode"><Tooltip content="Show lessons as cards"><button type="button" onClick={() => setLibraryView("grid")} aria-label="Grid view" className={`rounded p-1.5 ${libraryView === "grid" ? "bg-amber-500/20 text-amber-400" : "text-stone-500 hover:text-stone-200"}`}><Grid3X3 className="h-4 w-4" /></button></Tooltip><Tooltip content="Show lessons in a table"><button type="button" onClick={() => setLibraryView("table")} aria-label="Table view" className={`rounded p-1.5 ${libraryView === "table" ? "bg-amber-500/20 text-amber-400" : "text-stone-500 hover:text-stone-200"}`}><List className="h-4 w-4" /></button></Tooltip></div>
            </div>
          </div>
          {libraryView === "grid" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredLibraryLessons.map((lesson) => {
                const metadata = getLessonMetadata(lesson);
                const tags = getLibraryMetadataTags(metadata);
                const assignedIds = getAssignedStudentIds(lesson);
                return (
                  <article key={lesson.id} className="flex h-full flex-col rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 transition hover:border-amber-500/40">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => handleEditLesson(lesson)} className="min-w-0 text-left">
                        <h3 className="truncate text-stone-100">{lesson.title}</h3>
                        <p className="mt-1 min-h-8 line-clamp-2 text-xs leading-relaxed text-stone-500">{metadata.subtitle}</p>
                      </button>
                      <span className={`shrink-0 rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase ${lesson.status === "published" ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/40 text-amber-400"}`}>{lesson.status}</span>
                    </div>
                    <div className="mt-4">
                      <LessonMetadataDisclosure
                        lessonId={lesson.id}
                        lessonTitle={lesson.title}
                        level={metadata.level}
                        tags={tags}
                        expanded={expandedLibraryMetadata.has(lesson.id)}
                        onToggle={() => toggleLibraryMetadata(lesson.id)}
                      />
                      <button type="button" onClick={() => openQuickTagEditor(lesson)} aria-label={`Edit tags for ${lesson.title}`} className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300">
                        <Pencil className="h-3 w-3" />Edit level & tags
                      </button>
                    </div>
                    <div className="relative mt-auto border-t border-[#202631] pt-4" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap gap-1">
                          {assignedIds.length === 0 ? <span className="text-xs text-stone-500">No students assigned</span> : assignedIds.map((id) => {
                            const student = students.find((item) => item.id === id);
                            return <span key={id} title={student?.name || id} className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/20 text-[10px] font-semibold text-amber-400">{(student?.name || id).slice(0, 2).toUpperCase()}</span>;
                          })}
                        </div>
                        <button type="button" onClick={() => setAssignmentEditorLessonId((current) => current === lesson.id ? null : lesson.id)} className="rounded-md border border-amber-500/40 px-2.5 py-1.5 text-[11px] text-amber-400">Assign</button>
                      </div>
                      {assignmentEditorLessonId === lesson.id && <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-lg border border-[#394252] bg-[#171d28] p-3 shadow-xl">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Assign students</p>
                        {students.map((student) => <label key={student.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-stone-300 hover:bg-[#202631]">
                          <input type="checkbox" checked={assignedIds.includes(student.id)} onChange={() => void handleAssignmentToggle(lesson, student.id)} className="accent-amber-500" />
                          <span className="min-w-0 flex-1 truncate">{student.name}</span>
                          {assignedIds.includes(student.id) && <Check className="h-3.5 w-3.5 text-amber-400" />}
                        </label>)}
                        <button type="button" onClick={() => setAssignmentEditorLessonId(null)} className="mt-2 w-full rounded border border-[#394252] px-2 py-1.5 text-[11px] text-stone-400">Done</button>
                      </div>}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] text-stone-500">Module {lesson.content?.moduleNumber || lesson.module_number || 1}</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => handleEditLesson(lesson)} className="text-xs text-amber-400 hover:text-amber-300">Edit / Continue</button>
                        <Tooltip content="Delete lesson"><button type="button" onClick={() => setLessonPendingDelete(lesson)} aria-label={`Delete ${lesson.title}`} className="flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 text-red-300 transition hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></Tooltip>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="w-full overflow-x-auto rounded-xl border border-[#202631] bg-[#171d28]/60">
              <table className="min-w-[900px] w-full text-left text-xs">
                <thead className="border-b border-[#202631] bg-[#0c1017] text-[10px] uppercase tracking-[0.12em] text-stone-500">
                  <tr><th className="w-2/5 px-5 py-3">Lesson</th><th className="px-4 py-3">Metadata</th><th className="px-4 py-3">Assigned students</th><th className="px-4 py-3">Status</th><th className="min-w-[160px] px-4 py-3 text-right whitespace-nowrap">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-[#202631]">
                  {filteredLibraryLessons.map((lesson) => {
                    const metadata = getLessonMetadata(lesson);
                    const tags = getLibraryMetadataTags(metadata);
                    return (
                      <tr key={lesson.id} className="text-stone-300 hover:bg-[#202631]/30">
                        <td className="px-5 py-4 align-middle">
                          <button type="button" onClick={() => handleEditLesson(lesson)} className="block w-full min-w-0 text-left">
                            <p className="line-clamp-2 break-words text-stone-100" title={lesson.title}>{lesson.title}</p>
                            <p className="mt-1 line-clamp-2 break-words text-[11px] text-stone-500" title={metadata.subtitle}>{metadata.subtitle}</p>
                          </button>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <LessonMetadataDisclosure
                            lessonId={lesson.id}
                            lessonTitle={lesson.title}
                            level={metadata.level}
                            tags={tags}
                            expanded={expandedLibraryMetadata.has(lesson.id)}
                            compact
                            onToggle={() => toggleLibraryMetadata(lesson.id)}
                          />
                        </td>
                        <td className="px-4 py-4 align-middle">{renderAssignedStudents(lesson)}</td>
                        <td className="px-4 py-4 align-middle capitalize">{lesson.status}</td>
                        <td className="min-w-[160px] px-4 py-4 text-right align-middle">
                          <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                            <button type="button" onClick={() => openQuickTagEditor(lesson)} className="whitespace-nowrap text-xs text-amber-400">Edit tags</button>
                            <button type="button" onClick={() => handleEditLesson(lesson)} className="whitespace-nowrap text-xs text-amber-400">Edit</button>
                            <Tooltip content="Delete lesson"><button type="button" onClick={() => setLessonPendingDelete(lesson)} aria-label={`Delete ${lesson.title}`} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredLibraryLessons.length === 0 && <div className="rounded-xl border border-dashed border-[#394252] p-10 text-center text-sm text-stone-500">No lessons match these filters.</div>}
          {quickTagEditor && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !quickTagSaving) setQuickTagEditor(null); }}><section role="dialog" aria-modal="true" aria-labelledby="quick-tag-editor-title" className="w-full max-w-lg rounded-lg border border-[#394252] bg-[#171d28] p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Lesson metadata</p><h3 id="quick-tag-editor-title" className="mt-1 text-lg font-semibold text-stone-100">Edit level & tags</h3></div><button type="button" aria-label="Close tag editor" disabled={quickTagSaving} onClick={() => setQuickTagEditor(null)} className="rounded border border-[#394252] p-1.5 text-stone-400 hover:text-stone-100 disabled:opacity-50"><X className="h-4 w-4" /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs text-stone-400">CEFR Level<select value={quickTagEditor.level} onChange={(event) => setQuickTagEditor((current) => current ? { ...current, level: event.target.value } : current)} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-white [color-scheme:dark]">{CEFR_LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label><label className="text-xs text-stone-400">Domain<input value={quickTagEditor.tags.domain} onChange={(event) => setQuickTagEditor((current) => current ? { ...current, tags: { ...current.tags, domain: event.target.value } } : current)} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label><label className="text-xs text-stone-400">Skill Focus<input value={quickTagEditor.tags.skill_focus} onChange={(event) => setQuickTagEditor((current) => current ? { ...current, tags: { ...current.tags, skill_focus: event.target.value } } : current)} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label><label className="text-xs text-stone-400">Practice Type<input value={quickTagEditor.tags.practice_type} onChange={(event) => setQuickTagEditor((current) => current ? { ...current, tags: { ...current.tags, practice_type: event.target.value } } : current)} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label><label className="text-xs text-stone-400 sm:col-span-2">Custom Tags<input value={quickTagEditor.customTagsText} onChange={(event) => setQuickTagEditor((current) => current ? { ...current, customTagsText: event.target.value } : current)} placeholder="Comma-separated custom tags" className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label></div>{quickTagError && <p role="alert" className="mt-3 text-xs text-red-300">{quickTagError}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" disabled={quickTagSaving} onClick={() => setQuickTagEditor(null)} className="rounded-md border border-[#394252] px-3 py-2 text-xs text-stone-300 disabled:opacity-50">Cancel</button><button type="button" disabled={quickTagSaving} onClick={() => void saveQuickTagEditor()} className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-3 py-2 text-xs  text-amber-400 disabled:opacity-50">{quickTagSaving ? "Saving..." : <><Check className="h-3.5 w-3.5" />Save tags</>}</button></div></section></div>}
        </section>}

        {activeTab === "students" && <section className="w-full min-w-0 space-y-5" aria-labelledby="students-profile-title">
          {profileSaveToast && <div role="status" aria-live="polite" className="fixed right-6 top-6 z-[70] flex items-center gap-2.5 rounded-lg border border-emerald-400/40 bg-[#11251d] px-4 py-3 text-sm font-medium text-emerald-200 shadow-xl"><Check className="h-4 w-4 shrink-0" aria-hidden="true" />{profileSaveToast}</div>}
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#202631] pb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Student Directory</p>
              <h2 id="students-profile-title" className="mt-1 font-sans text-2xl font-semibold text-stone-100">Students Profile</h2>
              <p className="mt-1 text-sm text-stone-500">{filteredStudentDirectory.length} of {students.length} students</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-stone-400">
                <span>Level</span>
                <select value={studentLevelFilter} onChange={(event) => setStudentLevelFilter(event.target.value as typeof studentLevelFilter)} className="rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-xs text-white [color-scheme:dark]" aria-label="Filter students by level">
                  <option value="All">All levels</option>
                  {STUDENT_CEFR_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-stone-400">
                <span>Instructor</span>
                <select value={studentInstructorFilter} onChange={(event) => setStudentInstructorFilter(event.target.value)} className="max-w-[15rem] rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-xs text-white [color-scheme:dark]" aria-label="Filter students by instructor">
                  <option>All instructors</option>
                  {studentInstructorOptions.map((instructor) => <option key={instructor}>{instructor}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => { setAddStudentError(null); setIsAddStudentOpen(true); }} className="inline-flex h-10 items-center gap-2 rounded-md bg-amber-500/20 px-4 text-xs  text-amber-400 transition hover:bg-amber-500/20">
                <Plus className="h-4 w-4" aria-hidden="true" />Add Student
              </button>
            </div>
          </div>
          {isAddStudentOpen && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isAddingStudent) setIsAddStudentOpen(false); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="add-student-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[#394252] bg-[#141a23] p-5 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-4 border-b border-[#293343] pb-4">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Student Directory</p><h3 id="add-student-title" className="mt-1 text-xl font-semibold text-stone-100">Add Student</h3></div>
                <button type="button" onClick={() => setIsAddStudentOpen(false)} disabled={isAddingStudent} aria-label="Close add student dialog" className="rounded-md p-2 text-stone-400 transition hover:bg-white/5 hover:text-stone-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
              </div>
              <form onSubmit={(event) => void handleCreateStudent(event)} className="mt-5 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-medium text-stone-400">Full Name<input required maxLength={120} value={addStudentDraft.fullName} onChange={(event) => setAddStudentDraft((current) => ({ ...current, fullName: event.target.value }))} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-sm text-stone-200 outline-none focus:border-amber-500/40" /></label>
                  <label className="space-y-1.5 text-xs font-medium text-stone-400">Email<input required type="email" maxLength={254} value={addStudentDraft.email} onChange={(event) => setAddStudentDraft((current) => ({ ...current, email: event.target.value }))} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-sm text-stone-200 outline-none focus:border-amber-500/40" /></label>
                  <label className="space-y-1.5 text-xs font-medium text-stone-400">Current Level<select required value={addStudentDraft.currentLevel} onChange={(event) => setAddStudentDraft((current) => ({ ...current, currentLevel: event.target.value as StudentCefrLevel | "" }))} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-sm text-amber-400 outline-none [color-scheme:dark] focus:border-amber-500/40"><option value="" disabled>Select a level</option>{STUDENT_CEFR_LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label>
                  <label className="space-y-1.5 text-xs font-medium text-stone-400">Assigned Instructor<input value={addStudentDraft.assignedInstructor} onChange={(event) => setAddStudentDraft((current) => ({ ...current, assignedInstructor: event.target.value }))} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-sm text-stone-200 outline-none focus:border-amber-500/40" /></label>
                  <label className="space-y-1.5 text-xs font-medium text-stone-400">Focus Weaknesses<textarea value={addStudentDraft.focusWeaknesses} onChange={(event) => setAddStudentDraft((current) => ({ ...current, focusWeaknesses: event.target.value }))} placeholder="Separate with commas" className="min-h-20 w-full resize-y rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/40" /></label>
                  <label className="space-y-1.5 text-xs font-medium text-stone-400">Core Goal<textarea value={addStudentDraft.coreGoal} onChange={(event) => setAddStudentDraft((current) => ({ ...current, coreGoal: event.target.value }))} className="min-h-20 w-full resize-y rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/40" /></label>
                  <label className="space-y-1.5 text-xs font-medium text-stone-400 md:col-span-2">Dashboard Note<textarea value={addStudentDraft.dashboardNote} onChange={(event) => setAddStudentDraft((current) => ({ ...current, dashboardNote: event.target.value }))} className="min-h-24 w-full resize-y rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/40" /></label>
                </div>
                {addStudentError && <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{addStudentError}</p>}
                <div className="flex flex-col-reverse gap-3 border-t border-[#293343] pt-4 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setIsAddStudentOpen(false)} disabled={isAddingStudent} className="h-10 rounded-md border border-[#394252] px-4 text-xs  text-stone-300 transition hover:bg-white/5 disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={isAddingStudent} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-amber-500/20 px-4 text-xs  text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60">{isAddingStudent ? "Adding..." : "Add Student"}</button>
                </div>
              </form>
            </section>
          </div>}
          {studentsError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{studentsError}</p>}
          {studentsLoading ? <p className="py-10 text-center text-sm text-stone-500">Loading student profiles...</p> : filteredStudentDirectory.length > 0 ? <div className="w-full space-y-3">
            {filteredStudentDirectory.map((student) => {
              const isExpanded = expandedStudentIds.has(student.id);
              const level = normalizeStudentLevel(student.profile.targetLevel || student.profile.level);
              const saveMessage = profileSaveMessages[student.id];
              const isSaving = savingProfileStudentId === student.id;
              const isSaved = saveMessage === "Profile saved successfully!";
              const hasSaveError = Boolean(saveMessage) && !isSaved;
              return <article key={student.id} className="w-full overflow-hidden rounded-xl border border-[#293343] bg-[#141a23] shadow-sm shadow-black/10">
                <button type="button" onClick={() => toggleStudentProfile(student.id)} aria-expanded={isExpanded} aria-controls={`student-profile-${student.id}`} className="flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <span className="flex w-full min-w-0 flex-col gap-1.5 sm:flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="break-words text-sm  text-stone-100">{student.name}</span>
                      <span className={`rounded border px-2 py-0.5 text-[10px]  ${level ? "border-amber-500/40 bg-amber-500/20 text-amber-400" : "border-[#394252] text-stone-500"}`}>{level || "Not set"}</span>
                    </span>
                    <span className="break-all text-xs text-stone-400">{student.email || "No email"}</span>
                  </span>
                  <span className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-5">
                    <span className="inline-flex items-center gap-2 text-xs text-stone-400">
                      <span className={`h-2 w-2 rounded-full ${isSaving ? "animate-pulse bg-amber-500/20" : isSaved ? "bg-emerald-400" : hasSaveError ? "bg-rose-400" : "bg-stone-600"}`} />
                      {isSaving ? "Saving" : isSaved ? "Saved" : hasSaveError ? "Needs attention" : "Profile"}
                    </span>
                    <span className="text-right text-[11px] text-stone-500 sm:text-xs">{student.enrolledDate ? `Enrolled ${new Date(student.enrolledDate).toLocaleDateString()}` : "Date unavailable"}</span>
                    <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  </span>
                </button>
                <div id={`student-profile-${student.id}`} aria-hidden={!isExpanded} inert={!isExpanded} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="border-t border-[#293343] px-4 py-5 sm:px-5">
                      <div className="grid min-w-0 gap-5 md:grid-cols-2 2xl:grid-cols-3">
                        <section className="min-w-0 space-y-4" aria-label={`${student.name} identity and assignment`}>
                          <label className="block space-y-1.5 text-xs font-medium text-stone-400">Email address<input type="email" value={student.email ?? ""} onChange={(event) => updateDirectoryStudentProfile(student.id, { email: event.target.value })} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label>
                          <label className="block space-y-1.5 text-xs font-medium text-stone-400">Current Level<select value={level} onChange={(event) => void handleStudentLevelChange(student, event.target.value as StudentCefrLevel)} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-xs text-amber-400 [color-scheme:dark]">{!level && <option value="" disabled>Not set</option>}{STUDENT_CEFR_LEVELS.map((optionLevel) => <option key={optionLevel} value={optionLevel}>{optionLevel}</option>)}</select></label>
                          <label className="block space-y-1.5 text-xs font-medium text-stone-400">Assigned Instructor<input value={student.profile.assignedInstructor || ""} onChange={(event) => updateDirectoryStudentProfile(student.id, { assignedInstructor: event.target.value })} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label>
                        </section>
                        <section className="min-w-0 space-y-4" aria-label={`${student.name} goals and focus`}>
                          <label className="block space-y-1.5 text-xs font-medium text-stone-400">Focus Weaknesses<input value={(student.profile.weaknesses || []).join(", ")} onChange={(event) => updateDirectoryStudentProfile(student.id, { weaknesses: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="Separate with commas" className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label>
                          <label className="block space-y-1.5 text-xs font-medium text-stone-400">Core Goal<textarea value={student.profile.targetGoal || ""} onChange={(event) => updateDirectoryStudentProfile(student.id, { targetGoal: event.target.value })} rows={3} className="min-h-20 w-full resize-y rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label>
                        </section>
                        <section className="min-w-0 space-y-1.5 md:col-span-2 2xl:col-span-1" aria-label={`${student.name} dashboard note`}>
                          <label className="block text-xs font-medium text-stone-400">Dashboard Note</label>
                          <textarea value={student.profile.teacherNotes || ""} onChange={(event) => updateDirectoryStudentProfile(student.id, { teacherNotes: event.target.value })} rows={4} className="student-profile-note h-24 w-full resize-y overflow-x-hidden overflow-y-auto rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-xs leading-relaxed text-stone-200 outline-none focus:border-amber-500/40" />
                        </section>
                      </div>
                      <div className="mt-5 flex flex-col-reverse gap-3 border-t border-[#293343] pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-h-5 text-xs" role="status" aria-live="polite">
                          {saveMessage && <span className={isSaved ? "text-emerald-300" : "text-rose-300"}>{saveMessage}</span>}
                        </div>
                        <button type="button" onClick={(event) => void handleSaveDirectoryStudent(event, student)} disabled={isSaving} className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md bg-amber-500/20 px-4 text-xs  text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60">
                          {isSaving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" aria-hidden="true" />}
                          {isSaving ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>;
            })}
          </div> : <div className="rounded-xl border border-dashed border-[#394252] px-6 py-12 text-center text-sm text-stone-500">No student profiles match this level.</div>}
        </section>}

        {activeTab === "instructors" && <section className="w-full min-w-0 space-y-5" aria-labelledby="instructors-profile-title">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#202631] pb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Instructor Directory</p>
              <h2 id="instructors-profile-title" className="mt-1 font-sans text-2xl font-semibold text-stone-100">Instructors Profile</h2>
              <p className="mt-1 text-sm text-stone-500">{instructors.length} instructor{instructors.length === 1 ? "" : "s"}</p>
            </div>
            <button type="button" onClick={() => { setAddInstructorError(null); setIsAddInstructorOpen(true); }} className="inline-flex h-10 items-center gap-2 rounded-md bg-amber-500/20 px-4 text-xs  text-amber-400 transition hover:bg-amber-500/20"><Plus className="h-4 w-4" aria-hidden="true" />Add Instructor</button>
          </div>
          {instructorsError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{instructorsError}</p>}
          {instructorsLoading ? <p className="py-10 text-center text-sm text-stone-500">Loading instructor profiles...</p> : instructors.length > 0 ? <div className="w-full space-y-3">
            {instructors.map((instructor) => {
              const isExpanded = expandedInstructorIds.has(instructor.id);
              const isSaving = savingInstructorId === instructor.id;
              const saveMessage = instructorSaveMessages[instructor.id];
              const isSaved = saveMessage === "Instructor profile saved." || saveMessage === "Instructor placed on leave.";
              const updatedLabel = instructor.updatedAt ? `Updated ${new Date(instructor.updatedAt).toLocaleDateString()}` : "Date unavailable";
              return <article key={instructor.id} className="w-full overflow-hidden rounded-xl border border-[#293343] bg-[#141a23] shadow-sm shadow-black/10">
                <button type="button" onClick={() => toggleInstructorProfile(instructor.id)} aria-expanded={isExpanded} aria-controls={`instructor-profile-${instructor.id}`} className="flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <span className="flex w-full min-w-0 flex-col gap-1.5 sm:flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="break-words text-sm  text-stone-100">{instructor.name}</span>
                      <span className="max-w-full truncate rounded border border-sky-400/25 bg-sky-400/10 px-2 py-0.5 text-[10px]  text-sky-200">{instructor.specialization || "Specialization not set"}</span>
                    </span>
                    <span className="break-all text-xs text-stone-400">{instructor.email}</span>
                  </span>
                  <span className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-5">
                    <span className={`rounded border px-2 py-1 text-[10px]  uppercase ${instructor.status === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/20 text-amber-400"}`}>{instructor.status === "active" ? "Active" : "On Leave"}</span>
                    <span className="text-right text-[11px] text-stone-500 sm:text-xs">{updatedLabel}</span>
                    <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  </span>
                </button>
                <div id={`instructor-profile-${instructor.id}`} aria-hidden={!isExpanded} inert={!isExpanded} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="border-t border-[#293343] px-4 py-5 sm:px-5">
                      <div className="grid min-w-0 gap-5 md:grid-cols-2 2xl:grid-cols-3">
                        <section className="min-w-0 space-y-4" aria-label={`${instructor.name} contact and availability`}>
                          <label className="block space-y-1.5 text-xs font-medium text-stone-400">Email<input type="email" value={instructor.email} onChange={(event) => updateInstructorProfile(instructor.id, { email: event.target.value })} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label>
                          <label className="block space-y-1.5 text-xs font-medium text-stone-400">Specialization / Area of Expertise<input value={instructor.specialization} onChange={(event) => updateInstructorProfile(instructor.id, { specialization: event.target.value })} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label>
                          <label className="block space-y-1.5 text-xs font-medium text-stone-400">Status / Availability<select value={instructor.status} onChange={(event) => updateInstructorProfile(instructor.id, { status: event.target.value as InstructorStatus })} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-xs text-stone-200 outline-none [color-scheme:dark] focus:border-amber-500/40"><option value="active">Active</option><option value="on_leave">On Leave</option></select></label>
                        </section>
                        <section className="min-w-0 space-y-4 md:col-span-1 2xl:col-span-2" aria-label={`${instructor.name} capacity and bio`}>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block space-y-1.5 text-xs font-medium text-stone-400">Max Student Capacity<input type="number" min={1} max={1000} value={instructor.maxStudentCapacity} onChange={(event) => updateInstructorProfile(instructor.id, { maxStudentCapacity: Number(event.target.value) })} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label>
                            <div className="flex items-end pb-2 text-xs text-stone-400">Assigned Students <span className="ml-2 font-semibold text-stone-200">{instructor.assignedCount}</span></div>
                          </div>
                          <label className="block space-y-1.5 text-xs font-medium text-stone-400">Bio / Instructor Note<textarea value={instructor.bio} onChange={(event) => updateInstructorProfile(instructor.id, { bio: event.target.value })} rows={4} className="h-24 w-full resize-y overflow-y-auto rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-xs leading-relaxed text-stone-200 outline-none focus:border-amber-500/40" /></label>
                        </section>
                      </div>
                      <div className="mt-5 flex flex-col-reverse gap-3 border-t border-[#293343] pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-h-5 text-xs" role="status" aria-live="polite">{saveMessage && <span className={isSaved ? "text-emerald-300" : "text-rose-300"}>{saveMessage}</span>}</div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {instructor.status === "active" && <button type="button" onClick={(event) => void handleDeactivateInstructor(event, instructor)} disabled={isSaving} className="h-10 rounded-md border border-rose-400/30 px-3 text-xs  text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-50">Deactivate</button>}
                          <button type="button" onClick={(event) => void handleSaveInstructor(event, instructor)} disabled={isSaving} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-amber-500/20 px-4 text-xs  text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60">{isSaving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" aria-hidden="true" />}{isSaving ? "Saving..." : "Save Changes"}</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>;
            })}
          </div> : <div className="rounded-xl border border-dashed border-[#394252] px-6 py-12 text-center text-sm text-stone-500">No instructor profiles are available.</div>}

          {isAddInstructorOpen && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isAddingInstructor) setIsAddInstructorOpen(false); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="add-instructor-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#394252] bg-[#141a23] p-5 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-4 border-b border-[#293343] pb-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Instructor Directory</p><h3 id="add-instructor-title" className="mt-1 text-xl font-semibold text-stone-100">Add Instructor</h3></div><button type="button" onClick={() => setIsAddInstructorOpen(false)} disabled={isAddingInstructor} aria-label="Close add instructor dialog" className="rounded-md p-2 text-stone-400 transition hover:bg-white/5 hover:text-stone-100 disabled:opacity-50"><X className="h-4 w-4" /></button></div>
              <form onSubmit={(event) => void handleCreateInstructor(event)} className="mt-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-xs font-medium text-stone-400">Full Name<input required maxLength={120} value={addInstructorDraft.fullName} onChange={(event) => setAddInstructorDraft((current) => ({ ...current, fullName: event.target.value }))} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-sm text-stone-200 outline-none focus:border-amber-500/40" /></label>
                  <label className="block space-y-1.5 text-xs font-medium text-stone-400">Email<input required type="email" maxLength={254} value={addInstructorDraft.email} onChange={(event) => setAddInstructorDraft((current) => ({ ...current, email: event.target.value }))} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-sm text-stone-200 outline-none focus:border-amber-500/40" /></label>
                  <label className="block space-y-1.5 text-xs font-medium text-stone-400">Specialization<input value={addInstructorDraft.specialization} onChange={(event) => setAddInstructorDraft((current) => ({ ...current, specialization: event.target.value }))} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-sm text-stone-200 outline-none focus:border-amber-500/40" /></label>
                  <label className="block space-y-1.5 text-xs font-medium text-stone-400">Status<select value={addInstructorDraft.status} onChange={(event) => setAddInstructorDraft((current) => ({ ...current, status: event.target.value as InstructorStatus }))} className="h-10 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 text-sm text-stone-200 outline-none [color-scheme:dark] focus:border-amber-500/40"><option value="active">Active</option><option value="on_leave">On Leave</option></select></label>
                  <label className="block space-y-1.5 text-xs font-medium text-stone-400 sm:col-span-2">Bio<textarea value={addInstructorDraft.bio} onChange={(event) => setAddInstructorDraft((current) => ({ ...current, bio: event.target.value }))} rows={4} className="h-24 w-full resize-y overflow-y-auto rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/40" /></label>
                </div>
                {addInstructorError && <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{addInstructorError}</p>}
                <div className="flex flex-col-reverse gap-3 border-t border-[#293343] pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setIsAddInstructorOpen(false)} disabled={isAddingInstructor} className="h-10 rounded-md border border-[#394252] px-4 text-xs  text-stone-300 transition hover:bg-white/5 disabled:opacity-50">Cancel</button><button type="submit" disabled={isAddingInstructor} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-amber-500/20 px-4 text-xs  text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60">{isAddingInstructor ? "Adding..." : "Add Instructor"}</button></div>
              </form>
            </section>
          </div>}
        </section>}

        {activeTab === "resources" && (() => {
          const flashcards = collectStudentFlashcards(studentResources);
          const currentFlashcard = flashcards[flashcardIndex] || null;
          return (
            <section className="mx-auto w-full min-w-0 max-w-6xl space-y-6" aria-label="Student resources panel">
              <div className="rounded-2xl border border-[#202631] bg-[#171d28]/60 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Student Materials</p>
                    <h2 className="mt-1 font-sans text-2xl font-semibold text-stone-100">Resources</h2>
                  </div>
                  <label className="flex flex-col gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-stone-400">
                    <span>Student</span>
                    <select
                      value={selectedStudentId || ""}
                      onChange={(event) => {
                        const student = students.find((item) => item.id === event.target.value);
                        if (student) {
                          setResourceLessonId(null);
                          setSelectedStudentId(student.id);
                        }
                      }}
                      className="min-w-[220px] rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-xs font-medium normal-case tracking-normal text-white outline-none [color-scheme:dark]"
                    >
                      <option value="">Select a student</option>
                      {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-stone-400">
                    <span>Lesson</span>
                    <select
                      value={resourceLessonId || ""}
                      onChange={(event) => setResourceLessonId(event.target.value || null)}
                      disabled={createdLessons.length === 0}
                      className="min-w-[220px] rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-xs font-medium normal-case tracking-normal text-white outline-none [color-scheme:dark] disabled:opacity-50"
                    >
                      <option value="">Select a lesson</option>
                      {createdLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.35fr)]">
                <div className="w-full min-w-0 rounded-2xl border border-[#202631] bg-[#171d28]/60 p-5">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {([['note', 'Notes'], ['reading', 'Reading'], ['flashcard', 'Flashcards'], ['quiz', 'Quiz'], ['audio', 'Audio'], ['data_table', 'Data Table']] as const).map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setResourceDraft((previous) => ({ ...previous, type }))}
                        className={`rounded-full border px-3 py-1.5 text-[11px]  transition ${resourceDraft.type === type ? 'border-amber-500/40 bg-amber-500/20 text-amber-400' : 'border-[#394252] text-stone-400 hover:text-stone-200'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs text-stone-400">
                      Title
                      <input
                        value={resourceDraft.title}
                        onChange={(event) => setResourceDraft((previous) => ({ ...previous, title: event.target.value }))}
                        placeholder={resourceDraft.type === "audio" ? "Podcast / Deep Dive Audio" : resourceDraft.type === "data_table" ? "Lesson 3: Core Summary Matrix" : "Vocabulary set / reading summary / quiz idea"}
                        className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                      />
                    </label>

                    {resourceDraft.type === "reading" && (
                      <>
                        <label className="block text-xs text-stone-400">
                          Reading link or file
                          <input
                            value={resourceDraft.linkUrl}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, linkUrl: event.target.value }))}
                            placeholder="https://… or PDF file name"
                            className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                          />
                        </label>
                        <label className="block text-xs text-stone-400">
                          Reading notes
                          <TiptapEditor
                            value={resourceDraft.body}
                            onChange={(body) => setResourceDraft((previous) => ({ ...previous, body }))}
                            onHtmlChange={setResourceBodyHtml}
                            placeholder="Add a short introduction or reading notes."
                            ariaLabel="Reading notes"
                          />
                        </label>
                      </>
                    )}

                    {resourceDraft.type === "audio" && (
                      <>
                        <label className="block text-xs text-stone-400">
                          Audio file URL
                          <input
                            type="url"
                            value={resourceDraft.linkUrl}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, linkUrl: event.target.value }))}
                            placeholder="https://…"
                            className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                          />
                        </label>
                        <label className="block text-xs text-stone-400">
                          Or upload an audio file
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
                            className="mt-1 block w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-300 file:mr-3 file:rounded file:border-0 file:bg-amber-500/20 file:px-3 file:py-1.5 file:text-xs file: file:text-amber-400"
                          />
                        </label>
                        <label className="block text-xs text-stone-400">
                          Optional description / transcript notes
                          <TiptapEditor
                            value={resourceDraft.body}
                            onChange={(body) => setResourceDraft((previous) => ({ ...previous, body }))}
                            onHtmlChange={setResourceBodyHtml}
                            placeholder="Add context or transcript notes for the student."
                            ariaLabel="Optional audio description and transcript notes"
                          />
                        </label>
                      </>
                    )}

                    {resourceDraft.type === "data_table" && (
                      <label className="block text-xs text-stone-400">
                        Data table content
                        <TiptapEditor
                          value={resourceDraft.body}
                          onChange={(body) => setResourceDraft((previous) => ({ ...previous, body }))}
                          onHtmlChange={setResourceBodyHtml}
                          placeholder="Write content or insert a table with the toolbar."
                          ariaLabel="Data table content"
                        />
                      </label>
                    )}

                    {(resourceDraft.type === "note" || resourceDraft.type === "quiz") && (
                      <label className="block text-xs text-stone-400">
                        {resourceDraft.type === "quiz" ? "Practice prompt" : "Notes"}
                        <TiptapEditor
                          value={resourceDraft.body}
                          onChange={(body) => setResourceDraft((previous) => ({ ...previous, body }))}
                          onHtmlChange={setResourceBodyHtml}
                          placeholder={resourceDraft.type === "quiz" ? "Write a practice exercise or prompt for the student." : "Add the material notes the student should review."}
                          ariaLabel={resourceDraft.type === "quiz" ? "Practice prompt" : "Notes"}
                        />
                      </label>
                    )}

                    {resourceDraft.type === "flashcard" && (
                      <>
                        <label className="block text-xs text-stone-400">
                          Front / Question
                          <TiptapEditor
                            value={resourceDraft.question}
                            onChange={(question) => setResourceDraft((previous) => ({ ...previous, question }))}
                            onHtmlChange={setResourceQuestionHtml}
                            placeholder="What is the term for … ?"
                            ariaLabel="Flashcard front question"
                          />
                        </label>
                        <label className="block text-xs text-stone-400">
                          Back / Answer
                          <TiptapEditor
                            value={resourceDraft.answer}
                            onChange={(answer) => setResourceDraft((previous) => ({ ...previous, answer }))}
                            onHtmlChange={setResourceAnswerHtml}
                            placeholder="A clear, student-friendly definition or explanation."
                            ariaLabel="Flashcard back answer"
                          />
                        </label>
                        <label className="block text-xs text-stone-400">
                          Optional explanation
                          <TiptapEditor
                            value={resourceDraft.explanation}
                            onChange={(explanation) => setResourceDraft((previous) => ({ ...previous, explanation }))}
                            onHtmlChange={setResourceExplanationHtml}
                            placeholder="Optional AI-friendly nuance or extra context."
                            ariaLabel="Optional flashcard explanation"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={addFlashcardToDeck}
                          className="w-full rounded-md border border-[#394252] px-4 py-2.5 text-xs text-stone-200 transition hover:border-amber-500/40 hover:text-amber-400"
                        >
                          + Add Card to Deck
                        </button>
                        <FlashcardDraftList
                          cards={resourceDraft.cards}
                          onRemove={(index) => setResourceDraft((previous) => ({
                            ...previous,
                            cards: previous.cards.filter((_, cardIndex) => cardIndex !== index),
                          }))}
                        />
                      </>
                    )}

                    <button type="button" onClick={() => void saveStudentResource()} className="w-full rounded-md bg-amber-500/20 px-4 py-2.5 text-xs  text-amber-400 transition hover:bg-amber-500/20">
                      {resourceDraft.type === "data_table" ? "Save Data Table" : resourceDraft.type === "flashcard" ? "Save Deck" : "Save resource"}
                    </button>
                    {resourceStatus && <p role="status" className="text-xs leading-relaxed text-amber-400">{resourceStatus}</p>}
                  </div>
                </div>

                <div className="w-full min-w-0 rounded-2xl border border-[#202631] bg-[#0b1018] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Study Deck</p>
                      <h3 className="mt-1 font-sans text-xl font-semibold text-stone-100">Flashcards</h3>
                    </div>
                    <span className="rounded-full border border-[#394252] bg-[#171d28] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-stone-300">
                      {flashcards.length} cards
                    </span>
                  </div>

                  {currentFlashcard ? (
                    <>
                      <div className="relative h-[360px] w-full [perspective:1800px]">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setFlashcardFlipped((current) => !current)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
                            event.preventDefault();
                            setFlashcardFlipped((current) => !current);
                          }}
                          className={`relative h-full w-full rounded-2xl border border-[#2b3342] bg-[#10181f] p-6 text-left shadow-[0_24px_60px_rgba(0,0,0,0.45)] transition-transform duration-700 [transform-style:preserve-3d] ${flashcardFlipped ? "[transform:rotateY(180deg)]" : ""}`}
                        >
                          <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px]  uppercase tracking-[0.18em] text-amber-400">{flashcardIndex + 1} / {flashcards.length}</span>
                              <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-[10px]  uppercase tracking-[0.12em] text-amber-400">Term</span>
                            </div>
                            <div className="flex-1 pt-8">
                              <MarkdownContent value={currentFlashcard.front} className="text-2xl leading-snug text-stone-100" />
                            </div>
                            <div className="flex justify-center">
                              <span className="rounded-full border border-[#394252] bg-[#171d28] px-4 py-2 text-[11px]  text-stone-300">See answer</span>
                            </div>
                          </div>

                          <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px]  uppercase tracking-[0.18em] text-emerald-300">Answer</span>
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px]  uppercase tracking-[0.12em] text-emerald-200">Key idea</span>
                            </div>
                            <div className="flex-1 pt-8">
                              <MarkdownContent value={currentFlashcard.back || "No answer yet."} className="text-xl leading-relaxed text-stone-100" />
                              {currentFlashcard.explanation && (
                                <div className="mt-5">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setShowFlashcardExplanation((value) => !value);
                                    }}
                                    className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[10px]  uppercase tracking-[0.14em] text-sky-200"
                                  >
                                    {showFlashcardExplanation ? "Hide explain" : "Explain"}
                                  </button>
                                  {showFlashcardExplanation && <MarkdownContent value={currentFlashcard.explanation} className="mt-3 text-sm leading-relaxed text-stone-300" />}
                                </div>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-400">Press Space to flip, ← / → to navigate</div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#202631] bg-[#0f141b] px-3 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFlashcardIndex((current) => Math.max(0, current - 1));
                            setFlashcardFlipped(false);
                            setShowFlashcardExplanation(false);
                          }}
                          disabled={flashcardIndex === 0}
                          className="rounded-md border border-[#394252] px-3 py-2 text-xs  text-stone-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ←
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setWrongCount((count) => count + 1);
                              setFlashcardIndex((current) => Math.min(current + 1, flashcards.length - 1));
                              setFlashcardFlipped(false);
                              setShowFlashcardExplanation(false);
                            }}
                            className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs  text-red-200"
                          >
                            <span>✕</span>
                            <span>{wrongCount}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRightCount((count) => count + 1);
                              setFlashcardIndex((current) => Math.min(current + 1, flashcards.length - 1));
                              setFlashcardFlipped(false);
                              setShowFlashcardExplanation(false);
                            }}
                            className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs  text-emerald-200"
                          >
                            <span>✓</span>
                            <span>{rightCount}</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setFlashcardIndex((current) => Math.min(current + 1, flashcards.length - 1));
                            setFlashcardFlipped(false);
                            setShowFlashcardExplanation(false);
                          }}
                          disabled={flashcardIndex >= flashcards.length - 1}
                          className="rounded-md border border-[#394252] px-3 py-2 text-xs  text-stone-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          →
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#394252] bg-[#10181f] p-10 text-center text-sm text-stone-500">
                      Add one or more flashcards to turn this deck on.
                    </div>
                  )}

                  <div className="mt-5 space-y-3">
                    {studentResources.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#394252] bg-[#10181f] p-6 text-center text-sm text-stone-500">
                        No student resources yet for this student.
                      </div>
                    ) : (
                      studentResources.map((resource) => {
                        const resourceCards = getResourceFlashcards(resource);
                        const isFlashcardDeck = resource.resource_type === "flashcard" || resource.resource_type === "flashcards";
                        const isDataTable = resource.resource_type === "data_table" || isDataTableResourceTitle(resource.title);
                        const resourceTitle = isDataTable ? getDataTableResourceTitle(resource.title) : resource.title;
                        return (
                        <div key={resource.id} className="rounded-xl border border-[#202631] bg-[#10181f] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400">{isDataTable ? "data_table" : isFlashcardDeck ? "Flashcard Deck" : resource.resource_type}</p>
                              {!isDataTable && <h4 className="mt-1 font-semibold text-stone-100">{resourceTitle}{isFlashcardDeck ? ` (${resourceCards.length} ${resourceCards.length === 1 ? "Card" : "Cards"})` : ""}</h4>}
                            </div>
                            <button type="button" onClick={() => void deleteStudentResource(resource)} className="text-stone-500 hover:text-red-300" aria-label={`Delete ${resource.title}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {isFlashcardDeck && (
                            <div className="mt-3">
                              <FlashcardDraftList cards={resourceCards} />
                            </div>
                          )}
                          {resource.resource_type === "reading" && resource.link_url && (
                            <a href={resource.link_url} target="_blank" rel="noreferrer" className="mt-3 block truncate text-sm text-sky-300 underline">{resource.link_url}</a>
                          )}
                          {resource.resource_type === "audio" && (
                            <div className="mt-3 space-y-3">
                              {resource.link_url ? <CustomAudioPlayer src={resource.link_url} label={resource.title} /> : <p className="text-xs text-stone-500">No audio URL is available.</p>}
                              {resource.link_url && <a href={resource.link_url} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-sky-300 underline">Open audio file</a>}
                              {resource.body && <AudioTranscriptAccordion resourceId={resource.id} transcript={resource.body} />}
                            </div>
                          )}
                          {isDataTable && resource.body && <div className="mt-3"><DataTableResource title={resourceTitle} markdown={resource.body} /></div>}
                          {resource.resource_type === "reading" && resource.body && <MarkdownContent value={resource.body} className="mt-3 text-sm leading-relaxed text-stone-300" />}
                          {resource.resource_type === "note" && !isDataTable && resource.body && <MarkdownContent value={resource.body} className="mt-3 text-sm leading-relaxed text-stone-300" />}
                          {resource.resource_type === "quiz" && resource.body && <MarkdownContent value={resource.body} className="mt-3 text-sm leading-relaxed text-stone-300" />}
                        </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>
          );
        })()}

        {activeTab === "music" && <MusicLibraryManager />}

        {activeTab === "builder" && <>
          <section className="mb-6 rounded-xl border border-[#202631] bg-[#171d28]/60 p-5" aria-labelledby="lesson-details-title">
                {Object.keys(validationErrors).length > 0 && <div className="mb-4 space-y-1 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300" role="alert">{Object.entries(validationErrors).map(([field, message]) => <p key={field}>{message}</p>)}</div>}
            <div className="mb-4">
<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Lesson Builder</p>
<h2 id="lesson-details-title" className="mt-1 font-sans text-xl font-semibold text-stone-100">Lesson Details</h2>
</div>
            <div className="grid gap-3">
              <label className="block text-xs text-stone-400">Lesson Title
                <textarea
                  ref={lessonTitleTextareaRef}
                  value={newLesson.title}
                  onChange={(event) => setLessonTitle(event.target.value)}
                  onInput={(event) => resizeTextareaToContent(event.currentTarget)}
                  placeholder="A new lesson"
                  rows={1}
                  className="mt-1 min-h-10 w-full resize-none overflow-hidden rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs leading-relaxed text-stone-200 outline-none focus:border-amber-500/40"
                />
              </label>
              <label className="block text-xs text-stone-400">Subtitle
                <textarea
                  ref={lessonSubtitleTextareaRef}
                  value={newLesson.subtitle}
                  onChange={(event) => setNewLesson((previous) => ({ ...previous, subtitle: event.target.value }))}
                  onInput={(event) => resizeTextareaToContent(event.currentTarget)}
                  placeholder="Lesson summary"
                  rows={1}
                  className="mt-1 min-h-10 w-full resize-none overflow-hidden rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs leading-relaxed text-stone-200 outline-none focus:border-amber-500/40"
                />
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-stone-400">Select Student<select value={selectedStudentId || ""} onChange={(event) => { const nextStudent = students.find((student) => student.id === event.target.value); if (nextStudent) void handleStudentChange(nextStudent); }} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-white [color-scheme:dark]" aria-label="Select student for lesson"><option value="" className="bg-[#0c1017] text-white">{studentsLoading ? "Loading students..." : studentsError ? "Unable to load students" : students.length === 0 ? "No registered students" : "Choose a student"}</option>{students.map((student) => <option key={student.id} value={student.id} className="bg-[#0c1017] text-white">{student.name}</option>)}</select>
              </label>
              <label className="text-xs text-stone-400">Module Number<input value={newLesson.moduleNumber} onChange={(event) => setNewLesson((previous) => ({ ...previous, moduleNumber: event.target.value }))} placeholder="1" className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" />
              </label>
              <label className="text-xs text-stone-400">CEFR Level<select value={newLesson.level} onChange={(event) => updateBuilderLevel(event.target.value)} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-white [color-scheme:dark]" aria-label="Lesson CEFR level">{CEFR_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select>
              </label>
              <div className="text-xs text-stone-400">Visibility<p className="mt-1 rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200">{lessonStatus === "published" ? "Published" : "Draft"}</p></div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-xs text-stone-400">Domain<input value={newLesson.tags.domain} onChange={(event) => updateBuilderTags({ ...newLesson.tags, domain: event.target.value }, newLesson.customTagsText)} placeholder="Work, travel, culture..." className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>
              <label className="text-xs text-stone-400">Skill Focus<input value={newLesson.tags.skill_focus} onChange={(event) => updateBuilderTags({ ...newLesson.tags, skill_focus: event.target.value }, newLesson.customTagsText)} placeholder="Speaking, listening..." className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>
              <label className="text-xs text-stone-400">Practice Type<input value={newLesson.tags.practice_type} onChange={(event) => updateBuilderTags({ ...newLesson.tags, practice_type: event.target.value }, newLesson.customTagsText)} placeholder="Role-play, reflection..." className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>
              <label className="text-xs text-stone-400 md:col-span-3">Custom Tags<input value={newLesson.customTagsText} onChange={(event) => updateBuilderTags({ ...newLesson.tags, custom: parseCustomLessonTags(event.target.value) }, event.target.value)} placeholder="Comma-separated custom tags" className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>
            </div>
            <div className="mt-3 overflow-hidden rounded-md border border-[#29303c] bg-[#0c1017]/60">
              <button type="button" aria-expanded={isLessonGuidanceExpanded} onClick={() => setIsLessonGuidanceExpanded((expanded) => !expanded)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs  text-stone-300 transition hover:bg-amber-500/20 hover:text-stone-100">
                <span>Lesson-Specific Guidance</span>
                {isLessonGuidanceExpanded ? <ChevronDown className="h-4 w-4 text-amber-400" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-amber-400" aria-hidden="true" />}
              </button>
              {isLessonGuidanceExpanded && <div className="border-t border-[#29303c] p-3"><TiptapEditor value={newLesson.instructorGuidance} onChange={(instructorGuidance) => setNewLesson((previous) => ({ ...previous, instructorGuidance }))} placeholder="Guidance shown inside this lesson's Study Room" ariaLabel="Lesson-specific guidance" compact /></div>}
            </div>
          </section>
          {isSplitPreviewOpen ? (
            <main className="grid min-w-0 grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
              <div className="h-[calc(100dvh-20rem)] min-h-[480px] min-w-0 space-y-6 overflow-y-auto overscroll-contain pr-1">
                <div className="min-w-0 space-y-5" style={{ zoom: 0.85 }}>
                  {lessonEditorPanel}
                  {heroBannerPanel}
                  {sidebarEditorPanel}
                </div>
              </div>
              <div className="h-[calc(100dvh-20rem)] min-h-[480px] min-w-0 overflow-y-auto overscroll-contain rounded-xl border border-[#202631]">
                <div className="min-w-0" style={{ zoom: 0.85 }}>
                  <StudentStudyRoomPreview {...livePreviewSnapshot} onStepChange={setPreviewStep} embedded />
                </div>
              </div>
            </main>
          ) : (
            <main className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
              <div className="h-full min-w-0 lg:col-span-8">{lessonEditorPanel}</div>
              <aside className="h-full space-y-6 lg:col-span-4">
                {heroBannerPanel}
                {sidebarEditorPanel}
              </aside>
            </main>
          )}

          <section className="mt-6 rounded-xl border border-[#202631] bg-[#171d28]/60 p-5" aria-label="Lesson builder resource panel">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <button
                type="button"
                onClick={() => setBuilderResourcesExpanded((expanded) => !expanded)}
                aria-expanded={builderResourcesExpanded}
                aria-controls="lesson-builder-resources-content"
                className="flex min-w-0 items-center gap-3 text-left"
              >
                <ChevronDown className={`h-4 w-4 shrink-0 text-amber-400 transition-transform duration-200 ${builderResourcesExpanded ? "rotate-180" : "-rotate-90"}`} aria-hidden="true" />
                <span>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Student Materials</p>
                  <h3 className="mt-1 font-sans text-xl font-semibold text-stone-100">Resources</h3>
                </span>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                  {studentResources.length}
                </span>
              </button>
              <div className="rounded-full border border-[#394252] bg-[#0c1017] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-300">
                {activeBuilderStudent ? `${activeBuilderStudent.name} · ${activeBuilderLessonId ? "Bound" : "Lesson not saved yet"}` : "Select student in Lesson Details"}
              </div>
            </div>
            <div
              id="lesson-builder-resources-content"
              aria-hidden={!builderResourcesExpanded}
              inert={!builderResourcesExpanded}
              className="grid transition-[grid-template-rows] duration-300 ease-in-out"
              style={{ gridTemplateRows: builderResourcesExpanded ? "1fr" : "0fr" }}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Resource type">
                  {([['note', 'Notes'], ['reading', 'Reading'], ['flashcard', 'Flashcards'], ['quiz', 'Quiz'], ['audio', 'Audio'], ['video', 'Video'], ['image', 'Image'], ['data_table', 'Data Table'], ['file', 'File Upload']] as const).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      disabled={Boolean(editingStudentResourceId && activeResourceType !== type)}
                      aria-pressed={activeResourceType === type}
                      onClick={() => setResourceDraft((previous) => ({ ...previous, type }))}
                      className={`rounded-md border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${activeResourceType === type ? 'border-amber-500/40 bg-amber-500/20 text-amber-400 shadow-sm' : 'border-[#394252] bg-[#0c1017] text-stone-400 hover:border-amber-500/40 hover:text-stone-100'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {!activeBuilderStudent || !activeBuilderLessonId ? (
              <div className="mt-4 rounded-lg border border-dashed border-[#202631] bg-[#0c1017] px-4 py-5 text-sm text-stone-400">
                Choose a student and save the lesson draft in Lesson Details to bind resource uploads to the active lesson context.
              </div>
            ) : (
              <div className="mt-5 space-y-6">
                <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.35fr)]">
                  <div className="w-full min-w-0 rounded-2xl border border-[#202631] bg-[#171d28]/60 p-5">
                    <div id="student-resource-editor" className="mb-4 border-b border-[#202631] pb-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">{editingStudentResourceId ? "Edit saved resource" : "Resource Editor"}</p>
                      <h4 className="mt-1 font-sans text-lg font-semibold text-stone-100">
                        {activeResourceType === "note" ? "Note Editor" : activeResourceType === "reading" ? "Reading Editor" : activeResourceType === "flashcard" ? "Flashcard Builder" : activeResourceType === "quiz" ? "Quiz Editor" : activeResourceType === "audio" ? "Audio Editor" : activeResourceType === "video" ? "Video Editor" : activeResourceType === "image" ? "Image Editor" : activeResourceType === "file" ? "File Upload" : "Data Table Editor"}
                      </h4>
                    </div>

                    <div className="space-y-3">
                      <label className="block text-xs text-stone-400">
                        Title
                        <input
                          value={resourceDraft.title}
                          onChange={(event) => setResourceDraft((previous) => ({ ...previous, title: event.target.value }))}
                          placeholder={resourceDraft.type === "audio" ? "Podcast / Deep Dive Audio" : resourceDraft.type === "data_table" ? "Lesson 3: Core Summary Matrix" : resourceDraft.type === "file" ? "Resource title" : "Vocabulary set / reading summary / quiz idea"}
                          className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                        />
                      </label>

                      {(["reading", "audio", "file", "image", "video"] as StudentResourceType[]).includes(resourceDraft.type) && (
                        <div className="grid grid-cols-2 rounded-md border border-[#394252] bg-[#0c1017] p-1" role="tablist" aria-label="Media input method">
                          <button type="button" role="tab" aria-selected={resourceInputMode === "upload"} onClick={() => setResourceInputMode("upload")} className={`rounded px-3 py-2 text-xs  transition ${resourceInputMode === "upload" ? "bg-amber-500/20 text-amber-400" : "text-stone-400 hover:text-stone-200"}`}>Upload File</button>
                          <button type="button" role="tab" aria-selected={resourceInputMode === "url"} onClick={() => setResourceInputMode("url")} className={`rounded px-3 py-2 text-xs  transition ${resourceInputMode === "url" ? "bg-amber-500/20 text-amber-400" : "text-stone-400 hover:text-stone-200"}`}>Paste URL</button>
                        </div>
                      )}

                      {resourceDraft.type !== "audio" && (["file", "image", "video"].includes(resourceDraft.type) || (resourceDraft.type === "reading" && resourceInputMode === "upload")) && resourceInputMode === "upload" && (
                        <div
                          onDragOver={(event) => { event.preventDefault(); setIsResourceFileDragging(true); }}
                          onDragLeave={() => setIsResourceFileDragging(false)}
                          onDrop={(event) => {
                            event.preventDefault();
                            setIsResourceFileDragging(false);
                            handleResourceFileSelection(event.dataTransfer.files[0]);
                          }}
                          className={`rounded-lg border border-dashed p-5 text-center transition ${isResourceFileDragging ? "border-amber-500/40 bg-amber-500/20" : "border-[#394252] bg-[#0c1017]"}`}
                        >
                          <input
                            id="student-resource-file-input"
                            type="file"
                            accept={resourceAccept}
                            onChange={(event) => handleResourceFileSelection(event.target.files?.[0])}
                            className="sr-only"
                          />
                          <UploadCloud className="mx-auto h-7 w-7 text-amber-400" aria-hidden="true" />
                          <p className="mt-2 text-sm font-medium text-stone-200">{isResourceFileDragging ? "Drop file to attach" : "Drag a file here or choose a file"}</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{resourceDraft.type === "image" ? "Image files" : resourceDraft.type === "video" ? "Video files" : resourceDraft.type === "reading" ? "PDF or document attachments" : "Images, text documents, PDFs, audio, and video"} · up to 50 MB</p>
                          <label htmlFor="student-resource-file-input" className="mt-3 inline-flex cursor-pointer items-center rounded-md border border-amber-500/40 px-3 py-2 text-xs font-semibold text-amber-400 hover:border-amber-500/40">
                            Choose file
                          </label>
                          {resourceFile && <div className="mt-3 flex items-center justify-center gap-2 text-xs text-stone-300"><span className="max-w-[220px] truncate">{resourceFile.name}</span><button type="button" onClick={() => setResourceFile(null)} className="text-red-300 hover:text-red-200">Remove</button></div>}
                        </div>
                      )}

                      {resourceDraft.type === "reading" && resourceInputMode === "url" && (
                        <label className="block text-xs text-stone-400">
                          Reading attachment URL
                          <input
                            value={resourceDraft.linkUrl}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, linkUrl: event.target.value }))}
                            placeholder="https://..."
                            className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                          />
                        </label>
                      )}

                      {resourceDraft.type === "reading" && (
                        <label className="block text-xs text-stone-400">
                          Reading notes
                          <TiptapEditor
                            value={resourceDraft.body}
                            onChange={(body) => setResourceDraft((previous) => ({ ...previous, body }))}
                            onHtmlChange={setResourceBodyHtml}
                            placeholder="Add an introduction or notes to accompany the reading."
                            ariaLabel="Reading notes"
                          />
                        </label>
                      )}

                      {resourceDraft.type === "audio" && resourceInputMode === "url" && (
                        <label className="block text-xs text-stone-400">
                          Audio file URL
                          <input
                            type="url"
                            value={resourceDraft.linkUrl}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, linkUrl: event.target.value }))}
                            placeholder="https://…"
                            className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500/40"
                          />
                        </label>
                      )}

                      {resourceDraft.type === "audio" && (
                        <label className="block text-xs text-stone-400">
                          Optional description / transcript notes
                          <TiptapEditor
                            value={resourceDraft.body}
                            onChange={(body) => setResourceDraft((previous) => ({ ...previous, body }))}
                            onHtmlChange={setResourceBodyHtml}
                            placeholder="Add context or transcript notes for the student."
                            ariaLabel="Optional audio description and transcript notes"
                          />
                        </label>
                      )}

                      {resourceDraft.type === "audio" && resourceInputMode === "upload" && (
                        <label className="block text-xs text-stone-400">Upload audio file
                          <input type="file" accept="audio/*" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-300 file:mr-3 file:rounded file:border-0 file:bg-amber-500/20 file:px-3 file:py-1.5 file:text-xs file: file:text-amber-400" />
                          {audioFile && <span className="mt-2 block truncate text-stone-300">{audioFile.name}</span>}
                        </label>
                      )}

                      {(["file", "image", "video"] as StudentResourceType[]).includes(resourceDraft.type) && resourceInputMode === "url" && (
                        <label className="block text-xs text-stone-400">{resourceDraft.type === "image" ? "Image URL" : resourceDraft.type === "video" ? "Video URL (direct, YouTube, or Vimeo)" : "File URL"}
                          <input type="url" value={resourceDraft.linkUrl} onChange={(event) => setResourceDraft((previous) => ({ ...previous, linkUrl: event.target.value }))} placeholder="https://..." className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500/40" />
                        </label>
                      )}

                      {resourceDraft.type === "data_table" && (
                        <label className="block text-xs text-stone-400">
                          Data table content
                          <TiptapEditor
                            value={resourceDraft.body}
                            onChange={(body) => setResourceDraft((previous) => ({ ...previous, body }))}
                            onHtmlChange={setResourceBodyHtml}
                            placeholder="Write content or insert a table with the toolbar."
                            ariaLabel="Data table content"
                          />
                        </label>
                      )}

                      {(resourceDraft.type === "note" || resourceDraft.type === "quiz") && (
                        <label className="block text-xs text-stone-400">
                          {resourceDraft.type === "quiz" ? "Practice prompt" : "Notes"}
                          <TiptapEditor
                            value={resourceDraft.body}
                            onChange={(body) => setResourceDraft((previous) => ({ ...previous, body }))}
                            onHtmlChange={setResourceBodyHtml}
                            placeholder={resourceDraft.type === "quiz" ? "Write a practice exercise or prompt for the student." : "Add the material notes the student should review."}
                            ariaLabel={resourceDraft.type === "quiz" ? "Practice prompt" : "Notes"}
                          />
                        </label>
                      )}

                      {resourceDraft.type === "flashcard" && (
                        <>
                          <label className="block text-xs text-stone-400">
                            Front / Question
                            <TiptapEditor
                              value={resourceDraft.question}
                              onChange={(question) => setResourceDraft((previous) => ({ ...previous, question }))}
                              onHtmlChange={setResourceQuestionHtml}
                              placeholder="What is the term for … ?"
                              ariaLabel="Flashcard front question"
                            />
                          </label>
                          <label className="block text-xs text-stone-400">
                            Back / Answer
                            <TiptapEditor
                              value={resourceDraft.answer}
                              onChange={(answer) => setResourceDraft((previous) => ({ ...previous, answer }))}
                              onHtmlChange={setResourceAnswerHtml}
                              placeholder="A clear, student-friendly definition or explanation."
                              ariaLabel="Flashcard back answer"
                            />
                          </label>
                          <label className="block text-xs text-stone-400">
                            Optional explanation
                            <TiptapEditor
                              value={resourceDraft.explanation}
                              onChange={(explanation) => setResourceDraft((previous) => ({ ...previous, explanation }))}
                              onHtmlChange={setResourceExplanationHtml}
                              placeholder="Optional AI-friendly nuance or extra context."
                              ariaLabel="Optional flashcard explanation"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={addFlashcardToDeck}
                            className="w-full rounded-md border border-[#394252] px-4 py-2.5 text-xs text-stone-200 transition hover:border-amber-500/40 hover:text-amber-400"
                          >
                            + Add Card to Deck
                          </button>
                          <FlashcardDraftList
                            cards={resourceDraft.cards}
                            onRemove={(index) => setResourceDraft((previous) => ({
                              ...previous,
                              cards: previous.cards.filter((_, cardIndex) => cardIndex !== index),
                            }))}
                          />
                        </>
                      )}

                      <button type="button" onClick={() => void saveStudentResource()} className="w-full rounded-md bg-amber-500/20 px-4 py-2.5 text-xs text-amber-400 transition hover:bg-amber-500/30">
                        {editingStudentResourceId
                          ? resourceDraft.type === "flashcard" ? "Update Deck" : "Update resource"
                          : resourceDraft.type === "data_table" ? "Save Data Table" : resourceDraft.type === "flashcard" ? "Save Deck" : "Save resource"}
                      </button>
                      {editingStudentResourceId && <button type="button" onClick={cancelStudentResourceEdit} className="w-full rounded-md border border-[#394252] px-4 py-2.5 text-xs text-stone-300 transition hover:border-stone-300 hover:text-stone-100">Cancel edit</button>}
                      {resourceStatus && <p role="status" className="text-xs leading-relaxed text-amber-400">{resourceStatus}</p>}
                    </div>
                  </div>

                  {activeResourceType === "flashcard" ? (
                  <div className="w-full min-w-0 rounded-2xl border border-[#202631] bg-[#0b1018] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Deck Preview</p>
                        <h3 className="mt-1 font-sans text-xl font-semibold text-stone-100">Live Preview</h3>
                      </div>
                      <span className="rounded-full border border-[#394252] bg-[#171d28] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-stone-300">
                        {collectStudentFlashcards(studentResources).length} saved cards
                      </span>
                    </div>

                    <p className="mb-3 text-xs font-medium text-stone-400">{resourceDraft.title.trim() || "Untitled flashcard"}</p>
                    <div className="relative mb-6 h-[280px] w-full [perspective:1600px]">
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={draftFlashcardFlipped ? "Draft flashcard answer; activate to show question" : "Draft flashcard question; activate to show answer"}
                        onClick={() => setDraftFlashcardFlipped((current) => !current)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
                          event.preventDefault();
                          setDraftFlashcardFlipped((current) => !current);
                        }}
                        className={`relative h-full w-full cursor-pointer rounded-2xl border border-[#2b3342] bg-[#10181f] p-5 text-left shadow-[0_24px_60px_rgba(0,0,0,0.4)] transition-transform duration-700 [transform-style:preserve-3d] ${draftFlashcardFlipped ? "[transform:rotateY(180deg)]" : ""}`}
                      >
                        <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden]">
                          <div className="flex items-center justify-between gap-2"><span className="text-[10px]  uppercase tracking-[0.16em] text-amber-400">Draft question</span><span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-[10px]  uppercase text-amber-400">Question</span></div>
                          <div className="max-h-[170px] overflow-y-auto break-words text-xl leading-snug text-stone-100"><ResourceRichTextPreview html={resourceQuestionHtml} fallback="Your question will appear here as you type." /></div>
                          <div className="flex justify-center"><span className="rounded-full border border-[#394252] bg-[#171d28] px-4 py-2 text-[11px]  text-stone-300">See answer</span></div>
                        </div>
                        <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                          <div className="flex items-center justify-between gap-2"><span className="text-[10px]  uppercase tracking-[0.16em] text-emerald-300">Draft answer</span><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px]  uppercase text-emerald-200">Key idea</span></div>
                          <div className="max-h-[170px] overflow-y-auto break-words text-lg leading-relaxed text-stone-100"><ResourceRichTextPreview html={resourceAnswerHtml} fallback="Your answer will appear here as you type." />{resourceDraft.explanation.trim() && <ResourceRichTextPreview html={resourceExplanationHtml} fallback="" className="mt-3 text-xs leading-relaxed text-stone-400" />}</div>
                          <div className="flex justify-center"><span className="rounded-full border border-[#394252] bg-[#171d28] px-4 py-2 text-[11px]  text-stone-300">Flip back</span></div>
                        </div>
                      </div>
                    </div>

                    <h4 className="mb-3 border-t border-[#202631] pt-4 text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">Saved deck</h4>

                    {(() => {
                      const flashcards = collectStudentFlashcards(studentResources);
                      const currentFlashcard = flashcards[flashcardIndex] || null;
                      return currentFlashcard ? (
                        <>
                          <div className="relative h-[360px] w-full [perspective:1800px]">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setFlashcardFlipped((current) => !current)}
                              onKeyDown={(event) => {
                                if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
                                event.preventDefault();
                                setFlashcardFlipped((current) => !current);
                              }}
                              className={`relative h-full w-full rounded-2xl border border-[#2b3342] bg-[#10181f] p-6 text-left shadow-[0_24px_60px_rgba(0,0,0,0.45)] transition-transform duration-700 [transform-style:preserve-3d] ${flashcardFlipped ? "[transform:rotateY(180deg)]" : ""}`}
                            >
                              <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden]">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px]  uppercase tracking-[0.18em] text-amber-400">{flashcardIndex + 1} / {flashcards.length}</span>
                                  <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-[10px]  uppercase tracking-[0.12em] text-amber-400">Term</span>
                                </div>
                                <div className="flex-1 pt-8">
                                  <MarkdownContent value={currentFlashcard.front} className="text-2xl leading-snug text-stone-100" />
                                </div>
                                <div className="flex justify-center">
                                  <span className="rounded-full border border-[#394252] bg-[#171d28] px-4 py-2 text-[11px]  text-stone-300">See answer</span>
                                </div>
                              </div>

                              <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px]  uppercase tracking-[0.18em] text-emerald-300">Answer</span>
                                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px]  uppercase tracking-[0.12em] text-emerald-200">Key idea</span>
                                </div>
                                <div className="flex-1 pt-8">
                                  <MarkdownContent value={currentFlashcard.back || "No answer yet."} className="text-xl leading-relaxed text-stone-100" />
                                  {currentFlashcard.explanation && (
                                    <div className="mt-5">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setShowFlashcardExplanation((value) => !value);
                                        }}
                                        className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[10px]  uppercase tracking-[0.14em] text-sky-200"
                                      >
                                        {showFlashcardExplanation ? "Hide note" : "Show note"}
                                      </button>
                                      {showFlashcardExplanation && <MarkdownContent value={currentFlashcard.explanation} className="mt-3 text-sm leading-relaxed text-stone-300" />}
                                    </div>
                                  )}
                                </div>
                                <div className="flex justify-center">
                                  <span className="rounded-full border border-[#394252] bg-[#171d28] px-4 py-2 text-[11px]  text-stone-300">Flip back</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 flex items-center justify-between gap-3">
                            <button type="button" onClick={() => setFlashcardIndex((index) => (index === 0 ? flashcards.length - 1 : index - 1))} className="rounded-md border border-[#394252] bg-[#171d28] px-3 py-2 text-xs  text-stone-300 hover:text-stone-100">
                              Previous
                            </button>
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-stone-500">
                              <button type="button" onClick={() => setRightCount((count) => count + 1)} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
                                Right
                              </button>
                              <button type="button" onClick={() => setWrongCount((count) => count + 1)} className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-red-300">
                                Wrong
                              </button>
                            </div>
                            <button type="button" onClick={() => setFlashcardIndex((index) => (index + 1) % flashcards.length)} className="rounded-md border border-[#394252] bg-[#171d28] px-3 py-2 text-xs  text-stone-300 hover:text-stone-100">
                              Next
                            </button>
                          </div>

                          <div className="mt-4 flex items-center justify-between rounded-xl border border-[#202631] bg-[#0c1017] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-stone-500">
                            <span>Right: {rightCount}</span>
                            <span>Wrong: {wrongCount}</span>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-xl border border-dashed border-[#394252] bg-[#0c1017] p-6 text-center text-sm text-stone-500">
                          No flashcards saved for this active student and lesson yet.
                        </div>
                      );
                    })()}
                  </div>
                  ) : (
                    <div className="w-full min-w-0 rounded-2xl border border-[#202631] bg-[#0b1018] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                      <div className="mb-4 border-b border-[#202631] pb-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">{activeResourceType === "note" ? "Note Preview" : activeResourceType === "reading" ? "Reading Preview" : activeResourceType === "quiz" ? "Quiz Preview" : activeResourceType === "audio" ? "Audio Preview" : activeResourceType === "video" ? "Video Preview" : activeResourceType === "image" ? "Image Preview" : activeResourceType === "file" ? "File Preview" : "Data Table Preview"}</p>
                        <h3 className="mt-1 font-sans text-xl font-semibold text-stone-100">{resourceDraft.title.trim() || "Untitled resource"}</h3>
                      </div>
                      {activeResourceType === "note" && (
                        <ResourceRichTextPreview html={resourceBodyHtml} fallback="Your note preview will appear here as you type." className="text-sm leading-relaxed text-stone-300" />
                      )}
                      {activeResourceType === "reading" && (
                        <div className="space-y-3">
                          <ResourceRichTextPreview html={resourceBodyHtml} fallback="Add reading notes to preview them here." className="text-sm leading-relaxed text-stone-300" />
                          {resourceInputMode === "upload" && resourceFilePreviewUrl ? <a href={resourceFilePreviewUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-md border border-amber-500/40 px-3 py-2 text-xs  text-amber-400 hover:border-amber-500/40">Open uploaded attachment: {resourceFile?.name}</a> : resourceInputMode === "url" && getResourcePreviewHref(resourceDraft.linkUrl) ? <a href={getResourcePreviewHref(resourceDraft.linkUrl) || undefined} target="_blank" rel="noreferrer" className="inline-flex rounded-md border border-amber-500/40 px-3 py-2 text-xs  text-amber-400 hover:border-amber-500/40">Open or download</a> : resourceDraft.linkUrl.trim() ? <p className="break-all text-xs text-stone-500">{resourceDraft.linkUrl}</p> : <p className="text-xs text-stone-500">Add a reading link or file to preview it here.</p>}
                        </div>
                      )}
                      {activeResourceType === "quiz" && (
                        <div className="rounded-lg border border-[#293343] bg-[#10181f] p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Practice prompt</p>
                          <ResourceRichTextPreview html={resourceBodyHtml} fallback="Your practice prompt will appear here as you type." className="mt-3 text-sm leading-relaxed text-stone-200" />
                        </div>
                      )}
                      {activeResourceType === "audio" && (
                        <div className="space-y-3">
                          {resourceInputMode === "upload" && audioFilePreviewUrl ? <CustomAudioPlayer src="" blob={audioFile || undefined} label={resourceDraft.title.trim() || audioFile?.name || "Audio preview"} /> : resourceInputMode === "url" && getResourcePreviewHref(resourceDraft.linkUrl) ? <CustomAudioPlayer src={getResourcePreviewHref(resourceDraft.linkUrl) || ""} label={resourceDraft.title.trim() || "Audio preview"} /> : <p className="text-sm text-stone-500">Add audio using the selected input method to preview it here.</p>}
                          {resourceDraft.body.trim() && <ResourceRichTextPreview html={resourceBodyHtml} fallback="" className="text-sm leading-relaxed text-stone-400" />}
                        </div>
                      )}
                      {activeResourceType === "image" && (
                        <div className="space-y-3">
                          {resourceInputMode === "upload" && resourceFilePreviewUrl ? <img src={resourceFilePreviewUrl} alt={resourceFile?.name || resourceDraft.title || "Image resource preview"} className="max-h-[520px] w-full rounded-lg border border-[#293343] object-contain" /> : resourceInputMode === "url" && getResourcePreviewHref(resourceDraft.linkUrl) ? <img src={getResourcePreviewHref(resourceDraft.linkUrl) || ""} alt={resourceDraft.title || "Image resource preview"} className="max-h-[520px] w-full rounded-lg border border-[#293343] object-contain" /> : <p className="text-sm text-stone-500">Add an image using the selected input method to preview it here.</p>}
                        </div>
                      )}
                      {activeResourceType === "video" && (
                        <InteractiveVideoBlock
                          videoUrl={resourceInputMode === "upload" ? resourceFilePreviewUrl || "" : resourceDraft.linkUrl}
                          title={resourceDraft.title || "Video resource"}
                        />
                      )}
                      {activeResourceType === "data_table" && (
                        resourceDraft.body.trim() ? <DataTableResource title={resourceDraft.title.trim() || "Data Table"} markdown={resourceDraft.body} html={resourceBodyHtml} /> : <p className="text-sm text-stone-500">Write content or insert a table to preview it here.</p>
                      )}
                      {activeResourceType === "file" && (
                        resourceInputMode === "upload" && resourceFile && resourceFilePreviewUrl ? (() => {
                          const mediaType = getSupportedResourceMediaType(resourceFile);
                          if (mediaType?.startsWith("image/")) return <img src={resourceFilePreviewUrl} alt={resourceFile.name} className="max-h-[520px] w-full rounded-lg border border-[#293343] object-contain" />;
                          if (mediaType === "application/pdf" || mediaType?.startsWith("text/")) return <iframe src={resourceFilePreviewUrl} title={`Preview of ${resourceFile.name}`} className="h-[560px] w-full rounded-lg border border-[#293343] bg-white" />;
                          if (mediaType?.startsWith("audio/")) return <CustomAudioPlayer src="" blob={resourceFile} label={resourceFile.name} />;
                          if (mediaType?.startsWith("video/")) return <video src={resourceFilePreviewUrl} controls preload="metadata" className="max-h-[560px] w-full rounded-lg bg-black" aria-label={`Preview of ${resourceFile.name}`} />;
                          return <div className="space-y-3"><p className="text-sm text-stone-400">This document format opens or downloads instead of displaying inline.</p><a href={resourceFilePreviewUrl} download={resourceFile.name} className="inline-flex rounded-md border border-amber-500/40 px-3 py-2 text-xs  text-amber-400 hover:border-amber-500/40">Open or download {resourceFile.name}</a></div>;
                        })() : resourceInputMode === "url" && getResourcePreviewHref(resourceDraft.linkUrl) ? <a href={getResourcePreviewHref(resourceDraft.linkUrl) || undefined} target="_blank" rel="noreferrer" className="inline-flex rounded-md border border-amber-500/40 px-3 py-2 text-xs  text-amber-400 hover:border-amber-500/40">Open external file</a> : <p className="rounded-lg border border-dashed border-[#394252] p-6 text-center text-sm text-stone-500">Add a file using the selected input method to preview it here.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-[#202631] bg-[#0c1017] p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Library</p>
                      <h4 className="mt-1 font-sans text-lg font-semibold text-stone-100">Saved resources</h4>
                    </div>
                    <span className="rounded-full border border-[#394252] bg-[#171d28] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-stone-300">
                      {studentResources.length} items
                    </span>
                  </div>

                  {studentResources.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-[#202631] bg-[#0b1018] px-4 py-5 text-sm text-stone-500">
                      No resources yet for the active student in this lesson context.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {studentResources.map((resource) => {
                        const isDataTable = resource.resource_type === "data_table" || isDataTableResourceTitle(resource.title);
                        const resourceTitle = isDataTable ? getDataTableResourceTitle(resource.title) : resource.title;
                        const resourceCards = getResourceFlashcards(resource);
                        const isFlashcardDeck = resource.resource_type === "flashcard" || resource.resource_type === "flashcards";
                        const isExpanded = expandedStudentResourceIds.has(resource.id);
                        const previewId = `saved-resource-preview-${resource.id}`;
                        return (
                          <div key={resource.id} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => setExpandedStudentResourceIds((current) => {
                                  const next = new Set(current);
                                  if (next.has(resource.id)) next.delete(resource.id);
                                  else next.add(resource.id);
                                  return next;
                                })}
                                aria-expanded={isExpanded}
                                aria-controls={previewId}
                                className="flex min-w-0 flex-1 items-start gap-2 text-left"
                              >
                                {isExpanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />}
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-stone-100">{resourceTitle}</span>
                                  <span className="mt-1 block text-[10px] uppercase tracking-[0.12em] text-stone-500">
                                    {isFlashcardDeck ? `Flashcard deck · ${resourceCards.length} ${resourceCards.length === 1 ? "card" : "cards"}` : resource.resource_type}
                                  </span>
                                </span>
                              </button>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => editStudentResource(resource)}
                                  className="rounded-md p-1.5 text-stone-500 transition hover:bg-amber-500/10 hover:text-amber-400"
                                  aria-label={`Edit ${resource.title}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteStudentResource(resource)}
                                  className="rounded-md p-1.5 text-stone-500 transition hover:bg-red-500/10 hover:text-red-400"
                                  aria-label={`Delete ${resource.title}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            {isExpanded && (
                              <div id={previewId} className="mt-4 border-t border-[#293343] pt-4">
                                <SavedResourcePreview resource={resource} title={resourceTitle} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
              </div>
            </div>
          </section>
        </>}

        {activeTab === "evaluation" && <>
<div className="mb-6">
<StudentContextPanel
  studentName={selectedStudent?.name || "Selected Student"}
  studentId={selectedStudent?.id}
  studentToken={selectedStudent?.token}
  profile={workstationState.studentProfile}
  onUpdateProfile={(studentProfile: StudentProfile) => setWorkstationState((previous) => ({ ...previous, studentProfile }))}
  onSaveProfile={handleSaveSelectedStudentProfile}
/>
</div>
<section className="mt-8 space-y-8" aria-label="Student submission review workspace">
<div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#202631] pb-4">
<div>
<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Submission Review Workspace</p>
<h2 className="mt-1 font-sans text-xl font-semibold text-stone-100">{selectedStudent?.name || "Selected Student"}&apos;s answers</h2>
<p className="mt-1 text-xs text-amber-400">{selectedStudent?.profile.targetLevel || selectedStudent?.profile.level || "Level not set"}</p>
</div>
<span className={`w-fit rounded-sm border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${submissionStateClass}`}>{submissionState}</span>
</div>
<div>
<SubmissionEvaluator
  key={`${reviewSubmissionLessonId || databaseLessonId || newLesson.slug || lessonId}:${selectedStudentId || "no-student"}`}
  lessonId={reviewSubmissionLessonId || databaseLessonId || newLesson.slug || lessonId}
  studentId={selectedStudentId || undefined}
  pendingSubmissionId={reviewSubmissionId || undefined}
  instructorId={instructorId}
  studentName={selectedStudent?.name || "Selected Student"}
  reportCardStages={reviewStages}
  useSupabase
  evaluation={workstationState.evaluation}
  onUpdateEvaluation={(evaluation: LessonEvaluation) => setWorkstationState((previous) => ({ ...previous, evaluation }))}
  onSubmitFeedback={async (feedback: FeedbackPayload) => {
    if (!selectedStudentId) throw new Error("Select a student before publishing an evaluation.");
    const evaluation = { ...workstationState.evaluation, scores: feedback.scores, comments: feedback.comments, criterionFeedback: feedback.criterionFeedback, stageFeedback: feedback.stageFeedback, published: true };
    const saved = await saveInstructorFeedback(reviewSubmissionLessonId || databaseLessonId || newLesson.slug || lessonId, selectedStudentId, evaluation);
    setWorkstationState((previous) => ({ ...previous, submission: saved.submission || previous.submission, evaluation: saved.evaluation }));
    setPublishStatus("Strengths, study plan, and evaluation synced with student view!");
  }}
/>
</div>
</section>
</>}
      </div>
      {activeTab === "builder" && isSaveBarVisible && <div className="animate-save-bar fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full border border-slate-800 bg-slate-900/90 px-5 py-2.5 shadow-2xl backdrop-blur">
        {showSuccessCheck && !isDraftDirty ? (
          <span role="status" className="whitespace-nowrap text-sm font-medium text-emerald-400">Saved ✓</span>
        ) : (
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saveIndicator === "saving"}
            className="whitespace-nowrap text-sm font-medium text-amber-400 transition hover:text-amber-300 disabled:cursor-wait disabled:opacity-60"
          >
            {saveIndicator === "saving" ? "Saving..." : "Save Changes"}
          </button>
        )}
      </div>}
      <div className={`fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${guidanceOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`} role="presentation" onClick={() => setGuidanceOpen(false)} aria-hidden={!guidanceOpen}>
        <aside className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-amber-500/40 bg-[#0c1017]/95 p-5 text-stone-200 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-in-out ${guidanceOpen ? "translate-x-0" : "translate-x-full"}`} role="dialog" aria-modal={guidanceOpen} aria-labelledby="workstation-guidance-title" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-[#293343] pb-4"><h2 id="workstation-guidance-title" className="flex items-center gap-2 text-sm font-semibold text-amber-400"><Lightbulb className="h-4 w-4" />Lesson Guidance</h2><button type="button" onClick={() => setGuidanceOpen(false)} aria-label="Close lesson guidance" className="rounded-md p-2 text-stone-400 transition hover:bg-white/10 hover:text-stone-100"><X className="h-4 w-4" /></button></div>
          <div className="min-h-0 flex-1 overflow-y-auto py-5"><MarkdownContent value={newLesson.instructorGuidance} className="text-sm leading-relaxed text-stone-300" /></div>
        </aside>
      </div>
  <InstructorChatWidget
    activeStudent={selectedStudent}
    students={students}
        instructorId={instructorId}
    lessonContext={newLesson.title || newLesson.slug || lessonId}
  />
      {lessonPendingDelete && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-lesson-title" aria-describedby="delete-lesson-warning"><div className="w-full max-w-md rounded-xl border border-red-500/30 bg-[#171d28] p-6 shadow-2xl"><h2 id="delete-lesson-title" className="font-sans text-xl font-semibold text-stone-100">Delete lesson permanently?</h2><p id="delete-lesson-warning" className="mt-3 text-sm leading-relaxed text-stone-300">This permanently deletes the lesson, its versions, assignments, submissions, feedback, and lesson-linked student resources. This action cannot be undone.</p><p className="mt-2 truncate text-xs text-amber-400">{lessonPendingDelete.title}</p><div className="mt-6 flex justify-end gap-3"><button type="button" disabled={isDeletingLesson} onClick={() => setLessonPendingDelete(null)} className="rounded-md border border-[#394252] px-4 py-2 text-xs  text-stone-300 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button><button type="button" disabled={isDeletingLesson} onClick={() => void handleDeleteLesson()} className="rounded-md bg-red-500 px-4 py-2 text-xs  text-white hover:bg-red-400 disabled:cursor-wait disabled:opacity-60">{isDeletingLesson ? "Deleting..." : "Delete lesson"}</button></div></div></div>}
    </div>
  );
}