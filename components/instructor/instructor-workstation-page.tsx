"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Grid3X3, List, MoreVertical, Pencil, Plus, Search, Trash2, X, Lightbulb, UploadCloud } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { StudentContextPanel } from "@/components/instructor/student-context-panel";
import { LessonTailorEditor } from "@/components/instructor/lesson-tailor-editor";
import { InstructorBannerManager } from "@/components/instructor/banner-manager";
import { SubmissionEvaluator, FeedbackPayload } from "@/components/instructor/submission-evaluator";
import { ContentBlock, LessonEvaluation, StrictStepContent, StudentProfile, StudentSubmission } from "@/types/lesson";
import { assignLessonToAllActiveStudents, assignLessonToStudent, createLesson, deleteLesson, getLessons, publishLessonAndAssign, setLessonAssignments, unassignLesson, updateLesson, type LessonTags, type LessonWithVersion } from "@/lib/lessons";
import { PublishedLessonState } from "@/lib/lesson-store";
import { deduplicateStudents, StudentUser } from "@/lib/users";
import { FLUENTIA_DATA_UPDATED_EVENT, saveInstructorFeedback } from "@/services/storage-service";
import { AccessCard } from "@/components/access/access-card";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { WritingBlockRenderer } from "@/components/shared/writing-block";
import { DataTableResource, getDataTableResourceTitle, isDataTableResourceTitle } from "@/components/shared/data-table-resource";
import { InteractiveVideoBlock } from "@/components/shared/interactive-video-block";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { Stepper } from "@/components/study-room/stepper";
import { StudyRoomBlockRow } from "@/components/study-room/study-room-block-row";
import { parseInteractiveTranscript } from "@/lib/transcripts";
import { AmbientMusicPlayer } from "@/components/study-room/ambient-music-player";
import { getStudentProfile, saveStudentProfile } from "@/lib/student-profiles";
import { MusicLibraryManager } from "@/components/instructor/music-library-manager";
import { InstructorChatWidget } from "@/components/instructor/instructor-chat-widget";
import { useLessonEditorStore } from "@/lib/lesson-editor-store";

interface InstructorWorkstationProps {
  instructorId: string;
  lessonSlug: string;
}

type SidebarBlock = { id: string; title: string; body: string; parentMainBlockId?: string };
type SidebarBlocksByStep = Partial<Record<"warm_up" | "lesson" | "listening" | "reading" | "writing" | "speaking", SidebarBlock[]>>;

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const EMPTY_LESSON_TAGS: LessonTags = { domain: "", skill_focus: "", practice_type: "", custom: [] };

function normalizeCefrLevel(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return CEFR_LEVELS.includes(normalized as (typeof CEFR_LEVELS)[number]) ? normalized : "B1";
}

function normalizeLessonTags(value: unknown, content: Record<string, any> = {}): LessonTags {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const custom = Array.isArray(source.custom) ? source.custom : Array.isArray(source.custom_tags) ? source.custom_tags : [];
  const stringValue = (candidate: unknown, fallback: unknown) => typeof candidate === "string" ? candidate : typeof fallback === "string" ? fallback : "";
  return {
    domain: stringValue(source.domain, content.domain || content.topicDomain),
    skill_focus: stringValue(source.skill_focus, content.skill_focus || content.skillFocus || content.primarySkill),
    practice_type: stringValue(source.practice_type, content.practice_type || content.practiceType),
    custom: custom.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean),
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
type StudentResourceType = "note" | "reading" | "flashcard" | "quiz" | "audio" | "data_table" | "file";
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
  original_filename?: string | null;
  media_type?: string | null;
  created_at?: string;
  updated_at?: string;
};

const EMPTY_RESOURCE_DRAFT = {
  type: "note" as StudentResourceType,
  title: "",
  body: "",
  linkUrl: "",
  question: "",
  answer: "",
  explanation: "",
};

function getResourcePreviewHref(value?: string | null) {
  if (!value?.trim()) return null;
  const rawUrl = value.trim();
  try {
    const url = new URL(rawUrl, "https://fluentia.invalid");
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
  const transcriptLines = parseInteractiveTranscript(transcript);
  const contentId = `audio-transcript-${resourceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <div className="overflow-hidden rounded-lg border border-[#293343] bg-[#0c1017]/70">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="flex w-full items-center justify-between gap-3 border-b border-[#293343] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400 transition hover:bg-amber-500/5 hover:text-amber-300"
      >
        <span>Transcript</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-amber-400 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div id={contentId} className={`grid transition-[grid-template-rows] duration-300 ease-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          {transcriptLines.length > 0 ? <div className="divide-y divide-[#202631]">
            {transcriptLines.map((line, index) => <div key={`${line.seconds}-${index}`} className="flex items-start gap-3 px-3 py-2.5">
              <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-amber-300">{line.timestamp}</span>
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
  const [selectedStudent, setSelectedStudent] = useState<StudentUser | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [resourceLessonId, setResourceLessonId] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentUser[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  const [databaseLessonId, setDatabaseLessonId] = useState<string | null>(null);
  const [pendingSubmissionCount, setPendingSubmissionCount] = useState(0);
  const [publishedLessonCount, setPublishedLessonCount] = useState(0);
  const [draftLessonCount, setDraftLessonCount] = useState(0);
  const [lessonStatus, setLessonStatus] = useState<"draft" | "published">("published");
  const [activeTab, setActiveTab] = useState<"dashboard" | "library" | "resources" | "builder" | "evaluation" | "music">("dashboard");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryLevel, setLibraryLevel] = useState("all");
  const [libraryDomain, setLibraryDomain] = useState("all");
  const [librarySortBy, setLibrarySortBy] = useState<"title" | "domain" | "practiceType" | "skillFocus">("title");
  const [libraryView, setLibraryView] = useState<"grid" | "table">("grid");
  const [assignmentEditorLessonId, setAssignmentEditorLessonId] = useState<string | null>(null);
  const [quickTagEditor, setQuickTagEditor] = useState<{ lessonId: string; level: string; tags: LessonTags; customTagsText: string } | null>(null);
  const [quickTagSaving, setQuickTagSaving] = useState(false);
  const [quickTagError, setQuickTagError] = useState<string | null>(null);
  const [heroBannerOpen, setHeroBannerOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [activeStudentsOpen, setActiveStudentsOpen] = useState(false);
  const [sidebarStep, setSidebarStep] = useState<keyof SidebarBlocksByStep>("warm_up");
  const [sidebarBlocksByStep, setSidebarBlocksByStep] = useState<SidebarBlocksByStep>({});
  const [lessonResources, setLessonResources] = useState<LessonResource[]>([]);
  const [studentResources, setStudentResources] = useState<StudentResourceEntry[]>([]);
  const [resourceDraft, setResourceDraft] = useState(EMPTY_RESOURCE_DRAFT);
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
    customBannerUrl: string;
    studentProfile: StudentProfile;
    evaluation: LessonEvaluation;
    submission?: StudentSubmission;
  }>({
    content: {},
    bannerUrl: "",
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
  const [viewMode, setViewMode] = useState<"instructor" | "student">("instructor");
  const [previewStep, setPreviewStep] = useState<"warm_up" | "lesson" | "listening" | "reading" | "writing" | "speaking" | "results">("warm_up");
  const [saveIndicator, setSaveIndicator] = useState<"idle" | "saving" | "saved" | "error">("idle");
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
  const [validationErrors, setValidationErrors] = useState<Partial<Record<"selectedStudentId" | "title" | "slug" | "moduleNumber", string>>>({});
  const [createdLessons, setCreatedLessons] = useState<LessonWithVersion[]>([]);
  const [lessonPendingDelete, setLessonPendingDelete] = useState<LessonWithVersion | null>(null);
  const [isDeletingLesson, setIsDeletingLesson] = useState(false);
  const activeBuilderStudent = selectedStudent ?? (selectedStudentId ? students.find((student) => student.id === selectedStudentId) ?? null : null);
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
    pendingAutoSave.current = false;
    saveInFlight.current = false;
    activeLessonIdRef.current = null;
    hasLoadedLesson.current = false;
    lastSavedDraftSignature.current = null;
    resetStore();
    setDatabaseLessonId(null);
    setResourceLessonId(null);
    setSidebarBlocksByStep({});
    setSidebarStep("warm_up");
    setLessonResources([]);
    setSelectedStudentId(studentId || null);
    setSelectedStudent(studentId ? students.find((student) => student.id === studentId) || null : null);
    setNewLesson({ studentId, title: "", slug: "", subtitle: "", instructorGuidance: "", moduleNumber: "", level: "B1", tags: { ...EMPTY_LESSON_TAGS }, customTagsText: "", status: "draft" });
    setWorkstationState((previous) => ({
      ...previous,
      content: {},
      bannerUrl: "",
      customBannerUrl: "",
      studentProfile: { fullName: "", level: "", targetGoal: "", weaknesses: [], teacherNotes: "", attendanceRate: 0, completedModulesCount: 0 },
      evaluation: { scores: { task: 4, coherence: 4, lexical: 3, grammar: 4 }, comments: "", criterionFeedback: {}, published: false },
      submission: undefined,
    }));
    setLessonStatus("draft");
    setSaveIndicator("idle");
    setValidationErrors({});
    setPublishStatus(null);
    setViewMode("instructor");
    setPreviewStep("warm_up");
    setAudioFile(null);
    setResourceFile(null);
    setResourceDraft(EMPTY_RESOURCE_DRAFT);
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

  const getDraftSignature = (content: StrictStepContent, title: string, subtitle: string, moduleNumber: string) =>
    JSON.stringify({
      content,
      title: title.trim() || "Untitled Lesson",
      subtitle: subtitle.trim() || "A new Fluentia learning journey.",
      moduleNumber: Number(moduleNumber) || 1,
      bannerUrl: workstationState.bannerUrl,
      sidebarBlocksByStep,
      instructorGuidance: newLesson.instructorGuidance,
      lessonResources,
    });

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
    setSelectedStudent(student);
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
          level: savedProfile.level || previous.studentProfile.level,
          targetGoal: savedProfile.targetGoal || previous.studentProfile.targetGoal,
          teacherNotes: savedProfile.teacherNotes || previous.studentProfile.teacherNotes,
        },
      }));
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
    pendingAutoSave.current = false;
    saveInFlight.current = false;
    activeLessonIdRef.current = lesson.id;
    lastSavedDraftSignature.current = null;
    bindLesson(lesson);
    const content = lesson.content || {};
    const lessonSlug = typeof content.slug === "string" ? content.slug : lesson.id;
    const savedStudentId = getSavedStudentId(lesson);
    const savedStudent = savedStudentId
      ? students.find((student) => student.id === savedStudentId || student.token === savedStudentId)
      : undefined;
    hasLoadedLesson.current = false;
    setSelectedStudentId(savedStudentId);
    if (savedStudent) setSelectedStudent(savedStudent);
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
    pendingAutoSave.current = false;
    saveInFlight.current = false;
    activeLessonIdRef.current = null;
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
    setSelectedStudent(null);
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

    if (resourceType === "flashcard" && (!resourceDraft.question.trim() || !resourceDraft.answer.trim())) {
      setResourceStatus("Flashcards need both a question and an answer.");
      return;
    }

    if (resourceType === "reading" && !resourceDraft.linkUrl.trim() && !resourceDraft.body.trim()) {
      setResourceStatus("Add a link or reading notes for this resource.");
      return;
    }

    if (resourceType === "data_table" && !resourceDraft.body.trim()) {
      setResourceStatus("Add Markdown table content before saving this Data Table.");
      return;
    }

    if (resourceType === "audio" && !resourceDraft.linkUrl.trim() && !audioFile) {
      setResourceStatus("Add an audio URL or choose an audio file.");
      return;
    }

    if (resourceType === "audio" && audioFile && !audioFile.type.startsWith("audio/")) {
      setResourceStatus("Choose a valid audio file.");
      return;
    }

    if (resourceType === "file" && !resourceFile) {
      setResourceStatus("Choose a file to upload.");
      return;
    }

    const resourceFileMediaType = resourceFile ? getSupportedResourceMediaType(resourceFile) : null;
    if (resourceType === "file" && resourceFile && !resourceFileMediaType) {
      setResourceStatus("Choose an image, text document, PDF, audio, or video file.");
      return;
    }

    if (resourceType === "file" && resourceFile && resourceFile.size > 50 * 1024 * 1024) {
      setResourceStatus("Files must be 50 MB or smaller.");
      return;
    }

    const studentToken = resolvedStudent.token || resolvedStudent.id;
    const storedResourceType: StudentResourceType = resourceType;
    let resourceFileStoragePath: string | null = null;
    try {
      let audioUrl = resourceDraft.linkUrl.trim();
      let resourceFileUrl = "";
      if (resourceType === "audio" && !audioUrl && audioFile) {
        const path = `student-resources/${resolvedStudent.id}/${Date.now()}-${audioFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: uploadError } = await supabase.storage.from("lesson-audio").upload(path, audioFile, {
          contentType: audioFile.type,
          upsert: false,
        });
        if (uploadError) {
          setResourceStatus("Audio upload failed. Check the storage bucket permissions and try again.");
          return;
        }
        audioUrl = supabase.storage.from("lesson-audio").getPublicUrl(path).data.publicUrl;
      }
      if (resourceType === "file" && resourceFile && resourceFileMediaType) {
        const safeFileName = resourceFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        resourceFileStoragePath = `${resolvedStudent.id}/${resolvedLessonId}/${crypto.randomUUID()}-${safeFileName}`;
        const { error: uploadError } = await supabase.storage.from("student-resources").upload(resourceFileStoragePath, resourceFile, {
          contentType: resourceFileMediaType,
          upsert: false,
        });
        if (uploadError) {
          setResourceStatus("File upload failed. Check the student-resources bucket permissions and try again.");
          return;
        }
        resourceFileUrl = supabase.storage.from("student-resources").getPublicUrl(resourceFileStoragePath).data.publicUrl;
      }
      const payload = Object.fromEntries(
        Object.entries({
          student_id: resolvedStudent.id,
          student_token: studentToken,
          lesson_id: resolvedLessonId,
          type: storedResourceType,
          resource_type: storedResourceType,
          title: trimmedTitle,
          updated_at: new Date().toISOString(),
          ...(resourceType === "note" || resourceType === "reading" || resourceType === "quiz" || resourceType === "audio" || resourceType === "data_table"
            ? { body: resourceDraft.body.trim() || undefined }
            : {}),
          ...(resourceType === "reading" || resourceType === "audio" || resourceType === "file"
            ? { link_url: (resourceType === "file" ? resourceFileUrl : audioUrl) || undefined }
            : {}),
          ...(resourceType === "file" && resourceFile
            ? { original_filename: resourceFile.name, media_type: resourceFileMediaType || undefined }
            : {}),
          ...(resourceType === "flashcard"
            ? {
                question: resourceDraft.question.trim() || undefined,
                answer: resourceDraft.answer.trim() || undefined,
                explanation: resourceDraft.explanation.trim() || undefined,
              }
            : {}),
        }).filter(([, value]) => value !== undefined && value !== null && (typeof value !== "string" || value.trim() !== "")),
      ) as Pick<StudentResourceEntry, "student_id" | "student_token" | "lesson_id" | "resource_type" | "title">
        & Partial<Pick<StudentResourceEntry, "body" | "link_url" | "question" | "answer" | "explanation" | "original_filename" | "media_type">>
        & { updated_at: string };

      const { data, error } = await supabase
        .from("student_resources")
        .insert(payload)
        .select()
        .abortSignal(AbortSignal.timeout(8000))
        .single();

      if (error) {
        if (resourceFileStoragePath) {
          await supabase.storage.from("student-resources").remove([resourceFileStoragePath]);
          resourceFileStoragePath = null;
        }
        if (error.code === "PGRST205" || /does not exist|42P01/i.test(error.message || "")) {
          if (resourceType === "file") {
            throw new Error("Apply migration 022 before saving file resources.");
          }
          const localEntry: StudentResourceEntry = {
            id: `local-${Date.now()}`,
            ...payload,
            created_at: new Date().toISOString(),
          };
          const next = [localEntry, ...readStudentResourcesLocally(studentToken)];
          setStudentResources(next);
          writeStudentResourcesLocally(studentToken, next);
          setResourceDraft(EMPTY_RESOURCE_DRAFT);
          setAudioFile(null);
          setResourceFile(null);
          setResourceStatus("Resource saved locally because the student_resources table is not available yet.");
          return;
        }
        throw error;
      }

      const next = [
        { ...payload, ...data, created_at: data?.created_at || new Date().toISOString(), updated_at: data?.updated_at || new Date().toISOString() },
        ...studentResources,
      ];
      setStudentResources(next);
      writeStudentResourcesLocally(studentToken, next);
      setResourceDraft(EMPTY_RESOURCE_DRAFT);
      setAudioFile(null);
      setResourceFile(null);
      setResourceStatus("Resource saved to the selected student.");
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
    if (resource.resource_type === "file" && resource.link_url) {
      try {
        const resourceUrl = new URL(resource.link_url);
        const storagePrefix = "/storage/v1/object/public/student-resources/";
        const storagePath = resourceUrl.pathname.includes(storagePrefix)
          ? decodeURIComponent(resourceUrl.pathname.split(storagePrefix)[1] || "")
          : "";
        if (storagePath) {
          const { error: storageError } = await supabase.storage.from("student-resources").remove([storagePath]);
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
    if (!databaseLessonId || students.length === 0) return;
    const currentLesson = createdLessons.find((lesson) => lesson.id === databaseLessonId);
    if (!currentLesson) return;
    const savedStudentId = getSavedStudentId(currentLesson);
    if (!savedStudentId) return;
    const matchingStudent = students.find(
      (student) => student.id === savedStudentId
    );
    if (!matchingStudent) return;
    setSelectedStudentId(matchingStudent.id);
    setSelectedStudent(matchingStudent);
    setNewLesson((previous) => ({ ...previous, studentId: matchingStudent.id }));
  }, [databaseLessonId, createdLessons, students]);

  async function handleCreateLesson() {
    const draftStudentId = selectedStudentId || newLesson.studentId || selectedStudent?.id || "";
    const student = students.find((item) => item.id === draftStudentId)
      || (selectedStudent?.id === draftStudentId ? selectedStudent : null);
    if (!student) {
      setValidationErrors({ selectedStudentId: "Select a student before creating the draft." });
      setPublishStatus("Select a student before creating the draft.");
      return;
    }
    const title = newLesson.title.trim() || "Untitled Draft";
    const slug = newLesson.slug.trim().toLowerCase() || `draft-${Date.now()}`;
    const moduleNumber = Number(newLesson.moduleNumber) || 1;
    const assignedStudentId = student.id;
    const assignedStudentToken = student.token;

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
        student_id: assignedStudentId,
        student_token: assignedStudentToken,
        coverImage: workstationState.bannerUrl,
        bannerUrl: workstationState.bannerUrl,
        sidebarBlocks: sidebarBlocksByStep,
      instructorGuidance: newLesson.instructorGuidance,
      lessonResources,
      };
      const created = await createLesson({
        title,
        banner_url: workstationState.bannerUrl,
        student_id: student.id,
        student_token: student.token,
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
      setSelectedStudentId(student.id);
      setNewLesson((previous) => ({ ...previous, studentId: student.id, title: lesson.title, slug, moduleNumber: String(moduleNumber), status: "draft" }));
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
    if (!databaseLessonId || !hasLoadedLesson.current) return;
    const draftSignature = getDraftSignature(workstationState.content, newLesson.title, newLesson.subtitle, newLesson.moduleNumber);
    if (lastSavedDraftSignature.current === null) {
      lastSavedDraftSignature.current = draftSignature;
      return;
    }
    if (lastSavedDraftSignature.current === draftSignature) return;
    setSaveIndicator("saving");
    const saveAfterInactivity = () => {
      const elapsed = Date.now() - lastInputAt.current;
      if (elapsed < 3000) return window.setTimeout(saveAfterInactivity, 3000 - elapsed);
      void saveLessonChanges(newLesson.status === "published" ? "published" : "draft", true);
      return undefined;
    };
    const timer = window.setTimeout(saveAfterInactivity, 5000);
    return () => window.clearTimeout(timer);
  }, [workstationState.content, workstationState.bannerUrl, newLesson.title, newLesson.subtitle, newLesson.moduleNumber, sidebarBlocksByStep, databaseLessonId]);

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
          supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
          supabase.from("lessons").select("id", { count: "exact", head: true }).eq("status", "published"),
          supabase.from("lessons").select("id", { count: "exact", head: true }).eq("status", "draft"),
        ]);
        const { data: studentRows, error: studentError } = await supabase
          .from("students")
          .select("id, name, email, token")
          .order("name", { ascending: true });
        if (studentError) {
          console.error("Failed to load students:", { code: studentError.code, message: studentError.message, details: studentError.details, hint: studentError.hint });
          throw new Error(studentError.message || "Unable to load students");
        }
        if (cancelled) return;
        setPendingSubmissionCount(pendingResult.status === "fulfilled" ? pendingResult.value.count ?? 0 : 0);
        setPublishedLessonCount(publishedResult.status === "fulfilled" ? publishedResult.value.count ?? 0 : 0);
        setDraftLessonCount(draftsResult.status === "fulfilled" ? draftsResult.value.count ?? 0 : 0);
        const nextStudents: StudentUser[] = deduplicateStudents(studentRows || []).map((student) => ({
          id: student.id,
          token: student.token,
          name: student.name,
          email: student.email,
          role: "student",
          profile: {
            id: student.id,
            fullName: student.name,
            level: "",
            targetGoal: "",
            weaknesses: [],
            teacherNotes: "",
            attendanceRate: 0,
            completedModulesCount: 0,
          },
        }));
        setStudents(nextStudents);
        if (nextStudents.length > 0 && (!selectedStudent || !nextStudents.some((student) => student.id === selectedStudent.id))) {
          setSelectedStudent(nextStudents[0]);
          setSelectedStudentId(nextStudents[0].id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load students";
        if (!cancelled) {
          setStudents([]);
          setStudentsError(message);
          console.error("Instructor workstation student loading failed:", message);
        }
      } finally {
        if (!cancelled) setStudentsLoading(false);
      }
    };
    const refreshCounts = () => void loadCounts();
    void loadCounts();
    window.addEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshCounts);
    window.addEventListener("fluentia:lesson-updated", refreshCounts);
    return () => {
      cancelled = true;
      window.removeEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshCounts);
      window.removeEventListener("fluentia:lesson-updated", refreshCounts);
    };
  }, []);

  useEffect(() => {
    if (!selectedStudent || !resourceLessonId) {
      setStudentResources([]);
      return;
    }
    void loadStudentResources(selectedStudent, resourceLessonId);
  }, [selectedStudent?.id, selectedStudent?.token, resourceLessonId]);

  const flashcards = studentResources.filter((resource) => resource.resource_type === "flashcard");

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

  const saveLessonChanges = async (status: "draft" | "published", isAutoSave = false) => {
    const selectedLessonId = databaseLessonId;
    if (selectedLessonId && activeLessonIdRef.current !== selectedLessonId) return;
    if (isAutoSave && saveInFlight.current) {
      pendingAutoSave.current = true;
      return;
    }
    saveInFlight.current = true;
    const title = newLesson.title.trim() || "Untitled Draft";
    const slug = newLesson.slug.trim().toLowerCase() || `draft-${Date.now()}`;
    const moduleNumber = Number(newLesson.moduleNumber) || 1;
    if (status === "published" && !isAutoSave) {
      const errors: typeof validationErrors = {};
      if (!selectedStudentId) errors.selectedStudentId = "Select a student.";
      if (!newLesson.title.trim()) errors.title = "Enter a lesson title.";
      else if (newLesson.slug.trim() && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newLesson.slug.trim().toLowerCase())) errors.slug = "Use lowercase letters, numbers, and hyphens only.";
      if (!newLesson.moduleNumber.trim() || !Number.isInteger(Number(newLesson.moduleNumber)) || Number(newLesson.moduleNumber) < 1) errors.moduleNumber = "Enter a whole module number greater than zero.";
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        setPublishStatus("Fix the highlighted fields before publishing.");
        saveInFlight.current = false;
        return;
      }
    }
    const studentId = selectedStudentId || newLesson.studentId || selectedStudent?.id || "";
    if (!studentId) {
      setPublishStatus("Select a student before saving the lesson.");
      saveInFlight.current = false;
      return;
    }
    setValidationErrors({});
    setSaveIndicator("saving");
    if (!isAutoSave) setIsPublishing(true);
    const assignedStudent = students.find(
      (student) => student.id === studentId
    ) || (selectedStudent?.id === studentId ? selectedStudent : null);
    if (!assignedStudent?.id) {
      setSaveIndicator("error");
      setPublishStatus("Select a valid student before saving the lesson.");
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
      student_id: assignedStudent.id,
      student_token: assignedStudent.token,
      coverImage: workstationState.bannerUrl,
      bannerUrl: workstationState.bannerUrl,
      sidebarBlocks: sidebarBlocksByStep,
      instructorGuidance: newLesson.instructorGuidance,
      lessonResources,
    };
    const requestId = ++saveRequestId.current;
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
            student_id: assignedStudent.id,
            student_token: assignedStudent.token,
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
            student_id: assignedStudent.id,
            student_token: assignedStudent.token,
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
        content: JSON.stringify(previous.content) === JSON.stringify(workstationState.content) ? lesson.content || content : previous.content,
        bannerUrl: workstationState.bannerUrl,
      }));
      hasLoadedLesson.current = true;
      await refreshCreatedLessons();
      window.dispatchEvent(new Event("fluentia:lesson-updated"));
      setLessonStatus(status);
      setSaveIndicator("saved");
      lastSavedDraftSignature.current = getDraftSignature(content, title, content.subtitle, String(moduleNumber));
      let assignmentSyncWarning = "";
      if (status === "published") {
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
        if (pendingAutoSave.current) {
          pendingAutoSave.current = false;
          const latestSignature = getDraftSignature(workstationState.content, newLesson.title, newLesson.subtitle, newLesson.moduleNumber);
          if (latestSignature !== lastSavedDraftSignature.current) {
            window.setTimeout(() => void saveLessonChanges(status, true), 0);
          }
        }
      }
    }
  };

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
    const content = {
      ...(lesson.content || {}),
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
        content,
        changes_summary: "Lesson level and tags updated",
      });
      setCreatedLessons((current) => current.map((item) => item.id === updatedLesson.id
        ? { ...updatedLesson, assigned_student_ids: item.assigned_student_ids || [] }
        : item));
      window.dispatchEvent(new Event("fluentia:lesson-updated"));
      setQuickTagEditor(null);
    } catch (error) {
      setQuickTagError(error instanceof Error ? error.message : "Unable to save lesson tags.");
    } finally {
      setQuickTagSaving(false);
    }
  };

  const handleConfirmPublish = () => {
    void saveLessonChanges("published");
  };

  const handleUnpublish = () => {
    if (lessonStatus !== "published") return;
    void saveLessonChanges("draft");
  };

  const submissionState = workstationState.submission?.status === "reviewed" || workstationState.evaluation.published
    ? "Reviewed"
    : workstationState.submission?.status === "submitted"
      ? "Submitted (Needs Review)"
      : workstationState.submission?.status === "in_progress"
        ? "In Progress"
        : "Not Started";
  const submissionStateClass = submissionState === "Reviewed"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
    : submissionState === "Submitted (Needs Review)"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : "border-[#394252] bg-[#171d28] text-stone-400";

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
  const conceptualFramingBlock = previewBlocks.find((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text" && /conceptual framing/i.test(block.title || ""));
  const stageContentBlocks = conceptualFramingBlock ? previewBlocks.filter((block) => block.id !== conceptualFramingBlock.id) : previewBlocks;

  const renderPreviewStep = () => {
    if (previewStep==="results") {
      const answerKeys: Record<string,string> = {};
      for (const k of ["warm_up","lesson","listening","reading"] as const) {
        const bs=((workstationState.content[k] as {blocks?:ContentBlock[]}|undefined)?.blocks||[]) as ContentBlock[];
        bs.forEach(b=>{ if(b.type==="question"&&b.correct_answer) answerKeys[b.id]=b.correct_answer; if(b.type==="quiz") (b.questions||[]).forEach(q=>{ const v=q.correct_answer||q.correctAnswer||""; if(v) answerKeys[q.id]=v; }); });
      }
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-500/20 bg-[#0c1017] p-4 text-sm text-stone-400">Results — correct answers as the student will see after submission.</div>
          {Object.keys(answerKeys).length? Object.entries(answerKeys).map(([id,ans])=><div key={id} className="rounded-lg border border-[#293343] bg-[#0c1017] p-3"><p className="text-xs text-stone-500">{id}</p><p className="text-sm text-amber-200">{ans}</p></div>) : <p className="text-xs text-stone-500">No answer keys configured.</p>}
        </div>
      );
    }
    const previewSidebarBlocks = sidebarBlocksByStep[previewStep as keyof SidebarBlocksByStep] || [];
    const linkedSidebarIds = new Set([
      ...previewSidebarBlocks.filter((sidebarBlock) => sidebarBlock.parentMainBlockId).map((sidebarBlock) => sidebarBlock.id),
      ...previewBlocks.filter((block) => block.layoutMode === "inline-row" && block.sidebarBlockId).map((block) => block.sidebarBlockId),
    ]);
    const topSidebarBlocks = previewSidebarBlocks.filter((sidebarBlock) => !linkedSidebarIds.has(sidebarBlock.id));
    return (
    <div className="w-full space-y-6">
      {conceptualFramingBlock && <article key={conceptualFramingBlock.id} className="mb-6 w-full rounded-xl border border-[#202631] bg-[#121721] p-5">
        {conceptualFramingBlock.title && <h3 className="mb-3 font-sans text-xl font-semibold text-stone-100">{conceptualFramingBlock.title}</h3>}
        <MarkdownContent value={conceptualFramingBlock.body || ""} className="text-sm leading-relaxed text-stone-300" />
      </article>}
      {stageContentBlocks.map((block: ContentBlock, blockIndex) => {
        const sidebarBlock = (sidebarBlocksByStep[previewStep as keyof SidebarBlocksByStep] || []).find((candidate) => candidate.parentMainBlockId === block.id)
          || (block.layoutMode === "inline-row" && block.sidebarBlockId
            ? (sidebarBlocksByStep[previewStep as keyof SidebarBlocksByStep] || []).find((candidate) => candidate.id === block.sidebarBlockId)
            : undefined);
        const article = (
        <article key={block.id} className="rounded-xl border border-[#202631] bg-[#121721] p-5">
          {block.title && <h3 className="mb-3 font-sans text-xl font-semibold text-stone-100">{block.title}</h3>}
          {block.type === "text" && <>{<MarkdownContent value={block.body || "No text added yet."} className="text-sm leading-relaxed text-stone-300" />}{block.hasStudentResponseInput === true && <textarea rows={6} placeholder="Write your response here..." readOnly className="mt-4 min-h-[140px] w-full resize-y rounded border border-[#394252] bg-[#171d28] p-3 text-sm text-stone-400" aria-label="Student response field preview" />}</>}
          {block.type === "image" && <>{block.imageUrl ? <img src={block.imageUrl} alt={block.caption || block.title || "Lesson image"} className="max-h-72 w-full rounded-md object-cover" onError={(e)=>{(e.target as HTMLImageElement).style.display="none";}} /> : <p className="text-xs text-stone-500">Image not configured.</p>}{block.caption && <p className="mt-2 text-xs text-stone-500">{block.caption}</p>}</>}
          {block.type === "audio" && <CustomAudioPlayer src={block.audioUrl} label={block.title || "Audio lesson"} />}
          {block.type === "video" && <><InteractiveVideoBlock videoUrl={block.videoUrl} title={block.title || "Lesson video"} transcript={block.transcript} />{block.show_reflection_prompt !== false && <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4"><p className="text-sm font-semibold text-amber-200">Reflection Question</p><p className="mt-2 text-sm leading-relaxed text-stone-300">{block.reflection_prompt_text?.trim() || "Think of an everyday product or app you use that frustrates you. Is it a problem of aesthetics or functionality? How would you redesign it?"}</p><textarea rows={4} placeholder="Write your reflection here..." readOnly className="mt-3 w-full resize-y rounded border border-[#394252] bg-[#171d28] p-3 text-sm text-stone-400" aria-label="Reflection question response preview" /></div>}</>}
          {block.type === "resource" && <a href={block.resourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200 hover:border-amber-400">Open document{block.description ? `: ${block.description}` : ""}</a>}
          {block.type === "question" && <div className="space-y-2"><MarkdownContent value={block.prompt || "Question not configured."} className="text-sm text-stone-300" />{(block.question_type || "multiple_choice") === "open_ended" ? <><textarea rows={6} placeholder="Student response" readOnly className="min-h-[140px] w-full resize-y rounded border border-[#394252] bg-[#171d28] p-3 text-sm text-stone-400" />{block.sample_answer && <MarkdownContent value={block.sample_answer} className="rounded border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-stone-300" />}</> : <div className="flex flex-wrap gap-2">{block.options.filter(Boolean).map((option) => <span key={option} className="rounded border border-[#394252] px-2 py-1 text-xs text-stone-400">{option}</span>)}</div>}</div>}
          {block.type === "quiz" && <div className="space-y-3">{(block.questions || []).map((question, index) => <div key={`${block.id}-${index}`}><MarkdownContent value={question.prompt || "Question not configured."} className="text-sm text-stone-300" /><div className="mt-2 flex flex-wrap gap-2">{question.options.map((option) => <span key={option} className="rounded border border-[#394252] px-2 py-1 text-xs text-stone-400">{option || "Option"}</span>)}</div></div>)}</div>}
          {block.type === "writing" && <WritingBlockRenderer block={block} isPreview />}
        </article>
        );
        return <StudyRoomBlockRow key={block.id} sidebar={<>{blockIndex === 0 && topSidebarBlocks.map((topSidebarBlock) => <div key={topSidebarBlock.id} className="rounded-xl border border-[#202631] bg-[#121721] p-4"><p className="text-xs font-semibold text-amber-400">{topSidebarBlock.title}</p><MarkdownContent value={topSidebarBlock.body || "—"} className="mt-2 text-sm leading-relaxed text-stone-300 [&_strong]:font-semibold [&_strong]:text-amber-400" /></div>)}{sidebarBlock && <div className="rounded-xl border border-[#202631] bg-[#121721] p-4"><p className="text-xs font-semibold text-amber-400">{sidebarBlock.title}</p><MarkdownContent value={sidebarBlock.body || "—"} className="mt-2 text-sm leading-relaxed text-stone-300 [&_strong]:font-semibold [&_strong]:text-amber-400" /></div>}</>}>{article}</StudyRoomBlockRow>;
      })}
      {stageContentBlocks.length === 0 && !conceptualFramingBlock && <p className="rounded-lg border border-dashed border-[#394252] p-6 text-sm text-stone-500">This step has no content blocks yet.</p>}
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
  const activeResourceType = resourceDraft.type;

  if (!isMounted) return null;
  if (accessDenied) return <AccessCard title="Access Denied" message="Your instructor account does not have access to this workspace." />;

  return (
    <div className="min-h-screen w-full bg-[#0c1017] font-sans text-[#e8e7e4]">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 md:py-8">
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
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold ${lessonStatus === "published" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}><span className={`h-1.5 w-1.5 rounded-full ${lessonStatus === "published" ? "bg-emerald-400" : "bg-amber-400"}`} />{lessonStatus === "published" ? "Published" : "Draft"}</span>
              <div role="group" aria-label="Workstation view" className="inline-flex rounded-md border border-[#394252] bg-[#0c1017] p-0.5">
                <button type="button" aria-pressed={viewMode === "instructor"} onClick={() => setViewMode("instructor")} className={`rounded px-2.5 py-1.5 text-[11px] font-semibold transition ${viewMode === "instructor" ? "bg-amber-500 text-slate-950" : "text-stone-400 hover:text-stone-100"}`}>Edit Mode</button>
                <button type="button" aria-pressed={viewMode === "student"} onClick={() => setViewMode("student")} className={`rounded px-2.5 py-1.5 text-[11px] font-semibold transition ${viewMode === "student" ? "bg-amber-500 text-slate-950" : "text-stone-400 hover:text-stone-100"}`}>Student View</button>
              </div>
              <button type="button" onClick={handleSaveDraft} className="rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-400">Save Changes</button>
              {lessonStatus === "published" ? <button type="button" onClick={handleUnpublish} disabled={isPublishing || !databaseLessonId} className="rounded-md border border-[#394252] px-3 py-2 text-xs font-semibold text-stone-300 transition hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50">Unpublish</button> : <button type="button" onClick={handleConfirmPublish} disabled={isPublishing} className="rounded-md border border-[#394252] px-3 py-2 text-xs font-semibold text-stone-300 transition hover:border-amber-500/60 hover:text-amber-300 disabled:cursor-wait disabled:opacity-60">Publish</button>}
            </div>
            <div className="flex min-h-5 w-full max-w-xl justify-end gap-3 text-xs" aria-live="polite">
              {publishStatus && <span className="truncate text-amber-300">{publishStatus}</span>}
              {databaseLessonId && <span className={saveIndicator === "error" ? "text-red-300" : "text-stone-500"}>{saveIndicator === "saving" ? "Saving" : saveIndicator === "saved" ? "Saved" : saveIndicator === "error" ? "Save failed" : "Ready"}</span>}
            </div>
          </div>}
        </header>

        <nav className="sticky top-0 z-20 mb-8 border-b border-[#202631] bg-[#0c1017]/95 backdrop-blur" aria-label="Instructor workstation views">
          <div className="flex items-center justify-between gap-4 overflow-x-auto">
            <div className="flex shrink-0 gap-1">
              {([["dashboard", "Dashboard"], ["library", "Lesson Library"], ["builder", "Lesson Builder"], ["evaluation", "Student Evaluation"], ["music", "Music Library"]] as const).map(([tab, label]) => <button key={tab} type="button" onClick={() => handleWorkspaceTabChange(tab)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition ${activeTab === tab ? "border-amber-500 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-200"}`}>{label}</button>)}
            </div>
            <label className="flex w-64 max-w-[240px] shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400">
              <span className="sr-only">Active student</span>
              <select value={selectedStudentId || ""} onChange={(event) => { const nextStudent = students.find((student) => student.id === event.target.value); if (nextStudent) void handleStudentChange(nextStudent); }} className="w-full rounded-md border border-amber-500/50 bg-[#171d28] px-3 py-2 text-xs font-medium normal-case tracking-normal text-white outline-none transition-colors hover:border-amber-400 focus:border-amber-400 [color-scheme:dark]" aria-label="Select active student">
                <option value="" className="bg-[#0c1017] text-white">{studentsLoading ? "Loading students..." : studentsError ? "Unable to load students" : students.length === 0 ? "No registered students" : "Choose a student"}</option>
                {students.map((student) => <option key={student.id} value={student.id} className="bg-[#0c1017] text-white">{student.name}</option>)}
              </select>
            </label>
          </div>
        </nav>

        {activeTab === "dashboard" && <section className="space-y-6" aria-label="Instructor dashboard overview">
          <div className="grid items-start gap-4 md:grid-cols-4">
            <button type="button" onClick={() => setActiveTab("evaluation")} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-left transition hover:border-amber-500/60">
<p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Pending Evaluations</p>
<p className="mt-2 text-2xl font-semibold text-stone-100">{pendingSubmissionCount}</p>
<p className="mt-1 text-xs text-stone-500">Student submissions awaiting review</p>
</button>
            <button type="button" onClick={() => handleWorkspaceTabChange("builder")} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-left transition hover:border-amber-500/60">
<p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Drafts</p>
<p className="mt-2 text-2xl font-semibold text-stone-100">{draftLessonCount}</p>
<p className="mt-1 text-xs text-stone-500">Open the lesson builder</p>
</button>
            <button type="button" onClick={() => handleWorkspaceTabChange("builder")} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-left transition hover:border-amber-500/60">
<p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Published Lessons</p>
<p className="mt-2 text-2xl font-semibold text-stone-100">{publishedLessonCount}</p>
<p className="mt-1 text-xs text-stone-500">Open the lesson builder</p>
</button>
            <details open={activeStudentsOpen} onToggle={(event) => setActiveStudentsOpen(event.currentTarget.open)} className="relative self-start rounded-xl border border-[#202631] bg-[#171d28]/60 text-left transition hover:border-amber-500/60">
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
</div>
<div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
<h2 className="font-sans text-xl font-semibold text-stone-100">Recent Activity</h2>
<p className="mt-3 text-sm text-stone-400">{selectedStudent ? `${selectedStudent.name} is the active student workspace.` : "Choose a student to open a workspace."}</p>
<button type="button" onClick={() => setActiveTab("evaluation")} className="mt-4 text-xs font-semibold text-amber-300 hover:text-amber-200">Review student work</button>
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
                <button type="button" onClick={startNewLesson} className="rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-400">Create New Lesson</button>
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
                    <td className="min-w-0 px-5 py-4"><button type="button" onClick={() => handleEditLesson(lesson)} className="block min-w-0 max-w-full text-left"><p className="truncate font-semibold text-stone-100" title={lesson.title}>{lesson.title}</p><p className="mt-1 truncate text-[11px] text-stone-400" title={lesson.content?.subtitle || lesson.subtitle || "No subtitle"}>{lesson.content?.subtitle || lesson.subtitle || "No subtitle"}</p><p className="mt-1 truncate text-[10px] text-stone-600" title={lesson.content?.slug || lesson.id}>{lesson.content?.slug || lesson.id}</p></button></td>
                    <td className="min-w-0 px-4 py-4 text-stone-300" onClick={(event) => event.stopPropagation()}><div className="flex min-w-0 items-center gap-2">{renderAssignedStudents(lesson)}<select defaultValue="" onChange={(event) => void handleAssignmentChange(lesson, event.target.value)} aria-label={`Assign ${lesson.title} to a student`} className="w-[4.5rem] shrink-0 rounded-md border border-amber-500/40 bg-[#0c1017] px-2 py-1.5 text-[11px] text-white outline-none [color-scheme:dark]" title="Assign lesson"><option value="" className="bg-[#0c1017] text-white">Assign</option><option value="__all_active__" className="bg-[#0c1017] text-white">All active</option>{getAssignedStudentNames(lesson).length > 0 && <option value="__unassign__" className="bg-[#0c1017] text-white">Unassign</option>}{students.map((student) => <option key={student.id} value={student.id} className="bg-[#0c1017] text-white">{student.name}</option>)}</select></div></td>
                    <td className="px-4 py-4"><span className={`rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${lesson.status === "published" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>{lesson.status === "published" ? "Published" : "Draft"}</span></td>
                    <td className="px-4 py-4 text-stone-300">Module {lesson.content?.moduleNumber || lesson.module_number || 1}</td>
                    <td className="px-4 py-4"><div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => handleEditLesson(lesson)} className="whitespace-nowrap rounded-md border border-amber-500/50 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500 hover:text-black">Edit / Continue</button>
                      <div className="relative">
                        <button type="button" onClick={() => setOpenLessonMenuId((current) => current === lesson.id ? null : lesson.id)} aria-label={`More actions for ${lesson.title}`} title="More actions" aria-expanded={openLessonMenuId === lesson.id} className="flex h-8 w-8 items-center justify-center rounded-md border border-[#394252] text-stone-300 hover:border-amber-500/60 hover:text-amber-300"><MoreVertical className="h-4 w-4" /></button>
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
              <button type="button" onClick={startNewLesson} className="rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-400">Create New Lesson</button>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative min-w-0 flex-1"><span className="sr-only">Search lessons</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-500" /><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search by title or subtitle" className="w-full rounded-md border border-[#394252] bg-[#0c1017] py-2.5 pl-9 pr-3 text-xs text-stone-200 outline-none focus:border-amber-500" /></label>
              <select value={libraryLevel} onChange={(event) => setLibraryLevel(event.target.value)} aria-label="Filter by level" className="rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-xs text-white [color-scheme:dark]"><option value="all">All levels</option>{CEFR_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select>
              <select value={libraryDomain} onChange={(event) => setLibraryDomain(event.target.value)} aria-label="Filter by domain" className="rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-xs text-white [color-scheme:dark]"><option value="all">All domains</option>{libraryDomains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</select>
              <label><span className="sr-only">Sort lessons</span><select value={librarySortBy} onChange={(event) => setLibrarySortBy(event.target.value as typeof librarySortBy)} aria-label="Sort lessons by tag" className="rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-xs text-white [color-scheme:dark]"><option value="title">Sort: Title</option><option value="domain">Sort: Domain</option><option value="practiceType">Sort: Practice Type</option><option value="skillFocus">Sort: Skill Focus</option></select></label>
              <div className="flex rounded-md border border-[#394252] bg-[#0c1017] p-1" role="group" aria-label="Lesson view mode"><button type="button" onClick={() => setLibraryView("grid")} aria-label="Grid view" className={`rounded p-1.5 ${libraryView === "grid" ? "bg-amber-500 text-slate-950" : "text-stone-500 hover:text-stone-200"}`}><Grid3X3 className="h-4 w-4" /></button><button type="button" onClick={() => setLibraryView("table")} aria-label="Table view" className={`rounded p-1.5 ${libraryView === "table" ? "bg-amber-500 text-slate-950" : "text-stone-500 hover:text-stone-200"}`}><List className="h-4 w-4" /></button></div>
            </div>
          </div>
          {libraryView === "grid" ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredLibraryLessons.map((lesson) => { const metadata = getLessonMetadata(lesson); const assignedIds = getAssignedStudentIds(lesson); return <article key={lesson.id} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 transition hover:border-amber-500/50"><div className="flex items-start justify-between gap-3"><button type="button" onClick={() => handleEditLesson(lesson)} className="min-w-0 text-left"><h3 className="truncate font-semibold text-stone-100">{lesson.title}</h3><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-500">{metadata.subtitle}</p></button><span className={`shrink-0 rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase ${lesson.status === "published" ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300"}`}>{lesson.status}</span></div><div className="mt-4 flex flex-wrap gap-1.5"><span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] text-amber-300">{metadata.level}</span><span className="rounded-full bg-sky-500/15 px-2 py-1 text-[10px] text-sky-300">{metadata.domain}</span><span className="rounded-full bg-stone-500/15 px-2 py-1 text-[10px] text-stone-300">{metadata.theme}</span><span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">{metadata.skillFocus}</span>{metadata.practiceType && <span className="rounded-full bg-rose-500/15 px-2 py-1 text-[10px] text-rose-300">{metadata.practiceType}</span>}{metadata.customTags.map((tag) => <span key={tag} className="rounded-full bg-stone-500/15 px-2 py-1 text-[10px] text-stone-300">{tag}</span>)}</div><div className="mt-2"><button type="button" onClick={() => openQuickTagEditor(lesson)} aria-label={`Edit tags for ${lesson.title}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 hover:text-amber-200"><Pencil className="h-3 w-3" />Edit level & tags</button></div><div className="relative mt-5 border-t border-[#202631] pt-4" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap gap-1">{assignedIds.length === 0 ? <span className="text-xs text-stone-500">No students assigned</span> : assignedIds.map((id) => { const student = students.find((item) => item.id === id); return <span key={id} title={student?.name || id} className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-[10px] font-semibold text-amber-200">{(student?.name || id).slice(0, 2).toUpperCase()}</span>; })}</div><button type="button" onClick={() => setAssignmentEditorLessonId((current) => current === lesson.id ? null : lesson.id)} className="rounded-md border border-amber-500/40 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300">Assign</button></div>{assignmentEditorLessonId === lesson.id && <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-lg border border-[#394252] bg-[#171d28] p-3 shadow-xl"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Assign students</p>{students.map((student) => <label key={student.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-stone-300 hover:bg-[#202631]"><input type="checkbox" checked={assignedIds.includes(student.id)} onChange={() => void handleAssignmentToggle(lesson, student.id)} className="accent-amber-500" /><span className="min-w-0 flex-1 truncate">{student.name}</span>{assignedIds.includes(student.id) && <Check className="h-3.5 w-3.5 text-amber-400" />}</label>)}<button type="button" onClick={() => setAssignmentEditorLessonId(null)} className="mt-2 w-full rounded border border-[#394252] px-2 py-1.5 text-[11px] text-stone-400">Done</button></div>}</div><div className="mt-4 flex items-center justify-between"><span className="text-[11px] text-stone-500">Module {lesson.content?.moduleNumber || lesson.module_number || 1}</span><div className="flex items-center gap-2"><button type="button" onClick={() => handleEditLesson(lesson)} className="text-xs font-semibold text-amber-300 hover:text-amber-200">Edit / Continue</button><button type="button" onClick={() => setLessonPendingDelete(lesson)} aria-label={`Delete ${lesson.title}`} title="Delete lesson" className="flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 text-red-300 transition hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></div></div></article>; })}</div> : <div className="overflow-x-auto rounded-xl border border-[#202631] bg-[#171d28]/60"><table className="min-w-[900px] w-full text-left text-xs"><thead className="border-b border-[#202631] bg-[#0c1017] text-[10px] uppercase tracking-[0.12em] text-stone-500"><tr><th className="px-5 py-3">Lesson</th><th className="px-4 py-3">Metadata</th><th className="px-4 py-3">Assigned students</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#202631]">{filteredLibraryLessons.map((lesson) => { const metadata = getLessonMetadata(lesson); return <tr key={lesson.id} className="text-stone-300 hover:bg-[#202631]/30"><td className="px-5 py-4"><button type="button" onClick={() => handleEditLesson(lesson)} className="text-left"><p className="font-semibold text-stone-100">{lesson.title}</p><p className="mt-1 text-[11px] text-stone-500">{metadata.subtitle}</p></button></td><td className="px-4 py-4"><div className="flex max-w-xs flex-wrap gap-1"><span className="rounded bg-amber-500/15 px-1.5 py-1 text-[10px] text-amber-300">{metadata.level}</span><span className="rounded bg-sky-500/15 px-1.5 py-1 text-[10px] text-sky-300">{metadata.domain}</span><span className="rounded bg-stone-500/15 px-1.5 py-1 text-[10px] text-stone-300">{metadata.theme}</span><span className="rounded bg-emerald-500/15 px-1.5 py-1 text-[10px] text-emerald-300">{metadata.skillFocus}</span>{metadata.practiceType && <span className="rounded bg-rose-500/15 px-1.5 py-1 text-[10px] text-rose-300">{metadata.practiceType}</span>}{metadata.customTags.map((tag) => <span key={tag} className="rounded bg-stone-500/15 px-1.5 py-1 text-[10px] text-stone-300">{tag}</span>)}</div></td><td className="px-4 py-4">{renderAssignedStudents(lesson)}</td><td className="px-4 py-4 capitalize">{lesson.status}</td><td className="px-4 py-4 text-right"><button type="button" onClick={() => openQuickTagEditor(lesson)} className="text-xs font-semibold text-amber-300">Edit tags</button><button type="button" onClick={() => handleEditLesson(lesson)} className="ml-3 text-xs font-semibold text-amber-300">Edit</button><button type="button" onClick={() => setLessonPendingDelete(lesson)} aria-label={`Delete ${lesson.title}`} title="Delete lesson" className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></td></tr>; })}</tbody></table></div>}
          {filteredLibraryLessons.length === 0 && <div className="rounded-xl border border-dashed border-[#394252] p-10 text-center text-sm text-stone-500">No lessons match these filters.</div>}
          {quickTagEditor && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !quickTagSaving) setQuickTagEditor(null); }}><section role="dialog" aria-modal="true" aria-labelledby="quick-tag-editor-title" className="w-full max-w-lg rounded-lg border border-[#394252] bg-[#171d28] p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Lesson metadata</p><h3 id="quick-tag-editor-title" className="mt-1 text-lg font-semibold text-stone-100">Edit level & tags</h3></div><button type="button" aria-label="Close tag editor" disabled={quickTagSaving} onClick={() => setQuickTagEditor(null)} className="rounded border border-[#394252] p-1.5 text-stone-400 hover:text-stone-100 disabled:opacity-50"><X className="h-4 w-4" /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs text-stone-400">CEFR Level<select value={quickTagEditor.level} onChange={(event) => setQuickTagEditor((current) => current ? { ...current, level: event.target.value } : current)} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-white [color-scheme:dark]">{CEFR_LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label><label className="text-xs text-stone-400">Domain<input value={quickTagEditor.tags.domain} onChange={(event) => setQuickTagEditor((current) => current ? { ...current, tags: { ...current.tags, domain: event.target.value } } : current)} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label><label className="text-xs text-stone-400">Skill Focus<input value={quickTagEditor.tags.skill_focus} onChange={(event) => setQuickTagEditor((current) => current ? { ...current, tags: { ...current.tags, skill_focus: event.target.value } } : current)} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label><label className="text-xs text-stone-400">Practice Type<input value={quickTagEditor.tags.practice_type} onChange={(event) => setQuickTagEditor((current) => current ? { ...current, tags: { ...current.tags, practice_type: event.target.value } } : current)} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label><label className="text-xs text-stone-400 sm:col-span-2">Custom Tags<input value={quickTagEditor.customTagsText} onChange={(event) => setQuickTagEditor((current) => current ? { ...current, customTagsText: event.target.value } : current)} placeholder="Comma-separated custom tags" className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label></div>{quickTagError && <p role="alert" className="mt-3 text-xs text-red-300">{quickTagError}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" disabled={quickTagSaving} onClick={() => setQuickTagEditor(null)} className="rounded-md border border-[#394252] px-3 py-2 text-xs text-stone-300 disabled:opacity-50">Cancel</button><button type="button" disabled={quickTagSaving} onClick={() => void saveQuickTagEditor()} className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">{quickTagSaving ? "Saving..." : <><Check className="h-3.5 w-3.5" />Save tags</>}</button></div></section></div>}
        </section>}

        {activeTab === "resources" && (() => {
          const flashcards = studentResources.filter((resource) => resource.resource_type === "flashcard");
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
                          setSelectedStudent(student);
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
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${resourceDraft.type === type ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-[#394252] text-stone-400 hover:text-stone-200'}`}
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
                        className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
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
                            className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                          />
                        </label>
                        <label className="block text-xs text-stone-400">
                          Reading notes (Markdown)
                          <textarea
                            value={resourceDraft.body}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, body: event.target.value }))}
                            rows={8}
                            placeholder="Add a short introduction or reading notes. Markdown is supported."
                            className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
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
                            className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                          />
                        </label>
                        <label className="block text-xs text-stone-400">
                          Or upload an audio file
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
                            className="mt-1 block w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-300 file:mr-3 file:rounded file:border-0 file:bg-amber-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950"
                          />
                        </label>
                        <label className="block text-xs text-stone-400">
                          Optional description / transcript notes
                          <textarea
                            value={resourceDraft.body}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, body: event.target.value }))}
                            rows={4}
                            placeholder="Add context or transcript notes for the student."
                            className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                          />
                        </label>
                      </>
                    )}

                    {resourceDraft.type === "data_table" && (
                      <label className="block text-xs text-stone-400">
                        Markdown Content
                        <textarea
                          value={resourceDraft.body}
                          onChange={(event) => setResourceDraft((previous) => ({ ...previous, body: event.target.value }))}
                          rows={12}
                          placeholder="Paste Markdown Table here..."
                          className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 font-mono text-xs text-stone-200 outline-none focus:border-amber-500"
                        />
                      </label>
                    )}

                    {(resourceDraft.type === "note" || resourceDraft.type === "quiz") && (
                      <label className="block text-xs text-stone-400">
                        {resourceDraft.type === "quiz" ? "Practice prompt" : "Notes"}
                        <textarea
                          value={resourceDraft.body}
                          onChange={(event) => setResourceDraft((previous) => ({ ...previous, body: event.target.value }))}
                          rows={5}
                          placeholder={resourceDraft.type === "quiz" ? "Write a practice exercise or prompt for the student." : "Add the material notes the student should review."}
                          className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                        />
                      </label>
                    )}

                    {resourceDraft.type === "flashcard" && (
                      <>
                        <label className="block text-xs text-stone-400">
                          Front / Question
                          <textarea
                            value={resourceDraft.question}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, question: event.target.value }))}
                            rows={3}
                            placeholder="What is the term for … ?"
                            className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                          />
                        </label>
                        <label className="block text-xs text-stone-400">
                          Back / Answer
                          <textarea
                            value={resourceDraft.answer}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, answer: event.target.value }))}
                            rows={3}
                            placeholder="A clear, student-friendly definition or explanation."
                            className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                          />
                        </label>
                        <label className="block text-xs text-stone-400">
                          Optional explanation
                          <textarea
                            value={resourceDraft.explanation}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, explanation: event.target.value }))}
                            rows={3}
                            placeholder="Optional AI-friendly nuance or extra context."
                            className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                          />
                        </label>
                      </>
                    )}

                    <button type="button" onClick={() => void saveStudentResource()} className="w-full rounded-md bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400">
                      {resourceDraft.type === "data_table" ? "Save Data Table" : "Save resource"}
                    </button>
                    {resourceStatus && <p role="status" className="text-xs leading-relaxed text-amber-300">{resourceStatus}</p>}
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
                              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">{flashcardIndex + 1} / {flashcards.length}</span>
                              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200">Term</span>
                            </div>
                            <div className="flex-1 pt-8">
                              <p className="text-2xl font-semibold leading-snug text-stone-100">{currentFlashcard.question || currentFlashcard.title}</p>
                            </div>
                            <div className="flex justify-center">
                              <span className="rounded-full border border-[#394252] bg-[#171d28] px-4 py-2 text-[11px] font-semibold text-stone-300">See answer</span>
                            </div>
                          </div>

                          <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Answer</span>
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">Key idea</span>
                            </div>
                            <div className="flex-1 pt-8">
                              <p className="text-xl font-medium leading-relaxed text-stone-100">{currentFlashcard.answer || "No answer yet."}</p>
                              {currentFlashcard.explanation && (
                                <div className="mt-5">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setShowFlashcardExplanation((value) => !value);
                                    }}
                                    className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200"
                                  >
                                    {showFlashcardExplanation ? "Hide explain" : "Explain"}
                                  </button>
                                  {showFlashcardExplanation && <p className="mt-3 text-sm leading-relaxed text-stone-300">{currentFlashcard.explanation}</p>}
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
                          className="rounded-md border border-[#394252] px-3 py-2 text-xs font-semibold text-stone-200 disabled:cursor-not-allowed disabled:opacity-40"
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
                            className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200"
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
                            className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200"
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
                          className="rounded-md border border-[#394252] px-3 py-2 text-xs font-semibold text-stone-200 disabled:cursor-not-allowed disabled:opacity-40"
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
                        const isDataTable = resource.resource_type === "data_table" || isDataTableResourceTitle(resource.title);
                        const resourceTitle = isDataTable ? getDataTableResourceTitle(resource.title) : resource.title;
                        return (
                        <div key={resource.id} className="rounded-xl border border-[#202631] bg-[#10181f] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">{isDataTable ? "data_table" : resource.resource_type}</p>
                              {!isDataTable && <h4 className="mt-1 font-semibold text-stone-100">{resourceTitle}</h4>}
                            </div>
                            <button type="button" onClick={() => void deleteStudentResource(resource)} className="text-stone-500 hover:text-red-300" aria-label={`Delete ${resource.title}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {resource.resource_type === "flashcard" && (
                            <div className="mt-3 space-y-2 text-sm text-stone-300">
                              <p><span className="font-semibold text-stone-100">Q:</span> {resource.question || "No question"}</p>
                              <p><span className="font-semibold text-stone-100">A:</span> {resource.answer || "No answer"}</p>
                              {resource.explanation && <p className="text-stone-400">{resource.explanation}</p>}
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
                          {resource.resource_type === "note" && !isDataTable && resource.body && <p className="mt-3 text-sm leading-relaxed text-stone-300">{resource.body}</p>}
                          {resource.resource_type === "quiz" && resource.body && <p className="mt-3 text-sm leading-relaxed text-stone-300">{resource.body}</p>}
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

        {activeTab === "builder" && viewMode === "student" && <section className="overflow-hidden rounded-xl border border-[#202631] bg-[#121721]" aria-label="Student Study Room preview">
          <header className="flex flex-wrap items-center gap-4 border-b border-[#293343] p-5">
            {workstationState.bannerUrl && <img src={workstationState.bannerUrl} alt="" className="h-16 w-28 rounded-md object-cover" />}
            <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">{newLesson.moduleNumber ? `Module ${newLesson.moduleNumber}` : "Student Study Room"}</p><h2 className="mt-1 truncate text-xl font-semibold text-stone-100">{newLesson.title || "Untitled Lesson"}</h2><p className="mt-1 text-sm text-stone-400">{newLesson.subtitle || "Your instructor has prepared this lesson for you."}</p></div>
            {workstationState.content.ambientMusicUrl && <AmbientMusicPlayer src={workstationState.content.ambientMusicUrl} />}
          </header>
          <div className="border-b border-[#293343] px-5 pb-4 pt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">{previewSteps.find(([step]) => step === previewStep)?.[1]}</p><h3 className="mt-1 text-lg font-semibold text-stone-100">{previewStep === "lesson" ? "Conceptual Framing" : previewSteps.find(([step]) => step === previewStep)?.[1]}</h3><p className="mt-2 text-sm text-stone-400">{newLesson.subtitle || "Your instructor has prepared this lesson for you."}</p></div>
          <div className="p-5"><Stepper currentStep={previewStep} completedSteps={[]} lockedSteps={[]} onStepClick={(step) => setPreviewStep(step)} /></div>
          <div className="min-h-[560px] border-t border-[#293343] p-5">{renderPreviewStep()}</div>
        </section>}

        {activeTab === "builder" && viewMode === "instructor" && <>
          <section className="mb-6 rounded-xl border border-[#202631] bg-[#171d28]/60 p-5" aria-labelledby="lesson-details-title">
                {Object.keys(validationErrors).length > 0 && <div className="mb-4 space-y-1 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300" role="alert">{Object.entries(validationErrors).map(([field, message]) => <p key={field}>{message}</p>)}</div>}
            <div className="mb-4">
<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Lesson Builder</p>
<h2 id="lesson-details-title" className="mt-1 font-sans text-xl font-semibold text-stone-100">Lesson Details</h2>
</div>
            <div className="grid gap-3 md:grid-cols-5">
<label className="text-xs text-stone-400">Lesson Title<input value={newLesson.title} onChange={(event) => setLessonTitle(event.target.value)} placeholder="A new lesson" className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" />
</label>
<label className="text-xs text-stone-400">Select Student<select value={selectedStudentId || ""} onChange={(event) => { const nextStudent = students.find((student) => student.id === event.target.value); if (nextStudent) void handleStudentChange(nextStudent); }} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-white [color-scheme:dark]" aria-label="Select student for lesson"><option value="" className="bg-[#0c1017] text-white">{studentsLoading ? "Loading students..." : studentsError ? "Unable to load students" : students.length === 0 ? "No registered students" : "Choose a student"}</option>{students.map((student) => <option key={student.id} value={student.id} className="bg-[#0c1017] text-white">{student.name}</option>)}</select>
</label>
<label className="text-xs text-stone-400">Module Number<input value={newLesson.moduleNumber} onChange={(event) => setNewLesson((previous) => ({ ...previous, moduleNumber: event.target.value }))} placeholder="1" className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" />
</label>
<label className="text-xs text-stone-400">CEFR Level<select value={newLesson.level} onChange={(event) => updateBuilderLevel(event.target.value)} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-white [color-scheme:dark]" aria-label="Lesson CEFR level">{CEFR_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select>
</label>
<div className="text-xs text-stone-400">Visibility<p className="mt-1 rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200">{lessonStatus === "published" ? "Published" : "Draft"}</p></div>
</div>
            
            <label className="mt-3 block text-xs text-stone-400">Subtitle<input value={newLesson.subtitle} onChange={(event) => setNewLesson((previous) => ({ ...previous, subtitle: event.target.value }))} placeholder="Lesson summary" className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" />
</label>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-xs text-stone-400">Domain<input value={newLesson.tags.domain} onChange={(event) => updateBuilderTags({ ...newLesson.tags, domain: event.target.value }, newLesson.customTagsText)} placeholder="Work, travel, culture..." className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>
              <label className="text-xs text-stone-400">Skill Focus<input value={newLesson.tags.skill_focus} onChange={(event) => updateBuilderTags({ ...newLesson.tags, skill_focus: event.target.value }, newLesson.customTagsText)} placeholder="Speaking, listening..." className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>
              <label className="text-xs text-stone-400">Practice Type<input value={newLesson.tags.practice_type} onChange={(event) => updateBuilderTags({ ...newLesson.tags, practice_type: event.target.value }, newLesson.customTagsText)} placeholder="Role-play, reflection..." className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>
              <label className="text-xs text-stone-400 md:col-span-3">Custom Tags<input value={newLesson.customTagsText} onChange={(event) => updateBuilderTags({ ...newLesson.tags, custom: parseCustomLessonTags(event.target.value) }, event.target.value)} placeholder="Comma-separated custom tags" className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>
            </div>
<label className="mt-3 block text-xs text-stone-400">Lesson-Specific Guidance<textarea value={newLesson.instructorGuidance} onChange={(e) => setNewLesson((previous) => ({ ...previous, instructorGuidance: e.target.value }))} placeholder="Guidance shown inside this lesson's Study Room" rows={3} className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500" /></label>
          </section>
          <main className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
            <div className="h-full min-w-0 lg:col-span-8">
              <LessonTailorEditor key={databaseLessonId || "new-lesson"} content={workstationState.content} sidebarBlocksByStep={sidebarBlocksByStep} onChange={(content: StrictStepContent) => setWorkstationState((previous) => ({ ...previous, content }))} />
            </div>
            <aside className="h-full space-y-6 lg:col-span-4">
              <details className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5" open={heroBannerOpen} onToggle={(event) => setHeroBannerOpen(event.currentTarget.open)}>
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-stone-200"><span>Hero Banner</span><ChevronDown className={`h-4 w-4 text-amber-400 transition-transform ${heroBannerOpen ? "rotate-180" : ""}`} aria-hidden="true" /></summary>
                <div className="mt-4"><InstructorBannerManager bannerUrl={workstationState.bannerUrl} customInput={workstationState.customBannerUrl} onUpdateBanner={(bannerUrl: string) => setWorkstationState((previous) => ({ ...previous, bannerUrl }))} onUpdateCustomInput={(customBannerUrl: string) => setWorkstationState((previous) => ({ ...previous, customBannerUrl }))} /></div>
              </details>
              <section className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
                <div className="flex items-center justify-between gap-3"><h3 className="font-sans text-xl font-semibold text-stone-100">Step Sidebar</h3><button type="button" onClick={() => setSidebarBlocksByStep((current) => ({ ...current, [sidebarStep]: [...(current[sidebarStep] || []), { id: `sidebar-${Date.now()}`, title: "Sidebar note", body: "" }] }))} className="flex items-center gap-1.5 rounded-md border border-amber-500 px-3 py-2 text-sm text-amber-500"><Plus className="h-3.5 w-3.5" />Add Block</button></div>
                <select value={sidebarStep} onChange={(event) => setSidebarStep(event.target.value as keyof SidebarBlocksByStep)} className="mt-3 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2 text-xs text-white [color-scheme:dark]" aria-label="Sidebar step"><option value="warm_up" className="bg-[#0c1017] text-white">Warm-up</option><option value="lesson" className="bg-[#0c1017] text-white">Lesson</option><option value="listening" className="bg-[#0c1017] text-white">Listening</option><option value="reading" className="bg-[#0c1017] text-white">Reading</option><option value="writing" className="bg-[#0c1017] text-white">Writing</option><option value="speaking" className="bg-[#0c1017] text-white">Speaking</option></select>
                <div className="mt-4 space-y-3">{(sidebarBlocksByStep[sidebarStep] || []).map((block) => <div key={block.id} className="rounded-lg border border-[#202631] bg-[#0c1017] p-3"><div className="flex gap-2"><input value={block.title} onChange={(event) => setSidebarBlocksByStep((current) => ({ ...current, [sidebarStep]: (current[sidebarStep] || []).map((item) => item.id === block.id ? { ...item, title: event.target.value } : item) }))} className="min-w-0 flex-1 border-b border-[#394252] bg-transparent pb-1 text-xs font-semibold text-stone-200" aria-label="Sidebar block title" /><button type="button" onClick={() => setSidebarBlocksByStep((current) => ({ ...current, [sidebarStep]: (current[sidebarStep] || []).filter((item) => item.id !== block.id) }))} aria-label={`Delete ${block.title}`}><Trash2 className="h-3.5 w-3.5" /></button></div><label className="mt-3 block text-[11px] text-stone-500">Align Next To (Main Block):<select value={block.parentMainBlockId || ""} onChange={(event) => setSidebarBlocksByStep((current) => ({ ...current, [sidebarStep]: (current[sidebarStep] || []).map((item) => item.id === block.id ? { ...item, parentMainBlockId: event.target.value || undefined } : item) }))} className="mt-1 w-full rounded-md border border-[#202631] bg-[#171d28] p-2 text-xs text-stone-200 [color-scheme:dark]" aria-label={`Align ${block.title || "sidebar block"} next to main block`}><option value="">Top of Sidebar (Default Unlinked)</option>{((((workstationState.content[sidebarStep] as { blocks?: ContentBlock[] } | undefined)?.blocks || []) as ContentBlock[]).map((mainBlock, mainIndex) => <option key={mainBlock.id} value={mainBlock.id}>{mainIndex + 1}. {mainBlock.title || `${mainBlock.type} block`}</option>))}</select></label><textarea value={block.body} onChange={(event) => setSidebarBlocksByStep((current) => ({ ...current, [sidebarStep]: (current[sidebarStep] || []).map((item) => item.id === block.id ? { ...item, body: event.target.value } : item) }))} rows={3} className="mt-3 w-full resize-y rounded-md border border-[#202631] bg-[#171d28] p-2.5 text-xs text-stone-300" /></div>)}</div>
              </section>
            </aside>
          </main>

          <section className="mt-6 rounded-xl border border-[#202631] bg-[#171d28]/60 p-5" aria-label="Lesson builder resource panel">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Student Materials</p>
                  <h3 className="mt-1 font-sans text-xl font-semibold text-stone-100">Resources</h3>
                </div>
                <div className="rounded-full border border-[#394252] bg-[#0c1017] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-300">
                  {activeBuilderStudent ? `${activeBuilderStudent.name} · ${activeBuilderLessonId ? "Bound" : "Lesson not saved yet"}` : "Select student in Lesson Details"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Resource type">
                {([['note', 'Notes'], ['reading', 'Reading'], ['flashcard', 'Flashcards'], ['quiz', 'Quiz'], ['audio', 'Audio'], ['data_table', 'Data Table'], ['file', 'File Upload']] as const).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={activeResourceType === type}
                    onClick={() => setResourceDraft((previous) => ({ ...previous, type }))}
                    className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${activeResourceType === type ? 'border-amber-400 bg-amber-500 text-slate-950 shadow-sm' : 'border-[#394252] bg-[#0c1017] text-stone-400 hover:border-amber-500/60 hover:text-stone-100'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {!activeBuilderStudent || !activeBuilderLessonId ? (
              <div className="mt-4 rounded-lg border border-dashed border-[#202631] bg-[#0c1017] px-4 py-5 text-sm text-stone-400">
                Choose a student and save the lesson draft in Lesson Details to bind resource uploads to the active lesson context.
              </div>
            ) : (
              <div className="mt-5 space-y-6">
                <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.35fr)]">
                  <div className="w-full min-w-0 rounded-2xl border border-[#202631] bg-[#171d28]/60 p-5">
                    <div className="mb-4 border-b border-[#202631] pb-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Resource Editor</p>
                      <h4 className="mt-1 font-sans text-lg font-semibold text-stone-100">
                        {activeResourceType === "note" ? "Note Editor" : activeResourceType === "reading" ? "Reading Editor" : activeResourceType === "flashcard" ? "Flashcard Builder" : activeResourceType === "quiz" ? "Quiz Editor" : activeResourceType === "audio" ? "Audio Editor" : activeResourceType === "file" ? "File Upload" : "Data Table Editor"}
                      </h4>
                    </div>

                    <div className="space-y-3">
                      <label className="block text-xs text-stone-400">
                        Title
                        <input
                          value={resourceDraft.title}
                          onChange={(event) => setResourceDraft((previous) => ({ ...previous, title: event.target.value }))}
                          placeholder={resourceDraft.type === "audio" ? "Podcast / Deep Dive Audio" : resourceDraft.type === "data_table" ? "Lesson 3: Core Summary Matrix" : resourceDraft.type === "file" ? "Resource title" : "Vocabulary set / reading summary / quiz idea"}
                          className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                        />
                      </label>

                      {resourceDraft.type === "file" && (
                        <div
                          onDragOver={(event) => { event.preventDefault(); setIsResourceFileDragging(true); }}
                          onDragLeave={() => setIsResourceFileDragging(false)}
                          onDrop={(event) => {
                            event.preventDefault();
                            setIsResourceFileDragging(false);
                            handleResourceFileSelection(event.dataTransfer.files[0]);
                          }}
                          className={`rounded-lg border border-dashed p-5 text-center transition ${isResourceFileDragging ? "border-amber-400 bg-amber-500/10" : "border-[#394252] bg-[#0c1017]"}`}
                        >
                          <input
                            id="student-resource-file-input"
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown,text/csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf,application/vnd.oasis.opendocument.text,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,audio/webm,video/mp4,video/webm,video/ogg,video/quicktime,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.pdf,.doc,.docx,.rtf,.odt,.mp3,.wav,.ogg,.m4a,.aac,.flac,.mp4,.webm,.mov"
                            onChange={(event) => handleResourceFileSelection(event.target.files?.[0])}
                            className="sr-only"
                          />
                          <UploadCloud className="mx-auto h-7 w-7 text-amber-400" aria-hidden="true" />
                          <p className="mt-2 text-sm font-medium text-stone-200">{isResourceFileDragging ? "Drop file to attach" : "Drag a file here or choose a file"}</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-stone-500">Images, text documents, PDFs, audio, and video · up to 50 MB</p>
                          <label htmlFor="student-resource-file-input" className="mt-3 inline-flex cursor-pointer items-center rounded-md border border-amber-500/40 px-3 py-2 text-xs font-semibold text-amber-300 hover:border-amber-400">
                            Choose file
                          </label>
                          {resourceFile && <div className="mt-3 flex items-center justify-center gap-2 text-xs text-stone-300"><span className="max-w-[220px] truncate">{resourceFile.name}</span><button type="button" onClick={() => setResourceFile(null)} className="text-red-300 hover:text-red-200">Remove</button></div>}
                        </div>
                      )}

                      {resourceDraft.type === "reading" && (
                        <label className="block text-xs text-stone-400">
                          Reading link or file
                          <input
                            value={resourceDraft.linkUrl}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, linkUrl: event.target.value }))}
                            placeholder="https://… or PDF file name"
                            className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                          />
                        </label>
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
                              className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                            />
                          </label>
                          <label className="block text-xs text-stone-400">
                            Or upload an audio file
                            <input
                              type="file"
                              accept="audio/*"
                              onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
                              className="mt-1 block w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-300 file:mr-3 file:rounded file:border-0 file:bg-amber-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950"
                            />
                          </label>
                          <label className="block text-xs text-stone-400">
                            Optional description / transcript notes
                            <textarea
                              value={resourceDraft.body}
                              onChange={(event) => setResourceDraft((previous) => ({ ...previous, body: event.target.value }))}
                              rows={4}
                              placeholder="Add context or transcript notes for the student."
                              className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                            />
                          </label>
                        </>
                      )}

                      {resourceDraft.type === "data_table" && (
                        <label className="block text-xs text-stone-400">
                          Markdown Content
                          <textarea
                            value={resourceDraft.body}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, body: event.target.value }))}
                            rows={12}
                            placeholder="Paste Markdown Table here..."
                            className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 font-mono text-xs text-stone-200 outline-none focus:border-amber-500"
                          />
                        </label>
                      )}

                      {(resourceDraft.type === "note" || resourceDraft.type === "quiz") && (
                        <label className="block text-xs text-stone-400">
                          {resourceDraft.type === "quiz" ? "Practice prompt" : "Notes"}
                          <textarea
                            value={resourceDraft.body}
                            onChange={(event) => setResourceDraft((previous) => ({ ...previous, body: event.target.value }))}
                            rows={5}
                            placeholder={resourceDraft.type === "quiz" ? "Write a practice exercise or prompt for the student." : "Add the material notes the student should review."}
                            className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                          />
                        </label>
                      )}

                      {resourceDraft.type === "flashcard" && (
                        <>
                          <label className="block text-xs text-stone-400">
                            Front / Question
                            <textarea
                              value={resourceDraft.question}
                              onChange={(event) => setResourceDraft((previous) => ({ ...previous, question: event.target.value }))}
                              rows={3}
                              placeholder="What is the term for … ?"
                              className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                            />
                          </label>
                          <label className="block text-xs text-stone-400">
                            Back / Answer
                            <textarea
                              value={resourceDraft.answer}
                              onChange={(event) => setResourceDraft((previous) => ({ ...previous, answer: event.target.value }))}
                              rows={3}
                              placeholder="A clear, student-friendly definition or explanation."
                              className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                            />
                          </label>
                          <label className="block text-xs text-stone-400">
                            Optional explanation
                            <textarea
                              value={resourceDraft.explanation}
                              onChange={(event) => setResourceDraft((previous) => ({ ...previous, explanation: event.target.value }))}
                              rows={3}
                              placeholder="Optional AI-friendly nuance or extra context."
                              className="mt-1 w-full resize-y rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 outline-none focus:border-amber-500"
                            />
                          </label>
                        </>
                      )}

                      <button type="button" onClick={() => void saveStudentResource()} className="w-full rounded-md bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400">
                        {resourceDraft.type === "data_table" ? "Save Data Table" : "Save resource"}
                      </button>
                      {resourceStatus && <p role="status" className="text-xs leading-relaxed text-amber-300">{resourceStatus}</p>}
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
                        {studentResources.filter((resource) => resource.resource_type === "flashcard").length} cards
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
                          <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Draft question</span><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase text-amber-200">Question</span></div>
                          <p className="max-h-[170px] overflow-y-auto break-words text-xl font-semibold leading-snug text-stone-100">{resourceDraft.question.trim() || "Your question will appear here as you type."}</p>
                          <div className="flex justify-center"><span className="rounded-full border border-[#394252] bg-[#171d28] px-4 py-2 text-[11px] font-semibold text-stone-300">See answer</span></div>
                        </div>
                        <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                          <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Draft answer</span><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-200">Key idea</span></div>
                          <div className="max-h-[170px] overflow-y-auto"><p className="break-words text-lg font-medium leading-relaxed text-stone-100">{resourceDraft.answer.trim() || "Your answer will appear here as you type."}</p>{resourceDraft.explanation.trim() && <p className="mt-3 text-xs leading-relaxed text-stone-400">{resourceDraft.explanation}</p>}</div>
                          <div className="flex justify-center"><span className="rounded-full border border-[#394252] bg-[#171d28] px-4 py-2 text-[11px] font-semibold text-stone-300">Flip back</span></div>
                        </div>
                      </div>
                    </div>

                    <h4 className="mb-3 border-t border-[#202631] pt-4 text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">Saved deck</h4>

                    {(() => {
                      const flashcards = studentResources.filter((resource) => resource.resource_type === "flashcard");
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
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">{flashcardIndex + 1} / {flashcards.length}</span>
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200">Term</span>
                                </div>
                                <div className="flex-1 pt-8">
                                  <p className="text-2xl font-semibold leading-snug text-stone-100">{currentFlashcard.question || currentFlashcard.title}</p>
                                </div>
                                <div className="flex justify-center">
                                  <span className="rounded-full border border-[#394252] bg-[#171d28] px-4 py-2 text-[11px] font-semibold text-stone-300">See answer</span>
                                </div>
                              </div>

                              <div className="absolute inset-0 flex flex-col justify-between rounded-2xl p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Answer</span>
                                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">Key idea</span>
                                </div>
                                <div className="flex-1 pt-8">
                                  <p className="text-xl font-medium leading-relaxed text-stone-100">{currentFlashcard.answer || "No answer yet."}</p>
                                  {currentFlashcard.explanation && (
                                    <div className="mt-5">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setShowFlashcardExplanation((value) => !value);
                                        }}
                                        className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200"
                                      >
                                        {showFlashcardExplanation ? "Hide note" : "Show note"}
                                      </button>
                                      {showFlashcardExplanation && <p className="mt-3 text-sm leading-relaxed text-stone-300">{currentFlashcard.explanation}</p>}
                                    </div>
                                  )}
                                </div>
                                <div className="flex justify-center">
                                  <span className="rounded-full border border-[#394252] bg-[#171d28] px-4 py-2 text-[11px] font-semibold text-stone-300">Flip back</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 flex items-center justify-between gap-3">
                            <button type="button" onClick={() => setFlashcardIndex((index) => (index === 0 ? flashcards.length - 1 : index - 1))} className="rounded-md border border-[#394252] bg-[#171d28] px-3 py-2 text-xs font-medium text-stone-300 hover:text-stone-100">
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
                            <button type="button" onClick={() => setFlashcardIndex((index) => (index + 1) % flashcards.length)} className="rounded-md border border-[#394252] bg-[#171d28] px-3 py-2 text-xs font-medium text-stone-300 hover:text-stone-100">
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
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">{activeResourceType === "note" ? "Note Preview" : activeResourceType === "reading" ? "Reading Preview" : activeResourceType === "quiz" ? "Quiz Preview" : activeResourceType === "audio" ? "Audio Preview" : activeResourceType === "file" ? "File Preview" : "Data Table Preview"}</p>
                        <h3 className="mt-1 font-sans text-xl font-semibold text-stone-100">{resourceDraft.title.trim() || "Untitled resource"}</h3>
                      </div>
                      {activeResourceType === "note" && (
                        <MarkdownContent value={resourceDraft.body.trim() || "Your note preview will appear here as you type."} className="text-sm leading-relaxed text-stone-300" dataTables />
                      )}
                      {activeResourceType === "reading" && (
                        <div className="space-y-3">
                          {resourceDraft.body.trim() ? <MarkdownContent value={resourceDraft.body} className="text-sm leading-relaxed text-stone-300" dataTables /> : <p className="text-sm text-stone-500">Add reading notes to preview the Markdown here.</p>}
                          {getResourcePreviewHref(resourceDraft.linkUrl) ? <a href={getResourcePreviewHref(resourceDraft.linkUrl) || undefined} target="_blank" rel="noreferrer" className="inline-flex rounded-md border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-300 hover:border-amber-400">Open or download</a> : resourceDraft.linkUrl.trim() ? <p className="break-all text-xs text-stone-500">{resourceDraft.linkUrl}</p> : <p className="text-xs text-stone-500">Add a reading link or file to preview it here.</p>}
                        </div>
                      )}
                      {activeResourceType === "quiz" && (
                        <div className="rounded-lg border border-[#293343] bg-[#10181f] p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300">Practice prompt</p>
                          <MarkdownContent value={resourceDraft.body.trim() || "Your practice prompt will appear here as you type."} className="mt-3 text-sm leading-relaxed text-stone-200" dataTables />
                        </div>
                      )}
                      {activeResourceType === "audio" && (
                        <div className="space-y-3">
                          {audioFilePreviewUrl ? <CustomAudioPlayer src={audioFilePreviewUrl} label={resourceDraft.title.trim() || audioFile?.name || "Audio preview"} /> : getResourcePreviewHref(resourceDraft.linkUrl) ? <CustomAudioPlayer src={getResourcePreviewHref(resourceDraft.linkUrl) || ""} label={resourceDraft.title.trim() || "Audio preview"} /> : <p className="text-sm text-stone-500">Add a valid audio URL or choose a file to preview it here.</p>}
                          {resourceDraft.body.trim() && <MarkdownContent value={resourceDraft.body} className="text-sm leading-relaxed text-stone-400" dataTables />}
                        </div>
                      )}
                      {activeResourceType === "data_table" && (
                        resourceDraft.body.trim() ? <DataTableResource title={resourceDraft.title.trim() || "Data Table"} markdown={resourceDraft.body} /> : <p className="text-sm text-stone-500">Paste Markdown table content to preview it here.</p>
                      )}
                      {activeResourceType === "file" && (
                        resourceFile && resourceFilePreviewUrl ? (() => {
                          const mediaType = getSupportedResourceMediaType(resourceFile);
                          if (mediaType?.startsWith("image/")) return <img src={resourceFilePreviewUrl} alt={resourceFile.name} className="max-h-[520px] w-full rounded-lg border border-[#293343] object-contain" />;
                          if (mediaType === "application/pdf" || mediaType?.startsWith("text/")) return <iframe src={resourceFilePreviewUrl} title={`Preview of ${resourceFile.name}`} className="h-[560px] w-full rounded-lg border border-[#293343] bg-white" />;
                          if (mediaType?.startsWith("audio/")) return <CustomAudioPlayer src={resourceFilePreviewUrl} label={resourceFile.name} />;
                          if (mediaType?.startsWith("video/")) return <video src={resourceFilePreviewUrl} controls preload="metadata" className="max-h-[560px] w-full rounded-lg bg-black" aria-label={`Preview of ${resourceFile.name}`} />;
                          return <div className="space-y-3"><p className="text-sm text-stone-400">This document format opens or downloads instead of displaying inline.</p><a href={resourceFilePreviewUrl} download={resourceFile.name} className="inline-flex rounded-md border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-300 hover:border-amber-400">Open or download {resourceFile.name}</a></div>;
                        })() : <p className="rounded-lg border border-dashed border-[#394252] p-6 text-center text-sm text-stone-500">Choose or drop a file to preview it here.</p>
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
                        return (
                          <div key={resource.id} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-stone-100">{resourceTitle}</p>
                                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-stone-500">{resource.resource_type}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void deleteStudentResource(resource)}
                                className="rounded-md p-1.5 text-stone-500 transition hover:bg-red-500/10 hover:text-red-400"
                                aria-label={`Delete ${resource.title}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {resource.resource_type === "reading" && resource.link_url && (
                              <a href={resource.link_url} target="_blank" rel="noreferrer" className="mt-3 block truncate text-xs text-sky-300 underline">
                                Open reading link
                              </a>
                            )}
                            {resource.resource_type === "audio" && (
                              <div className="mt-3 space-y-3">
                                {resource.link_url ? <CustomAudioPlayer src={resource.link_url} label={resource.title} /> : <p className="text-xs text-stone-500">No audio URL is available.</p>}
                                {resource.link_url && <a href={resource.link_url} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-sky-300 underline">Open audio file</a>}
                                {resource.body && <AudioTranscriptAccordion resourceId={resource.id} transcript={resource.body} />}
                              </div>
                            )}
                            {resource.resource_type === "file" && resource.link_url && (
                              <div className="mt-3 space-y-2">
                                <p className="break-all text-xs text-stone-400">{resource.original_filename || "Uploaded file"}</p>
                                {resource.media_type?.startsWith("image/") && <img src={resource.link_url} alt={resource.original_filename || resource.title} className="max-h-64 w-full rounded-md border border-[#293343] object-contain" />}
                                {resource.media_type === "application/pdf" && <iframe src={resource.link_url} title={`Preview of ${resource.original_filename || resource.title}`} className="h-64 w-full rounded-md border border-[#293343] bg-white" />}
                                {resource.media_type?.startsWith("audio/") && <CustomAudioPlayer src={resource.link_url} label={resource.title} />}
                                {resource.media_type?.startsWith("video/") && <video src={resource.link_url} controls preload="metadata" className="max-h-64 w-full rounded-md bg-black" aria-label={`Preview of ${resource.original_filename || resource.title}`} />}
                                <a href={resource.link_url} target="_blank" rel="noreferrer" download={resource.original_filename || undefined} className="inline-flex text-xs text-sky-300 underline">Open or download file</a>
                              </div>
                            )}
                            {isDataTable && resource.body && <div className="mt-3"><DataTableResource title={resourceTitle} markdown={resource.body} /></div>}
                            {resource.resource_type === "note" && !isDataTable && resource.body && <p className="mt-3 text-sm leading-relaxed text-stone-300">{resource.body}</p>}
                            {resource.resource_type === "quiz" && resource.body && <p className="mt-3 text-sm leading-relaxed text-stone-300">{resource.body}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </>}

        {activeTab === "evaluation" && <>
<div className="mb-6">
<StudentContextPanel studentName={selectedStudent?.name || "Selected Student"} studentId={selectedStudent?.id} studentToken={selectedStudent?.token} profile={workstationState.studentProfile} onUpdateProfile={(studentProfile: StudentProfile) => setWorkstationState((previous) => ({ ...previous, studentProfile }))} onSaveProfile={async (studentProfile: StudentProfile) => { if (!selectedStudent) return; const studentToken = selectedStudent.token || selectedStudent.id; console.log("[Instructor Workstation] profile save identifier:", { studentToken, studentId: selectedStudent.id }); await saveStudentProfile(studentToken, studentProfile); window.localStorage.setItem(`fluentia:student-profile-sync:${studentToken}`, new Date().toISOString()); window.dispatchEvent(new CustomEvent(FLUENTIA_DATA_UPDATED_EVENT, { detail: { type: "student-profile", studentToken } })); }} />
</div>
<section className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-12" aria-label="Student submission review workspace">
<div className="space-y-5 lg:col-span-7">
<div className="flex justify-between border-b border-[#202631] pb-4">
<div>
<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Submission Review Workspace</p>
<h2 className="mt-1 font-sans text-xl font-semibold text-stone-100">{selectedStudent?.name || "Selected Student"}&apos;s answers</h2>
<p className="mt-1 text-xs text-amber-300">{workstationState.studentProfile.level}</p>
</div>
<span className={`w-fit rounded-sm border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${submissionStateClass}`}>{submissionState}</span>
</div>
<div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
<p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Written response</p>
<p className="rounded-lg border border-[#202631] bg-[#0c1017] p-4 text-sm leading-relaxed text-stone-300">{workstationState.submission?.writingText || "No written response submitted."}</p>
</div>
</div>
<div className="lg:col-span-5 lg:sticky lg:top-6">
<SubmissionEvaluator lessonId={databaseLessonId || newLesson.slug || lessonId} studentId={selectedStudent?.id} instructorId={instructorId} studentName={selectedStudent?.name || "Selected Student"} useSupabase evaluation={workstationState.evaluation} onUpdateEvaluation={(evaluation: LessonEvaluation) => setWorkstationState((previous) => ({ ...previous, evaluation }))} onSubmitFeedback={async (feedback: FeedbackPayload) => { if (!selectedStudent) return; const evaluation = { ...workstationState.evaluation, scores: feedback.scores, comments: feedback.comments, criterionFeedback: feedback.criterionFeedback, published: true }; setWorkstationState((previous) => ({ ...previous, evaluation })); await saveInstructorFeedback(newLesson.slug || lessonId, selectedStudent.id, evaluation); setPublishStatus("Strengths, study plan, and evaluation synced with student view!"); }} />
</div>
</section>
</>}
      </div>
      <div className={`fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${guidanceOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`} role="presentation" onClick={() => setGuidanceOpen(false)} aria-hidden={!guidanceOpen}>
        <aside className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-amber-500/20 bg-[#0c1017]/95 p-5 text-stone-200 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-in-out ${guidanceOpen ? "translate-x-0" : "translate-x-full"}`} role="dialog" aria-modal={guidanceOpen} aria-labelledby="workstation-guidance-title" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-[#293343] pb-4"><h2 id="workstation-guidance-title" className="flex items-center gap-2 text-sm font-semibold text-amber-300"><Lightbulb className="h-4 w-4" />Lesson Guidance</h2><button type="button" onClick={() => setGuidanceOpen(false)} aria-label="Close lesson guidance" className="rounded-md p-2 text-stone-400 transition hover:bg-white/10 hover:text-stone-100"><X className="h-4 w-4" /></button></div>
          <div className="min-h-0 flex-1 overflow-y-auto py-5"><MarkdownContent value={newLesson.instructorGuidance} className="text-sm leading-relaxed text-stone-300" /></div>
        </aside>
      </div>
  <InstructorChatWidget
    activeStudent={selectedStudent}
    students={students}
        instructorId={instructorId}
    lessonContext={newLesson.title || newLesson.slug || lessonId}
  />
      {lessonPendingDelete && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-lesson-title" aria-describedby="delete-lesson-warning"><div className="w-full max-w-md rounded-xl border border-red-500/30 bg-[#171d28] p-6 shadow-2xl"><h2 id="delete-lesson-title" className="font-sans text-xl font-semibold text-stone-100">Delete lesson permanently?</h2><p id="delete-lesson-warning" className="mt-3 text-sm leading-relaxed text-stone-300">This permanently deletes the lesson, its versions, assignments, submissions, feedback, and lesson-linked student resources. This action cannot be undone.</p><p className="mt-2 truncate text-xs text-amber-300">{lessonPendingDelete.title}</p><div className="mt-6 flex justify-end gap-3"><button type="button" disabled={isDeletingLesson} onClick={() => setLessonPendingDelete(null)} className="rounded-md border border-[#394252] px-4 py-2 text-xs font-semibold text-stone-300 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button><button type="button" disabled={isDeletingLesson} onClick={() => void handleDeleteLesson()} className="rounded-md bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:cursor-wait disabled:opacity-60">{isDeletingLesson ? "Deleting..." : "Delete lesson"}</button></div></div></div>}
    </div>
  );
}