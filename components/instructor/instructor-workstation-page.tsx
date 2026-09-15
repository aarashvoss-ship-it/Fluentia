"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { StudentContextPanel } from "@/components/instructor/student-context-panel";
import { LessonTailorEditor } from "@/components/instructor/lesson-tailor-editor";
import { InstructorBannerManager } from "@/components/instructor/banner-manager";
import { SubmissionEvaluator, FeedbackPayload } from "@/components/instructor/submission-evaluator";
import { ContentBlock, LessonEvaluation, StrictStepContent, StudentProfile, StudentSubmission } from "@/types/lesson";
import { createLesson, deleteLesson, getLessons, updateLesson, type LessonWithVersion } from "@/lib/lessons";
import { INSTRUCTOR_TOKEN, PublishedLessonState } from "@/lib/lesson-store";
import { DEFAULT_STUDENT, STUDENT_USERS, StudentUser } from "@/lib/users";
import { FLUENTIA_DATA_UPDATED_EVENT, saveInstructorFeedback } from "@/services/storage-service";
import { AccessCard } from "@/components/access/access-card";
import { MarkdownContent } from "@/components/study-room/markdown-content";
import { CustomAudioPlayer } from "@/components/study-room/custom-audio-player";
import { AmbientMusicPlayer } from "@/components/study-room/ambient-music-player";
import { saveStudentProfile } from "@/lib/student-profiles";

interface InstructorWorkstationProps {
  instructorToken: string;
  lessonSlug: string;
  allowStudentQuery?: boolean;
}

type SidebarBlock = { id: string; title: string; body: string };
type SidebarBlocksByStep = Partial<Record<"warm_up" | "lesson" | "listening" | "reading" | "writing" | "speaking", SidebarBlock[]>>;

export default function InstructorWorkstationPage({
  instructorToken,
  lessonSlug,
  allowStudentQuery = true,
}: InstructorWorkstationProps) {
  const lessonId = lessonSlug;

  const [isMounted, setIsMounted] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(DEFAULT_STUDENT);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentUser[]>([]);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  const [databaseLessonId, setDatabaseLessonId] = useState<string | null>(null);
  const [pendingSubmissionCount, setPendingSubmissionCount] = useState(0);
  const [publishedLessonCount, setPublishedLessonCount] = useState(0);
  const [draftLessonCount, setDraftLessonCount] = useState(0);
  const [lessonStatus, setLessonStatus] = useState<"draft" | "published">("published");
  const [activeTab, setActiveTab] = useState<"dashboard" | "builder" | "evaluation">("dashboard");
  const [heroBannerOpen, setHeroBannerOpen] = useState(false);
  const [activeStudentsOpen, setActiveStudentsOpen] = useState(false);
  const [sidebarStep, setSidebarStep] = useState<keyof SidebarBlocksByStep>("warm_up");
  const [sidebarBlocksByStep, setSidebarBlocksByStep] = useState<SidebarBlocksByStep>({});

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
    studentProfile: DEFAULT_STUDENT.profile,
    evaluation: {
      scores: { task: 4, coherence: 4, lexical: 3, grammar: 4 },
      comments: "Great work on incorporating specific behavioral terms.",
      criterionFeedback: {},
      published: false,
    },
    submission: undefined,
  });

  const [isPublishing, setIsPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewStep, setPreviewStep] = useState<"warm_up" | "lesson" | "listening" | "reading" | "writing" | "speaking">("warm_up");
  const [saveIndicator, setSaveIndicator] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hasLoadedLesson = useRef(false);
  const lastSavedDraftSignature = useRef<string | null>(null);
  const lastInputAt = useRef(0);
  const inputTimer = useRef<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<Partial<Record<"selectedStudentId" | "title" | "slug" | "moduleNumber", string>>>({});
  const [createdLessons, setCreatedLessons] = useState<LessonWithVersion[]>([]);
  const [lessonPendingDelete, setLessonPendingDelete] = useState<LessonWithVersion | null>(null);
  const [newLesson, setNewLesson] = useState({
    studentId: DEFAULT_STUDENT.id,
    title: "",
    slug: "",
    subtitle: "",
    moduleNumber: "",
    status: "draft" as "draft" | "published",
  });

  const resetNewLessonForm = (studentId = "") =>
    setNewLesson({
      studentId,
      title: "",
      slug: "",
      subtitle: "",
      moduleNumber: "",
      status: "draft",
    });

  const getDraftSignature = (content: StrictStepContent, title: string, subtitle: string, moduleNumber: string) =>
    JSON.stringify({
      content,
      title: title.trim() || "Untitled Lesson",
      subtitle: subtitle.trim() || "A new Fluentia learning journey.",
      moduleNumber: Number(moduleNumber) || 1,
      bannerUrl: workstationState.bannerUrl,
      sidebarBlocksByStep,
    });

  async function handleStudentChange(student: StudentUser, requestedLessonSlug = lessonId) {
    setPublishStatus(null);
    const id = student?.id?.trim();
    if (!id) {
      setSelectedStudentId(null);
      resetNewLessonForm();
      return;
    }
    setSelectedStudentId(id);
    setNewLesson((previous) => ({ ...previous, studentId: id }));

    const lessons = await getLessons();
    const loadedLesson = lessons.find((lesson) => {
      const lessonSlug = typeof lesson.content?.slug === "string" ? lesson.content.slug : lesson.id;
      return (lesson.student_token === id || lesson.student_id === id) && (!requestedLessonSlug || lessonSlug === requestedLessonSlug || lesson.id === requestedLessonSlug);
    });
    if (!loadedLesson) {
      resetNewLessonForm(id);
    }

    setSelectedStudent(student);
    setWorkstationState((previous) => ({ ...previous, studentProfile: student.profile }));
    if (loadedLesson) activateLesson(loadedLesson);
    else {
      setSidebarBlocksByStep({});
      setDatabaseLessonId(null);
    }
  }

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
      setCreatedLessons(await getLessons());
    } catch (error) {
      console.error("Failed to load lessons from Supabase:", error);
      setPublishStatus("Unable to load lessons from Supabase.");
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
      moduleNumber: String(content.moduleNumber || lesson.module_number || 1),
      status: lesson.status === "published" ? "published" : "draft",
    }));
    setWorkstationState((previous) => ({
      ...previous,
      content,
      bannerUrl: typeof content.coverImage === "string" ? content.coverImage : lesson.banner_url || "",
    }));
    setSidebarBlocksByStep((content as Record<string, any>).sidebarBlocks || {});
    setDatabaseLessonId(lesson.id);
    setLessonStatus(lesson.status === "published" ? "published" : "draft");
    window.setTimeout(() => {
      hasLoadedLesson.current = true;
    }, 0);
  };

  const handleEditLesson = (lesson: LessonWithVersion) => {
    activateLesson(lesson);
    setActiveTab("builder");
  };

  const duplicateLesson = (lesson?: LessonWithVersion) => {
    const sourceContent = (lesson?.content || workstationState.content) as Record<string, any>;
    const sourceTitle = lesson?.title || newLesson.title || "Untitled Lesson";
    const sourceSlug = typeof sourceContent.slug === "string" ? sourceContent.slug : createSlug(sourceTitle);
    const copySlug = `${sourceSlug.replace(/-copy(?:-\d+)?$/, "")}-copy-${Date.now()}`;
    const copyContent: Record<string, any> = {
      ...sourceContent,
      slug: copySlug,
      title: `${sourceTitle} Copy`,
      student_id: undefined,
      student_token: undefined,
      status: "draft",
    };
    hasLoadedLesson.current = false;
    setDatabaseLessonId(null);
    setSelectedStudentId(null);
    setSelectedStudent(DEFAULT_STUDENT);
    setNewLesson((previous) => ({
      ...previous,
      studentId: "",
      title: `${sourceTitle} Copy`,
      slug: copySlug,
      subtitle: typeof copyContent.subtitle === "string" ? copyContent.subtitle : "",
      moduleNumber: String(copyContent.moduleNumber || 1),
      status: "draft",
    }));
    setWorkstationState((previous) => ({
      ...previous,
      content: copyContent,
      bannerUrl: typeof copyContent.coverImage === "string" ? copyContent.coverImage : previous.bannerUrl,
    }));
    setSidebarBlocksByStep((copyContent as Record<string, any>).sidebarBlocks || {});
    setLessonStatus("draft");
    setSaveIndicator("idle");
    setPublishStatus("Copy ready. Select a student before saving the new draft.");
    setActiveTab("builder");
  };

  const handleDeleteLesson = async () => {
    if (!lessonPendingDelete) return;
    const lesson = lessonPendingDelete;
    setLessonPendingDelete(null);
    setCreatedLessons((current) => current.filter((item) => item.id !== lesson.id));
    if (databaseLessonId === lesson.id) {
      setDatabaseLessonId(null);
      setSaveIndicator("idle");
    }
    try {
      await deleteLesson(lesson.id);
      setPublishStatus(`Lesson '${lesson.title}' deleted.`);
    } catch (error) {
      console.error("Lesson deletion failed:", error);
      setCreatedLessons((current) => [lesson, ...current]);
      setPublishStatus("Lesson deletion failed. The lesson was restored in the table.");
    }
  };

  const getAssignedStudentName = (lesson: LessonWithVersion) => {
    const assignedStudentId = getSavedStudentId(lesson);
    return students.find((student) => student.id === assignedStudentId || student.token === assignedStudentId)?.name || assignedStudentId || "Unassigned";
  };

  useEffect(() => {
    if (!databaseLessonId || students.length === 0) return;
    const currentLesson = createdLessons.find((lesson) => lesson.id === databaseLessonId);
    if (!currentLesson) return;
    const savedStudentId = getSavedStudentId(currentLesson);
    if (!savedStudentId) return;
    const matchingStudent = students.find(
      (student) => student.id === savedStudentId || student.token === savedStudentId
    );
    if (!matchingStudent) return;
    setSelectedStudentId(matchingStudent.id);
    setSelectedStudent(matchingStudent);
    setNewLesson((previous) => ({ ...previous, studentId: matchingStudent.id }));
  }, [databaseLessonId, createdLessons, students]);

  async function handleCreateLesson() {
    const draftStudentId = selectedStudentId || newLesson.studentId || selectedStudent.id;
    const student = students.find((item) => item.id === draftStudentId || item.token === draftStudentId)
      || (selectedStudent.id === draftStudentId || selectedStudent.token === draftStudentId ? selectedStudent : null);
    if (!student) {
      setValidationErrors({ selectedStudentId: "Select a student before creating the draft." });
      setPublishStatus("Select a student before creating the draft.");
      return;
    }
    const title = newLesson.title.trim() || "Untitled Lesson";
    const slug = newLesson.slug.trim().toLowerCase() || createSlug(title);
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
        student_id: assignedStudentId,
        student_token: assignedStudentToken,
        coverImage: workstationState.bannerUrl,
        bannerUrl: workstationState.bannerUrl,
        sidebarBlocks: sidebarBlocksByStep,
      };
      const created = await createLesson({
        title,
        banner_url: workstationState.bannerUrl,
        student_id: student.id,
        student_token: student.token,
        status: newLesson.status,
        content,
        changes_summary: "Initial lesson created in Lesson Builder",
      });
      const lesson = created;
      setSelectedStudentId(student.id);
      setNewLesson((previous) => ({ ...previous, studentId: student.id, title: lesson.title, slug, moduleNumber: String(moduleNumber), status: newLesson.status }));
      setWorkstationState((previous) => ({ ...previous, content: created.content || previous.content }));
      setDatabaseLessonId(created.id);
      hasLoadedLesson.current = true;
      setSaveIndicator("saved");
      await refreshCreatedLessons();
      setValidationErrors({});
      setLessonStatus(newLesson.status);
      setPublishStatus(`Lesson '${lesson.title}' created successfully as ${newLesson.status}.`);
    } catch (error) {
      console.error("Lesson creation failed:", error);
      setPublishStatus("Lesson creation failed. Check the Supabase connection and try again.");
    }
  }

  useEffect(() => {
    void (async () => {
      if (instructorToken !== INSTRUCTOR_TOKEN) {
        setAccessDenied(true);
        setIsMounted(true);
        return;
      }
      setIsMounted(true);
    })();
  }, [instructorToken]);

  useEffect(() => {
    void refreshCreatedLessons();
  }, []);

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
    const timer = window.setTimeout(saveAfterInactivity, 3000);
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
    const loadCounts = async () => {
      const [{ count: pendingCount }, { count: publishedCount }, { count: draftsCount }] = await Promise.all([
        supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("lessons").select("id", { count: "exact", head: true }).eq("status", "published"),
        supabase.from("lessons").select("id", { count: "exact", head: true }).eq("status", "draft"),
      ]);
      setPendingSubmissionCount(pendingCount ?? 0);
      setPublishedLessonCount(publishedCount ?? 0);
      setDraftLessonCount(draftsCount ?? 0);
      setStudents(STUDENT_USERS);
    };
    const refreshCounts = () => void loadCounts();
    void loadCounts();
    window.addEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshCounts);
    window.addEventListener("fluentia:lesson-updated", refreshCounts);
    return () => {
      window.removeEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshCounts);
      window.removeEventListener("fluentia:lesson-updated", refreshCounts);
    };
  }, [createdLessons]);

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
    const title = newLesson.title.trim() || "Untitled Lesson";
    const slug = newLesson.slug.trim().toLowerCase() || createSlug(title);
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
        return;
      }
    }
    const studentId = selectedStudentId || newLesson.studentId || selectedStudent.id;
    if (!studentId) {
      setPublishStatus("Select a student before saving the lesson.");
      return;
    }
    setValidationErrors({});
    setSaveIndicator("saving");
    if (!isAutoSave) setIsPublishing(true);
    const assignedStudent = students.find(
      (student) => student.id === studentId || student.token === studentId
    ) || (selectedStudent.id === studentId || selectedStudent.token === studentId ? selectedStudent : null);
    if (!assignedStudent?.id || !assignedStudent.token) {
      setSaveIndicator("error");
      setPublishStatus("Select a valid student before saving the lesson.");
      if (!isAutoSave) setIsPublishing(false);
      return;
    }
    const content = {
      ...workstationState.content,
      slug,
      title,
      subtitle: newLesson.subtitle.trim() || "A new Fluentia learning journey.",
      moduleNumber,
      student_id: assignedStudent.id,
      student_token: assignedStudent.token,
      coverImage: workstationState.bannerUrl,
      bannerUrl: workstationState.bannerUrl,
      sidebarBlocks: sidebarBlocksByStep,
    };
    try {
      const lesson = databaseLessonId
        ? await updateLesson(databaseLessonId, {
            title,
          banner_url: workstationState.bannerUrl,
          student_id: assignedStudent.id,
          student_token: assignedStudent.token,
            status,
            content,
            changes_summary: `Lesson updated as ${status}`,
          })
        : await createLesson({
            title,
            banner_url: workstationState.bannerUrl,
            student_id: assignedStudent.id,
            student_token: assignedStudent.token,
            status,
            content,
            changes_summary: `Initial lesson created as ${status}`,
          });
      const savedSlug = typeof lesson.content?.slug === "string" ? lesson.content.slug : slug;
      setDatabaseLessonId(lesson.id);
      setNewLesson((previous) => ({
        ...previous,
        studentId,
        title,
        slug: savedSlug,
        moduleNumber: String(moduleNumber),
        status,
      }));
      setWorkstationState((previous) => ({ ...previous, content: lesson.content || content, bannerUrl: workstationState.bannerUrl }));
      hasLoadedLesson.current = true;
      await refreshCreatedLessons();
      setLessonStatus(status);
      setSaveIndicator("saved");
      lastSavedDraftSignature.current = getDraftSignature(content, title, content.subtitle, String(moduleNumber));
      console.log("Lesson saved successfully", { lessonId: lesson.id, status });
      if (!isAutoSave) setPublishStatus(`Lesson saved as ${status} and synced with student view.`);
    } catch (error) {
      console.error("Lesson save failed:", error);
      setSaveIndicator("error");
      if (!isAutoSave) setPublishStatus("Lesson save failed. Check the Supabase connection and try again.");
    } finally {
      if (!isAutoSave) setIsPublishing(false);
    }
  };

  const handleSaveDraft = () => {
    console.log("Saving lesson...", { ...newLesson, content: workstationState.content });
    void saveLessonChanges(newLesson.status === "published" ? "published" : "draft");
  };

  const handlePreviewPublish = () => {
    setShowPreview(true);
    void saveLessonChanges("draft");
  };

  const handleConfirmPublish = () => {
    setShowPreview(false);
    void saveLessonChanges("published");
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
  ] as const;
  const previewContent = workstationState.content[previewStep] as Record<string, any> | undefined;
  const previewBlocks = Array.isArray(previewContent?.blocks)
    ? previewContent.blocks.filter((block: ContentBlock) => block.enabled !== false)
    : [];

  const renderPreviewStep = () => (
    <div className="space-y-4">
      {previewBlocks.map((block: ContentBlock) => (
        <article key={block.id} className="rounded-lg border border-[#293343] bg-[#0c1017] p-4">
          {block.title && <h4 className="mb-2 text-sm font-semibold text-stone-100">{block.title}</h4>}
          {block.type === "text" && <MarkdownContent value={block.body || "No text added yet."} className="text-sm leading-relaxed text-stone-300" />}
          {block.type === "image" && <>{block.imageUrl ? <img src={block.imageUrl} alt={block.caption || block.title || "Lesson image"} className="max-h-72 w-full rounded-md object-cover" /> : <p className="text-xs text-stone-500">Image not configured.</p>}{block.caption && <p className="mt-2 text-xs text-stone-500">{block.caption}</p>}</>}
          {block.type === "audio" && <CustomAudioPlayer src={block.audioUrl} label={block.title || "Audio lesson"} />}
          {block.type === "video" && <div className="rounded-md border border-dashed border-[#394252] p-4 text-xs text-stone-500">Video preview: {block.videoUrl || "URL not configured"}</div>}
          {block.type === "question" && <div className="space-y-2"><p className="text-sm text-stone-300">{block.prompt || "Question not configured."}</p><div className="flex flex-wrap gap-2">{block.options.filter(Boolean).map((option) => <span key={option} className="rounded border border-[#394252] px-2 py-1 text-xs text-stone-400">{option}</span>)}</div></div>}
          {block.type === "quiz" && <div className="space-y-3">{(block.questions || []).map((question, index) => <div key={`${block.id}-${index}`}><p className="text-sm text-stone-300">{question.prompt || "Question not configured."}</p><div className="mt-2 flex flex-wrap gap-2">{question.options.map((option) => <span key={option} className="rounded border border-[#394252] px-2 py-1 text-xs text-stone-400">{option || "Option"}</span>)}</div></div>)}</div>}
        </article>
      ))}
      {previewBlocks.length === 0 && <p className="rounded-lg border border-dashed border-[#394252] p-6 text-sm text-stone-500">This step has no content blocks yet.</p>}
    </div>
  );

  if (!isMounted) return null;
  if (accessDenied) return <AccessCard title="Access Denied" message="This instructor workstation requires a valid instructor session token." />;

  return (
    <div className="min-h-screen bg-[#0c1017] font-sans text-[#e8e7e4]">
      <div className="mx-auto max-w-6xl px-6 py-6 md:py-8">
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-[#202631] pb-4 md:flex-row md:items-center">
          <div>
<span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400">Fluentia Instructor Studio</span>
<h1 className="mt-2 font-[var(--font-fraunces)] text-2xl font-semibold text-[#f1eee8]">Instructor Workstation</h1>
</div>
          {activeTab === "builder" && <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
            <select value={databaseLessonId && createdLessons.some((lesson) => lesson.id === databaseLessonId && lesson.status === "draft") ? databaseLessonId : ""} onChange={(event) => { const draft = createdLessons.find((lesson) => lesson.id === event.target.value); if (draft) activateLesson(draft); }} aria-label="Drafts" className="min-w-[280px] max-w-[320px] truncate rounded-lg border border-amber-500/50 bg-[#171d28] px-3 py-2.5 text-xs font-semibold text-amber-300 outline-none transition-colors hover:bg-amber-500 hover:text-black [color-scheme:dark]"><option value="" className="bg-slate-900 text-slate-100">Drafts</option>{createdLessons.filter((lesson) => lesson.status === "draft").slice(0, 8).map((lesson) => <option key={lesson.id} value={lesson.id} className="bg-slate-900 text-slate-100">{lesson.title}</option>)}</select>
            {databaseLessonId && <button type="button" onClick={() => { const currentLesson = createdLessons.find((lesson) => lesson.id === databaseLessonId); duplicateLesson(currentLesson); }} className="rounded-lg border border-sky-500/50 px-4 py-2.5 text-xs font-semibold text-sky-300 hover:bg-sky-500 hover:text-black">Duplicate / Save As</button>}
            <button type="button" onClick={handleSaveDraft} className="rounded-lg border border-amber-500/50 px-4 py-2.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500 hover:text-black">Save</button>
            {newLesson.status === "published" && <><button type="button" onClick={() => void saveLessonChanges("published")} className="rounded-lg border border-emerald-500/50 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-black">Update Published Lesson</button><button type="button" onClick={() => duplicateLesson(createdLessons.find((lesson) => lesson.id === databaseLessonId))} className="rounded-lg border border-sky-500/50 px-4 py-2.5 text-xs font-semibold text-sky-300 hover:bg-sky-500 hover:text-black">Save as New Draft</button></>}
            <button type="button" onClick={handlePreviewPublish} className="rounded-lg border border-amber-500/50 px-4 py-2.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500 hover:text-black">Preview &amp; Publish</button>
            </div>
            <div className="flex min-h-5 items-center gap-3 text-xs" aria-live="polite">
              {publishStatus !== null && publishStatus.trim().length > 0 && <span className="rounded-lg border border-[#202631] bg-[#171d28] px-3 py-1.5 font-medium text-amber-400">{publishStatus}</span>}
              {databaseLessonId && <span className={saveIndicator === "error" ? "text-red-300" : "text-stone-400"}>{saveIndicator === "saving" ? "● Saving" : saveIndicator === "saved" ? "● Auto-saved" : saveIndicator === "error" ? "● Save failed" : "● Saved"}</span>}
            </div>
          </div>}
        </header>

        <nav className="sticky top-0 z-20 mb-8 border-b border-[#202631] bg-[#0c1017]/95 backdrop-blur" aria-label="Instructor workstation views">
          <div className="flex items-center justify-between gap-4 overflow-x-auto">
            <div className="flex shrink-0 gap-1">
              {([["dashboard", "Dashboard"], ["builder", "Lesson Builder"], ["evaluation", "Student Evaluation"]] as const).map(([tab, label]) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition ${activeTab === tab ? "border-amber-500 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-200"}`}>{label}</button>)}
            </div>
            <label className="flex w-64 max-w-[240px] shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-400">
              <span className="sr-only">Active student</span>
              <select value={selectedStudentId || ""} onChange={(event) => { const nextStudent = students.find((student) => student.id === event.target.value); if (nextStudent) void handleStudentChange(nextStudent); }} className="w-full rounded-md border border-amber-500/50 bg-[#171d28] px-3 py-2 text-xs font-medium normal-case tracking-normal text-stone-200 outline-none transition-colors hover:border-amber-400 focus:border-amber-400 [color-scheme:dark]" aria-label="Select active student">
                <option value="">Choose a student</option>
                {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
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
            <button type="button" onClick={() => setActiveTab("builder")} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-left transition hover:border-amber-500/60">
<p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Drafts</p>
<p className="mt-2 text-2xl font-semibold text-stone-100">{draftLessonCount}</p>
<p className="mt-1 text-xs text-stone-500">Open the lesson builder</p>
</button>
            <button type="button" onClick={() => setActiveTab("builder")} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-left transition hover:border-amber-500/60">
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
                <select id="active-student-selector" value={selectedStudentId || ""} onChange={(event) => { const nextStudent = students.find((student) => student.id === event.target.value); if (nextStudent) { void handleStudentChange(nextStudent); setActiveStudentsOpen(false); } }} className="w-full rounded-md border border-[#394252] bg-[#0c1017] p-2.5 text-xs text-stone-200 [color-scheme:dark]" aria-label="Select active student">
                  <option value="">Choose a student</option>
                  {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                </select>
              </div>
            </details>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
<div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
<h2 className="font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Pending Submissions</h2>
<p className="mt-3 text-sm text-stone-400">{pendingSubmissionCount > 0 ? "Submissions are awaiting review." : "No submissions are currently awaiting feedback."}</p>
</div>
<div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
<h2 className="font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Recent Activity</h2>
<p className="mt-3 text-sm text-stone-400">{selectedStudent.name} is the active student workspace.</p>
<button type="button" onClick={() => setActiveTab("evaluation")} className="mt-4 text-xs font-semibold text-amber-300 hover:text-amber-200">Review student work</button>
</div>
</div>
          <section className="overflow-hidden rounded-xl border border-[#202631] bg-[#171d28]/60" aria-labelledby="lesson-management-title">
            <div className="flex items-center justify-between gap-4 border-b border-[#202631] px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Lesson Management</p>
                <h2 id="lesson-management-title" className="mt-1 font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">All Lessons</h2>
              </div>
              <span className="text-xs text-stone-500">{createdLessons.length} lessons</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-left text-xs">
                <thead className="border-b border-[#202631] bg-[#0c1017] text-[10px] uppercase tracking-[0.12em] text-stone-500">
                  <tr><th className="px-5 py-3 font-semibold">Title</th><th className="px-4 py-3 font-semibold">Subtitle</th><th className="px-4 py-3 font-semibold">Assigned Student</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Module</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-[#202631]">
                  {createdLessons.map((lesson) => <tr key={lesson.id} onClick={() => handleEditLesson(lesson)} className="cursor-pointer text-stone-300 transition hover:bg-[#202631]/30">
                    <td className="max-w-[220px] px-5 py-4"><button type="button" onClick={() => handleEditLesson(lesson)} className="max-w-full text-left"><p className="truncate font-semibold text-stone-100">{lesson.title}</p><p className="mt-1 truncate text-[10px] text-stone-600">{lesson.content?.slug || lesson.id}</p></button></td>
                    <td className="max-w-[260px] px-4 py-4"><span className="line-clamp-2 text-stone-400">{lesson.content?.subtitle || lesson.subtitle || "No subtitle"}</span></td>
                    <td className="px-4 py-4 text-stone-300">{getAssignedStudentName(lesson)}</td>
                    <td className="px-4 py-4"><span className={`rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${lesson.status === "published" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>{lesson.status === "published" ? "Published" : "Draft"}</span></td>
                    <td className="px-4 py-4 text-stone-300">Module {lesson.content?.moduleNumber || lesson.module_number || 1}</td>
                    <td className="px-4 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={(event) => { event.stopPropagation(); handleEditLesson(lesson); }} className="rounded-md border border-amber-500/50 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500 hover:text-black">Edit / Continue</button><button type="button" onClick={(event) => { event.stopPropagation(); duplicateLesson(lesson); }} className="rounded-md border border-sky-500/50 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500 hover:text-black">Duplicate</button><button type="button" onClick={(event) => { event.stopPropagation(); setLessonPendingDelete(lesson); }} aria-label={`Delete ${lesson.title}`} title="Delete lesson" className="flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></div></td>
                  </tr>)}
                  {createdLessons.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-stone-500">No lessons have been created yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </section>}

        {activeTab === "builder" && <>
          <section className="mb-6 rounded-xl border border-[#202631] bg-[#171d28]/60 p-5" aria-labelledby="lesson-details-title">
                {Object.keys(validationErrors).length > 0 && <div className="mb-4 space-y-1 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300" role="alert">{Object.entries(validationErrors).map(([field, message]) => <p key={field}>{message}</p>)}</div>}
            <div className="mb-4">
<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Lesson Builder</p>
<h2 id="lesson-details-title" className="mt-1 font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Lesson Details</h2>
</div>
            <div className="grid gap-3 md:grid-cols-4">
<label className="text-xs text-stone-400">Lesson Title<input value={newLesson.title} onChange={(event) => setLessonTitle(event.target.value)} placeholder="A new lesson" className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" />
</label>
<label className="text-xs text-stone-400">Select Student<select value={selectedStudentId || ""} onChange={(event) => { const nextStudent = students.find((student) => student.id === event.target.value); if (nextStudent) void handleStudentChange(nextStudent); }} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 [color-scheme:dark]" aria-label="Select student for lesson">{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
</label>
<label className="text-xs text-stone-400">Module Number<input value={newLesson.moduleNumber} onChange={(event) => setNewLesson((previous) => ({ ...previous, moduleNumber: event.target.value }))} placeholder="1" className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" />
</label>
<label className="text-xs text-stone-400">Visibility<select value={newLesson.status} onChange={(event) => setNewLesson((previous) => ({ ...previous, status: event.target.value as "draft" | "published" }))} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200">
<option value="draft">Draft</option>
<option value="published">Published</option>
</select>
</label>
</div>
            <label className="mt-3 block text-xs text-stone-400">Subtitle<input value={newLesson.subtitle} onChange={(event) => setNewLesson((previous) => ({ ...previous, subtitle: event.target.value }))} placeholder="Lesson summary" className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" />
</label>
          </section>
          <main className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-8">
              <LessonTailorEditor content={workstationState.content} onChange={(content: StrictStepContent) => setWorkstationState((previous) => ({ ...previous, content }))} />
            </div>
            <aside className="space-y-6 lg:col-span-4">
              <details className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5" open={heroBannerOpen} onToggle={(event) => setHeroBannerOpen(event.currentTarget.open)}>
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-stone-200"><span>Hero Banner</span><ChevronDown className={`h-4 w-4 text-amber-400 transition-transform ${heroBannerOpen ? "rotate-180" : ""}`} aria-hidden="true" /></summary>
                <div className="mt-4"><InstructorBannerManager bannerUrl={workstationState.bannerUrl} customInput={workstationState.customBannerUrl} onUpdateBanner={(bannerUrl: string) => setWorkstationState((previous) => ({ ...previous, bannerUrl }))} onUpdateCustomInput={(customBannerUrl: string) => setWorkstationState((previous) => ({ ...previous, customBannerUrl }))} /></div>
              </details>
              <section className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
                <div className="flex items-center justify-between gap-3"><h3 className="font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Step Sidebar</h3><button type="button" onClick={() => setSidebarBlocksByStep((current) => ({ ...current, [sidebarStep]: [...(current[sidebarStep] || []), { id: `sidebar-${Date.now()}`, title: "Sidebar note", body: "" }] }))} className="flex items-center gap-1.5 rounded-md border border-amber-500 px-3 py-2 text-sm text-amber-500"><Plus className="h-3.5 w-3.5" />Add Block</button></div>
                <select value={sidebarStep} onChange={(event) => setSidebarStep(event.target.value as keyof SidebarBlocksByStep)} className="mt-3 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2 text-xs text-stone-200 [color-scheme:dark]" aria-label="Sidebar step"><option value="warm_up">Warm-up</option><option value="lesson">Lesson</option><option value="listening">Listening</option><option value="reading">Reading</option><option value="writing">Writing</option><option value="speaking">Speaking</option></select>
                <div className="mt-4 space-y-3">{(sidebarBlocksByStep[sidebarStep] || []).map((block) => <div key={block.id} className="rounded-lg border border-[#202631] bg-[#0c1017] p-3"><div className="flex gap-2"><input value={block.title} onChange={(event) => setSidebarBlocksByStep((current) => ({ ...current, [sidebarStep]: (current[sidebarStep] || []).map((item) => item.id === block.id ? { ...item, title: event.target.value } : item) }))} className="min-w-0 flex-1 border-b border-[#394252] bg-transparent pb-1 text-xs font-semibold text-stone-200" aria-label="Sidebar block title" /><button type="button" onClick={() => setSidebarBlocksByStep((current) => ({ ...current, [sidebarStep]: (current[sidebarStep] || []).filter((item) => item.id !== block.id) }))} aria-label={`Delete ${block.title}`}><Trash2 className="h-3.5 w-3.5" /></button></div><textarea value={block.body} onChange={(event) => setSidebarBlocksByStep((current) => ({ ...current, [sidebarStep]: (current[sidebarStep] || []).map((item) => item.id === block.id ? { ...item, body: event.target.value } : item) }))} rows={3} className="mt-3 w-full resize-y rounded-md border border-[#202631] bg-[#171d28] p-2.5 text-xs text-stone-300" /></div>)}</div>
              </section>
            </aside>
          </main>
        </>}

        {activeTab === "evaluation" && <>
<div className="mb-6">
<StudentContextPanel studentName={selectedStudent?.name || "Selected Student"} profile={workstationState.studentProfile} onUpdateProfile={(studentProfile: StudentProfile) => setWorkstationState((previous) => ({ ...previous, studentProfile }))} onSaveProfile={async (studentProfile: StudentProfile) => { const studentToken = selectedStudent.token || selectedStudent.id; await saveStudentProfile(studentToken, studentProfile); window.localStorage.setItem(`fluentia:student-profile-sync:${studentToken}`, new Date().toISOString()); window.dispatchEvent(new CustomEvent(FLUENTIA_DATA_UPDATED_EVENT, { detail: { type: "student-profile", studentToken } })); }} />
</div>
<section className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-12" aria-label="Student submission review workspace">
<div className="space-y-5 lg:col-span-7">
<div className="flex justify-between border-b border-[#202631] pb-4">
<div>
<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Submission Review Workspace</p>
<h2 className="mt-1 font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">{selectedStudent?.name || "Selected Student"}&apos;s answers</h2>
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
<SubmissionEvaluator lessonId={newLesson.slug || lessonId} studentName={selectedStudent?.name || "Selected Student"} evaluation={workstationState.evaluation} onUpdateEvaluation={(evaluation: LessonEvaluation) => setWorkstationState((previous) => ({ ...previous, evaluation }))} onSubmitFeedback={async (feedback: FeedbackPayload) => { const evaluation = { ...workstationState.evaluation, scores: feedback.scores, comments: feedback.comments, criterionFeedback: feedback.criterionFeedback, published: true }; setWorkstationState((previous) => ({ ...previous, evaluation })); await saveInstructorFeedback(newLesson.slug || lessonId, selectedStudent.token, evaluation); setPublishStatus("Strengths, study plan, and evaluation synced with student view!"); }} />
</div>
</section>
</>}
      </div>
      {showPreview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="lesson-preview-title">
        <div className="flex h-[88vh] max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#394252] bg-[#171d28] shadow-2xl">
          <div className="flex flex-col gap-4 border-b border-[#293343] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">{workstationState.bannerUrl && <img src={workstationState.bannerUrl} alt="" className="h-12 w-20 rounded object-cover" />}<div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Student View Preview</p><h2 id="lesson-preview-title" className="mt-1 font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">{newLesson.title || "Untitled Lesson"}</h2><p className="mt-1 text-sm text-stone-400">{newLesson.subtitle || "Your instructor has prepared this lesson for you."}</p></div></div>
            <div className="flex items-center gap-2">{workstationState.content.ambientMusicUrl && <AmbientMusicPlayer src={workstationState.content.ambientMusicUrl} />}<button type="button" onClick={() => setShowPreview(false)} className="rounded-md border border-amber-500/50 px-3 py-2 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500 hover:text-black">Back to Editing</button><button type="button" onClick={handleConfirmPublish} disabled={isPublishing} className="rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-amber-400 disabled:opacity-50">Publish Lesson</button></div>
          </div>
          <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[180px_1fr]">
            <nav className="flex gap-2 overflow-x-auto border-b border-[#293343] p-3 md:block md:space-y-1 md:border-b-0 md:border-r" aria-label="Preview lesson steps">{previewSteps.map(([step, label]) => <button key={step} type="button" onClick={() => setPreviewStep(step)} className={`block shrink-0 rounded-md px-3 py-2 text-left text-xs transition-colors md:w-full ${previewStep === step ? "bg-amber-500 text-black" : "text-stone-400 hover:bg-amber-500/10 hover:text-amber-300"}`}>{label}</button>)}</nav>
            <div className="min-h-0 overflow-y-auto p-5"><div className="mb-5 border-b border-[#293343] pb-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">{previewSteps.find(([step]) => step === previewStep)?.[1]}</p><p className="mt-2 text-sm text-stone-400">{newLesson.subtitle || "Your instructor has prepared this lesson for you."}</p></div>{renderPreviewStep()}</div>
          </div>
        </div>
      </div>}
      {lessonPendingDelete && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-lesson-title"><div className="w-full max-w-md rounded-xl border border-[#394252] bg-[#171d28] p-6 shadow-2xl"><h2 id="delete-lesson-title" className="font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Delete lesson?</h2><p className="mt-3 text-sm leading-relaxed text-stone-400">Are you sure you want to delete this lesson?</p><p className="mt-2 truncate text-xs text-amber-300">{lessonPendingDelete.title}</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setLessonPendingDelete(null)} className="rounded-md border border-[#394252] px-4 py-2 text-xs font-semibold text-stone-300 hover:border-stone-300">Cancel</button><button type="button" onClick={() => void handleDeleteLesson()} className="rounded-md bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400">Delete lesson</button></div></div></div>}
    </div>
  );
}