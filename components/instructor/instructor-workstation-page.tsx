"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MOCK_INSTRUCTOR_LESSONS } from "@/lib/mock-instructor-data";
import { StudentContextPanel } from "@/components/instructor/student-context-panel";
import { LessonTailorEditor } from "@/components/instructor/lesson-tailor-editor";
import { InstructorBannerManager } from "@/components/instructor/banner-manager";
import { SubmissionEvaluator, FeedbackPayload } from "@/components/instructor/submission-evaluator";
import { LessonContent, LessonEvaluation, StrictStepContent, StudentProfile, StudentSubmission } from "@/types/lesson";
import { INSTRUCTOR_TOKEN, PublishedLessonState } from "@/lib/lesson-store";
import { DEFAULT_STUDENT, STUDENT_USERS, StudentUser } from "@/lib/users";
import { FLUENTIA_DATA_UPDATED_EVENT, saveInstructorFeedback, saveLesson } from "@/services/storage-service";
import { AccessCard } from "@/components/access/access-card";

interface InstructorWorkstationProps {
  instructorToken: string;
  lessonSlug: string;
  allowStudentQuery?: boolean;
}

export default function InstructorWorkstationPage({
  instructorToken,
  lessonSlug,
  allowStudentQuery = true,
}: InstructorWorkstationProps) {
  const lessonId = lessonSlug;
  const initialLesson = MOCK_INSTRUCTOR_LESSONS[lessonId] || MOCK_INSTRUCTOR_LESSONS["habits-01"];

  const [isMounted, setIsMounted] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(DEFAULT_STUDENT);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentUser[]>([]);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  const [databaseLessonId, setDatabaseLessonId] = useState<string | null>(null);
  const [pendingSubmissionCount, setPendingSubmissionCount] = useState(0);
  const [publishedLessonCount, setPublishedLessonCount] = useState(0);
  const [studentCount, setStudentCount] = useState(0);
  const [lessonStatus, setLessonStatus] = useState<"draft" | "published">("published");
  const [activeTab, setActiveTab] = useState<"dashboard" | "builder" | "evaluation">("dashboard");
  const [sidebarBlocks, setSidebarBlocks] = useState([
    { id: "teacher-notes", title: "Teacher Notes", body: "" },
    { id: "extra-vocabulary", title: "Extra Vocabulary", body: "" },
  ]);

  const [workstationState, setWorkstationState] = useState<{
    content: StrictStepContent;
    bannerUrl: string;
    customBannerUrl: string;
    studentProfile: StudentProfile;
    evaluation: LessonEvaluation;
    submission?: StudentSubmission;
  }>({
    content: initialLesson.content || {},
    bannerUrl: initialLesson.banner_image_url || "",
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
  const [showPublishConfirmation, setShowPublishConfirmation] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Partial<Record<"selectedStudentId" | "title" | "slug" | "moduleNumber", string>>>({});
  const [createdLessons, setCreatedLessons] = useState<LessonContent[]>([]);
  const [newLesson, setNewLesson] = useState({
    studentId: DEFAULT_STUDENT.id,
    title: "",
    slug: "",
    subtitle: "",
    moduleNumber: "",
    warmUp: "",
    lessonText: "",
    lexiconNotes: "",
    prompts: "",
    status: "draft" as "draft" | "published",
  });

  const resetNewLessonForm = (studentId = "") =>
    setNewLesson({
      studentId,
      title: "",
      slug: "",
      subtitle: "",
      moduleNumber: "",
      warmUp: "",
      lessonText: "",
      lexiconNotes: "",
      prompts: "",
      status: "draft",
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

    const { data: lesson } = await supabase
      .from("lessons")
      .select("*")
      .eq("student_id", id)
      .eq("slug", requestedLessonSlug)
      .maybeSingle();

    const loadedLesson = Array.isArray(lesson) ? lesson[0] : lesson;
    if (!loadedLesson) {
      resetNewLessonForm(id);
    }

    setSelectedStudent(student);
    setWorkstationState((previous) => ({ ...previous, studentProfile: student.profile }));
    setDatabaseLessonId(loadedLesson?.id || null);
  }

  const createSlug = (title: string) => {
    const normalizedTitle = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return normalizedTitle || `lesson-${Date.now()}`;
  };

  const persistInstructorLessonLocally = (lesson: LessonContent) => {
    if (typeof window === "undefined") return;
    try {
      const storedLessons = JSON.parse(window.localStorage.getItem("fluentia:instructor-lessons") || "[]") as LessonContent[];
      const nextLessons = [...storedLessons.filter((item) => item.slug !== lesson.slug), lesson];
      window.localStorage.setItem("fluentia:instructor-lessons", JSON.stringify(nextLessons));
      setCreatedLessons((previous) => [...previous.filter((item) => item.slug !== lesson.slug), lesson]);
    } catch (error) {
      console.error("Save error:", error);
      setCreatedLessons((previous) => [...previous.filter((item) => item.slug !== lesson.slug), lesson]);
    }
  };

  const activateLesson = (lesson: LessonContent) => {
    setSelectedStudentId(lesson.studentId || null);
    setNewLesson((previous) => ({
      ...previous,
      studentId: lesson.studentId || previous.studentId,
      title: lesson.title,
      slug: lesson.slug,
      subtitle: lesson.subtitle || "",
      moduleNumber: String(lesson.moduleNumber),
      status: lesson.status || "draft",
    }));
    setWorkstationState((previous) => ({ ...previous, content: lesson.content || previous.content }));
    setLessonStatus(lesson.status || "draft");
  };

  async function handleCreateLesson() {
    const draftStudentId = selectedStudentId || newLesson.studentId || selectedStudent.id;
    const student = students.find((item) => item.id === draftStudentId) || selectedStudent;
    if (!student) {
      setValidationErrors({ selectedStudentId: "Select a student before creating the draft." });
      setPublishStatus("Select a student before creating the draft.");
      return;
    }
    const title = newLesson.title.trim() || "Untitled Lesson";
    const slug = newLesson.slug.trim().toLowerCase() || createSlug(title);
    const moduleNumber = Number(newLesson.moduleNumber) || 1;

    const lesson: LessonContent = {
      id: `lesson-${slug}`,
      title,
      slug,
      studentId: draftStudentId,
      subtitle: newLesson.subtitle.trim() || "A new Fluentia learning journey.",
      moduleNumber,
      status: "draft",
      coverImage: initialLesson.banner_image_url,
      content: {},
    };

    try {
      await saveLesson(lesson);
      setSelectedStudentId(student.id);
      setNewLesson((previous) => ({ ...previous, studentId: student.id, title: lesson.title, slug: lesson.slug, moduleNumber: String(moduleNumber), status: "draft" }));
      setWorkstationState((previous) => ({ ...previous, content: lesson.content || previous.content }));
      persistInstructorLessonLocally(lesson);
      setValidationErrors({});
      setLessonStatus("draft");
      setPublishStatus(`Lesson '${lesson.title}' created successfully as draft.`);
    } catch (error) {
      console.error("Save error:", error);
      persistInstructorLessonLocally(lesson);
      activateLesson(lesson);
      setPublishStatus(`Lesson '${lesson.title}' created successfully as draft (saved locally).`);
    }
  }

  useEffect(() => {
    void (async () => {
      if (instructorToken !== INSTRUCTOR_TOKEN) {
        setAccessDenied(true);
        setIsMounted(true);
        return;
      }
      setStudents(STUDENT_USERS);
      setIsMounted(true);
    })();
  }, [instructorToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedLessons = JSON.parse(window.localStorage.getItem("fluentia:instructor-lessons") || "[]") as LessonContent[];
      setCreatedLessons(storedLessons);
    } catch (error) {
      console.error("Load error:", error);
    }
  }, []);

  useEffect(() => {
    const loadCounts = async () => {
      const [{ count: pendingCount }, { count: publishedCount }, { count: studentsCount }] = await Promise.all([
        supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("lessons").select("id", { count: "exact", head: true }).eq("status", "published"),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
      setPendingSubmissionCount(pendingCount || 0);
      setPublishedLessonCount(publishedCount || createdLessons.filter((lesson) => lesson.status === "published").length);
      setStudentCount(studentsCount || students.length);
    };
    const refreshCounts = () => void loadCounts();
    void loadCounts();
    window.addEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshCounts);
    return () => window.removeEventListener(FLUENTIA_DATA_UPDATED_EVENT, refreshCounts);
  }, [createdLessons, students]);

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

  const saveLessonChanges = async (status: "draft" | "published") => {
    const title = newLesson.title.trim() || "Untitled Lesson";
    const slug = newLesson.slug.trim().toLowerCase() || createSlug(title);
    const moduleNumber = Number(newLesson.moduleNumber) || 1;
    if (status === "published") {
      const errors: typeof validationErrors = {};
      if (!selectedStudentId) errors.selectedStudentId = "Select a student.";
      if (!newLesson.title.trim()) errors.title = "Enter a lesson title.";
      if (!newLesson.slug.trim()) errors.slug = "Enter a lesson slug.";
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newLesson.slug.trim().toLowerCase())) errors.slug = "Use lowercase letters, numbers, and hyphens only.";
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
    setIsPublishing(true);
    const lesson: LessonContent = {
      id: databaseLessonId || `lesson-${slug}`,
      title,
      slug,
      studentId,
      subtitle: newLesson.subtitle.trim() || "A new Fluentia learning journey.",
      moduleNumber,
      status,
      coverImage: workstationState.bannerUrl || initialLesson.banner_image_url,
      content: workstationState.content,
    };
    try {
      await saveLesson(lesson);
      persistInstructorLessonLocally(lesson);
      setDatabaseLessonId(lesson.id);
      setLessonStatus(status);
      setPublishStatus(`Lesson saved as ${status} and synced with student view.`);
    } catch (error) {
      console.error("Save error:", error);
      persistInstructorLessonLocally(lesson);
      activateLesson(lesson);
      setPublishStatus(`Lesson saved as ${status} locally after a sync error.`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveDraft = () => {
    void saveLessonChanges("draft");
  };

  const handleConfirmPublish = () => {
    setShowPublishConfirmation(false);
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
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : submissionState === "Submitted (Needs Review)"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : "border-[#394252] bg-[#171d28] text-stone-400";

  if (!isMounted) return null;
  if (accessDenied) return <AccessCard title="Access Denied" message="This instructor workstation requires a valid instructor session token." />;

  return (
    <div className="min-h-screen bg-[#0c1017] font-sans text-[#e8e7e4]">
      <div className="mx-auto max-w-6xl px-6 py-6 md:py-8">
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-[#202631] pb-4 md:flex-row md:items-center">
          <div><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400">Fluentia Instructor Studio</span><h1 className="mt-2 font-[var(--font-fraunces)] text-2xl font-semibold text-[#f1eee8]">Instructor Workstation</h1></div>
          <div className="flex items-center gap-3">
            {publishStatus !== null && publishStatus.trim().length > 0 && <span className="rounded-lg border border-[#202631] bg-[#171d28] px-3 py-1.5 text-xs font-medium text-amber-400">{publishStatus}</span>}
            <button type="button" onClick={handleSaveDraft} disabled={isPublishing} className="w-32 rounded-lg border border-[#394252] px-5 py-2.5 text-xs font-semibold text-stone-200 transition hover:border-amber-500 hover:text-amber-300 disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setShowPublishConfirmation(true)} disabled={isPublishing} className="w-32 rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-semibold text-[#0c1017] shadow transition hover:bg-amber-400 disabled:opacity-50">Publish Lesson</button>
          </div>
        </header>

        <nav className="sticky top-0 z-20 mb-8 border-b border-[#202631] bg-[#0c1017]/95 backdrop-blur" aria-label="Instructor workstation views">
          <div className="flex gap-1 overflow-x-auto">
            {([["dashboard", "Dashboard"], ["builder", "Lesson Builder"], ["evaluation", "Student Evaluation"]] as const).map(([tab, label]) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition ${activeTab === tab ? "border-amber-500 text-amber-300" : "border-transparent text-stone-500 hover:text-stone-200"}`}>{label}</button>)}
          </div>
        </nav>

        {activeTab === "dashboard" && <section className="space-y-6" aria-label="Instructor dashboard overview">
          <div className="grid gap-4 md:grid-cols-3">
            <button type="button" onClick={() => setActiveTab("evaluation")} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-left transition hover:border-amber-500/60"><p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Submission Status</p><p className="mt-2 text-2xl font-semibold text-stone-100">{submissionState}</p><p className="mt-1 text-xs text-stone-500">{pendingSubmissionCount} pending submissions</p></button>
            <button type="button" onClick={() => setActiveTab("builder")} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-left transition hover:border-amber-500/60"><p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Published Lessons</p><p className="mt-2 text-2xl font-semibold text-stone-100">{publishedLessonCount}</p><p className="mt-1 text-xs text-stone-500">Open the lesson builder</p></button>
            <button type="button" onClick={() => setActiveTab("evaluation")} className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-left transition hover:border-amber-500/60"><p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Active Students</p><p className="mt-2 text-2xl font-semibold text-stone-100">{studentCount}</p><p className="mt-1 text-xs text-stone-500">Review {selectedStudent?.name || "Selected Student"}</p></button>
          </div>
          <div className="grid gap-6 lg:grid-cols-2"><div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5"><h2 className="font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Pending Submissions</h2><p className="mt-3 text-sm text-stone-400">{pendingSubmissionCount > 0 ? "Submissions are awaiting review." : "No submissions are currently awaiting feedback."}</p></div><div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5"><h2 className="font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Recent Activity</h2><p className="mt-3 text-sm text-stone-400">{selectedStudent.name} is the active student workspace.</p><button type="button" onClick={() => setActiveTab("evaluation")} className="mt-4 text-xs font-semibold text-amber-300 hover:text-amber-200">Review student work</button></div></div>
        </section>}

        {activeTab === "builder" && <>
          <section className="mb-6 rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
                {Object.keys(validationErrors).length > 0 && <div className="mb-4 space-y-1 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300" role="alert">{Object.entries(validationErrors).map(([field, message]) => <p key={field}>{message}</p>)}</div>}
            <div className="mb-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Lesson Library</p><h2 className="mt-1 font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Create / Add New Lesson</h2></div>
            <div className="grid gap-3 md:grid-cols-4"><label className="text-xs text-stone-400">Select Student<select value={selectedStudentId || ""} onChange={(event) => { const nextStudent = students.find((student) => student.id === event.target.value); if (nextStudent) void handleStudentChange(nextStudent); }} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 [color-scheme:dark]" aria-label="Select student for lesson">{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>{[["title", "Lesson Title", "Business Pitching 101"], ["slug", "Slug", "pitch-01"], ["subtitle", "Subtitle", "Present ideas with clarity"]].map(([field, label, placeholder]) => <label key={field} className="text-xs text-stone-400">{label}<input value={newLesson[field as keyof typeof newLesson]} onChange={(event) => field === "title" ? setLessonTitle(event.target.value) : field === "slug" ? setSlug(event.target.value) : setNewLesson((previous) => ({ ...previous, [field]: event.target.value }))} placeholder={placeholder} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>)}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-4"><label className="text-xs text-stone-400">Module Number<input value={newLesson.moduleNumber} onChange={(event) => setNewLesson((previous) => ({ ...previous, moduleNumber: event.target.value }))} placeholder="3" className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label><label className="text-xs text-stone-400">Visibility<select value={newLesson.status} onChange={(event) => setNewLesson((previous) => ({ ...previous, status: event.target.value as "draft" | "published" }))} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200"><option value="draft">Draft</option><option value="published">Published</option></select></label></div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">{[["warmUp", "Warm-up"], ["lessonText", "Lesson Text"], ["lexiconNotes", "Lexicon Notes"], ["prompts", "Prompts"]].map(([field, label]) => <label key={field} className="text-xs text-stone-400">{label}<textarea value={newLesson[field as keyof typeof newLesson]} onChange={(event) => setNewLesson((previous) => ({ ...previous, [field]: event.target.value }))} rows={2} className="mt-1 w-full resize-none rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>)}</div>
            <button type="button" onClick={handleCreateLesson} className="mt-4 rounded-md bg-amber-500 px-4 py-2.5 text-xs font-semibold text-[#0c1017] transition hover:bg-amber-400">Create Lesson</button>
          </section>
          {createdLessons.length > 0 && <section className="mb-6 rounded-xl border border-[#202631] bg-[#171d28]/60 p-5" aria-label="Created lessons">
            <div className="mb-3"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Created Lessons</p><h2 className="mt-1 font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Continue editing</h2></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{createdLessons.map((lesson) => <button key={lesson.slug} type="button" onClick={() => activateLesson(lesson)} className={`rounded-lg border p-3 text-left transition ${newLesson.slug === lesson.slug ? "border-amber-500 bg-amber-500/10" : "border-[#394252] bg-[#0c1017] hover:border-amber-500/60"}`}><span className="block text-sm font-semibold text-stone-100">{lesson.title}</span><span className="mt-1 block text-xs text-stone-500">{lesson.slug} · {lesson.status || "draft"}</span></button>)}</div>
          </section>}
          <main className="grid grid-cols-1 gap-6 lg:grid-cols-12"><div className="space-y-6 lg:col-span-8"><LessonTailorEditor content={workstationState.content} onChange={(content: StrictStepContent) => setWorkstationState((previous) => ({ ...previous, content }))} /></div><div className="space-y-6 lg:col-span-4"><InstructorBannerManager bannerUrl={workstationState.bannerUrl} customInput={workstationState.customBannerUrl} onUpdateBanner={(bannerUrl: string) => setWorkstationState((previous) => ({ ...previous, bannerUrl }))} onUpdateCustomInput={(customBannerUrl: string) => setWorkstationState((previous) => ({ ...previous, customBannerUrl }))} /><div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5"><div className="flex items-center justify-between"><h3 className="font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Sidebar Blocks</h3><button type="button" onClick={() => setSidebarBlocks((blocks) => [...blocks, { id: `block-${Date.now()}`, title: "References", body: "" }])} className="flex items-center gap-1.5 rounded-md border border-amber-500 px-3 py-2 text-sm text-amber-500"><Plus className="h-3.5 w-3.5" />Add Block</button></div><div className="mt-4 space-y-3">{sidebarBlocks.map((block) => <div key={block.id} className="rounded-lg border border-[#202631] bg-[#0c1017] p-3"><div className="flex gap-2"><input value={block.title} onChange={(event) => setSidebarBlocks((blocks) => blocks.map((item) => item.id === block.id ? { ...item, title: event.target.value } : item))} className="min-w-0 flex-1 border-b border-[#394252] bg-transparent pb-1 text-xs font-semibold text-stone-200" aria-label="Sidebar block title" /><button type="button" onClick={() => setSidebarBlocks((blocks) => blocks.filter((item) => item.id !== block.id))} aria-label={`Delete ${block.title}`}><Trash2 className="h-3.5 w-3.5" /></button></div><textarea value={block.body} onChange={(event) => setSidebarBlocks((blocks) => blocks.map((item) => item.id === block.id ? { ...item, body: event.target.value } : item))} rows={3} className="mt-3 w-full resize-none rounded-md border border-[#202631] bg-[#171d28] p-2.5 text-xs text-stone-300" /></div>)}</div></div></div></main>
        </>}

        {activeTab === "evaluation" && <><div className="mb-6"><StudentContextPanel studentName={selectedStudent?.name || "Selected Student"} profile={workstationState.studentProfile} students={students} selectedStudentToken={selectedStudent.token} onSelectStudent={handleStudentChange} onUpdateProfile={(studentProfile: StudentProfile) => setWorkstationState((previous) => ({ ...previous, studentProfile }))} /></div><section className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-12" aria-label="Student submission review workspace"><div className="space-y-5 lg:col-span-7"><div className="flex justify-between border-b border-[#202631] pb-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Submission Review Workspace</p><h2 className="mt-1 font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">{selectedStudent?.name || "Selected Student"}&apos;s answers</h2><p className="mt-1 text-xs text-amber-300">{workstationState.studentProfile.level}</p></div><span className={`w-fit rounded-sm border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${submissionStateClass}`}>{submissionState}</span></div><div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5"><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Written response</p><p className="rounded-lg border border-[#202631] bg-[#0c1017] p-4 text-sm leading-relaxed text-stone-300">{workstationState.submission?.writingText || "No written response submitted."}</p></div></div><div className="lg:col-span-5 lg:sticky lg:top-6"><SubmissionEvaluator lessonId={newLesson.slug || lessonId} studentName={selectedStudent?.name || "Selected Student"} evaluation={workstationState.evaluation} onUpdateEvaluation={(evaluation: LessonEvaluation) => setWorkstationState((previous) => ({ ...previous, evaluation }))} onSubmitFeedback={async (feedback: FeedbackPayload) => { const evaluation = { ...workstationState.evaluation, scores: feedback.scores, comments: feedback.comments, criterionFeedback: feedback.criterionFeedback, published: true }; setWorkstationState((previous) => ({ ...previous, evaluation })); await saveInstructorFeedback(newLesson.slug || lessonId, selectedStudent.token, evaluation); setPublishStatus("Strengths, study plan, and evaluation synced with student view!"); }} /></div></section></>}
      </div>
      {showPublishConfirmation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal="true" aria-labelledby="publish-confirmation-title"><div className="w-full max-w-md rounded-xl border border-[#394252] bg-[#171d28] p-6"><h2 id="publish-confirmation-title" className="text-lg font-semibold text-stone-100">Publish lesson?</h2><p className="mt-3 text-sm text-stone-400">Are you sure you want to publish this lesson?</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowPublishConfirmation(false)} className="rounded-lg border border-[#394252] px-4 py-2.5 text-xs text-stone-300">Cancel</button><button type="button" onClick={handleConfirmPublish} className="rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-semibold text-[#0c1017]">Confirm &amp; Publish</button></div></div></div>}
    </div>
  );
}