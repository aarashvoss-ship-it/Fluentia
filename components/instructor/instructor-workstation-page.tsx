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
import { saveInstructorFeedback, saveLesson } from "@/services/storage-service";
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
    setDatabaseLessonId(loadedLesson?.id || null);
  }

  async function handleCreateLesson() {
    const student = selectedStudentId ? students.find((item) => item.id === selectedStudentId) : undefined;
    const slug = newLesson.slug.trim().toLowerCase();
    const moduleNumber = Number(newLesson.moduleNumber);

    if (!selectedStudentId || !student || !newLesson.title.trim() || !slug || !Number.isInteger(moduleNumber)) {
      setPublishStatus("Select a student and add a title, valid slug, and module number before creating the lesson.");
      return;
    }

    const lesson: LessonContent = {
      id: `lesson-${slug}`,
      title: newLesson.title.trim(),
      slug,
      studentId: selectedStudentId,
      subtitle: newLesson.subtitle.trim() || "A new Fluentia learning journey.",
      moduleNumber,
      status: newLesson.status,
      coverImage: initialLesson.banner_image_url,
      content: {},
    };

    try {
      await saveLesson(lesson);
      resetNewLessonForm(student.id);
      setPublishStatus(`Lesson "${lesson.title}" saved as ${lesson.status}.`);
      await handleStudentChange(student, slug);
    } catch (error) {
      console.error(error);
      setPublishStatus("Error saving lesson via storage service.");
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
    void supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then(({ count }) => setPendingSubmissionCount(count || 0));
  }, []);

  const setLessonTitle = (title: string) => setNewLesson((previous) => ({ ...previous, title }));
  const setSlug = (slug: string) => setNewLesson((previous) => ({ ...previous, slug }));

  const saveLessonChanges = async (status: "draft" | "published") => {
    const title = newLesson.title.trim() || initialLesson.title;
    const slug = newLesson.slug.trim().toLowerCase() || lessonId;
    const moduleNumber = Number(newLesson.moduleNumber || initialLesson.moduleNumber || 1);
    if (!selectedStudentId || !title || !slug || !Number.isInteger(moduleNumber)) {
      setPublishStatus("Select a student and add a title, valid slug, and module number before saving the lesson.");
      return;
    }
    setIsPublishing(true);
    try {
      const { data, error } = await supabase.from("lessons").upsert({
        student_id: selectedStudentId,
        title,
        slug,
        module_number: moduleNumber,
        status,
        content: workstationState.content,
      }).select("id").single();
      if (error) throw error;
      setDatabaseLessonId(data.id);
      setLessonStatus(status);
      setPublishStatus(`Lesson saved as ${status} and synced with student view.`);
    } catch (error) {
      setPublishStatus(error instanceof Error ? error.message : "Unable to save the lesson.");
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
            <div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5"><p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Submission Status</p><p className="mt-2 text-2xl font-semibold text-stone-100">{submissionState}</p><p className="mt-1 text-xs text-stone-500">{pendingSubmissionCount} pending submissions</p></div>
            <div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5"><p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Lesson State</p><p className="mt-2 text-2xl font-semibold text-stone-100">{lessonStatus}</p><p className="mt-1 text-xs text-stone-500">Content publication status</p></div>
            <div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5"><p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Evaluation</p><p className="mt-2 text-2xl font-semibold text-stone-100">{workstationState.evaluation.published ? "Published" : "Pending"}</p><p className="mt-1 text-xs text-stone-500">Feedback availability</p></div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2"><div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5"><h2 className="font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Pending Submissions</h2><p className="mt-3 text-sm text-stone-400">{pendingSubmissionCount > 0 ? "Submissions are awaiting review." : "No submissions are currently awaiting feedback."}</p></div><div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5"><h2 className="font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Recent Activity</h2><p className="mt-3 text-sm text-stone-400">{selectedStudent.name} is the active student workspace.</p><button type="button" onClick={() => setActiveTab("evaluation")} className="mt-4 text-xs font-semibold text-amber-300 hover:text-amber-200">Review student work</button></div></div>
        </section>}

        {activeTab === "builder" && <>
          <section className="mb-6 rounded-xl border border-[#202631] bg-[#171d28]/60 p-5">
            <div className="mb-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Lesson Library</p><h2 className="mt-1 font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Create / Add New Lesson</h2></div>
            <div className="grid gap-3 md:grid-cols-4"><label className="text-xs text-stone-400">Select Student<select value={selectedStudentId || ""} onChange={(event) => { const nextStudent = students.find((student) => student.id === event.target.value); if (nextStudent) void handleStudentChange(nextStudent); }} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200 [color-scheme:dark]" aria-label="Select student for lesson">{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>{[["title", "Lesson Title", "Business Pitching 101"], ["slug", "Slug", "pitch-01"], ["subtitle", "Subtitle", "Present ideas with clarity"]].map(([field, label, placeholder]) => <label key={field} className="text-xs text-stone-400">{label}<input value={newLesson[field as keyof typeof newLesson]} onChange={(event) => field === "title" ? setLessonTitle(event.target.value) : field === "slug" ? setSlug(event.target.value) : setNewLesson((previous) => ({ ...previous, [field]: event.target.value }))} placeholder={placeholder} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>)}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-4"><label className="text-xs text-stone-400">Module Number<input value={newLesson.moduleNumber} onChange={(event) => setNewLesson((previous) => ({ ...previous, moduleNumber: event.target.value }))} placeholder="3" className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label><label className="text-xs text-stone-400">Visibility<select value={newLesson.status} onChange={(event) => setNewLesson((previous) => ({ ...previous, status: event.target.value as "draft" | "published" }))} className="mt-1 w-full rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200"><option value="draft">Draft</option><option value="published">Published</option></select></label></div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">{[["warmUp", "Warm-up"], ["lessonText", "Lesson Text"], ["lexiconNotes", "Lexicon Notes"], ["prompts", "Prompts"]].map(([field, label]) => <label key={field} className="text-xs text-stone-400">{label}<textarea value={newLesson[field as keyof typeof newLesson]} onChange={(event) => setNewLesson((previous) => ({ ...previous, [field]: event.target.value }))} rows={2} className="mt-1 w-full resize-none rounded-md border border-[#202631] bg-[#0c1017] p-2.5 text-xs text-stone-200" /></label>)}</div>
            <button type="button" onClick={handleCreateLesson} className="mt-4 rounded-md bg-amber-500 px-4 py-2.5 text-xs font-semibold text-[#0c1017] transition hover:bg-amber-400">Create Lesson</button>
          </section>
          <main className="grid grid-cols-1 gap-6 lg:grid-cols-12"><div className="space-y-6 lg:col-span-8"><LessonTailorEditor content={workstationState.content} onChange={(content: StrictStepContent) => setWorkstationState((previous) => ({ ...previous, content }))} /></div><div className="space-y-6 lg:col-span-4"><InstructorBannerManager bannerUrl={workstationState.bannerUrl} customInput={workstationState.customBannerUrl} onUpdateBanner={(bannerUrl: string) => setWorkstationState((previous) => ({ ...previous, bannerUrl }))} onUpdateCustomInput={(customBannerUrl: string) => setWorkstationState((previous) => ({ ...previous, customBannerUrl }))} /><div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5"><div className="flex items-center justify-between"><h3 className="font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">Sidebar Blocks</h3><button type="button" onClick={() => setSidebarBlocks((blocks) => [...blocks, { id: `block-${Date.now()}`, title: "References", body: "" }])} className="flex items-center gap-1.5 rounded-md border border-amber-500 px-3 py-2 text-sm text-amber-500"><Plus className="h-3.5 w-3.5" />Add Block</button></div><div className="mt-4 space-y-3">{sidebarBlocks.map((block) => <div key={block.id} className="rounded-lg border border-[#202631] bg-[#0c1017] p-3"><div className="flex gap-2"><input value={block.title} onChange={(event) => setSidebarBlocks((blocks) => blocks.map((item) => item.id === block.id ? { ...item, title: event.target.value } : item))} className="min-w-0 flex-1 border-b border-[#394252] bg-transparent pb-1 text-xs font-semibold text-stone-200" aria-label="Sidebar block title" /><button type="button" onClick={() => setSidebarBlocks((blocks) => blocks.filter((item) => item.id !== block.id))} aria-label={`Delete ${block.title}`}><Trash2 className="h-3.5 w-3.5" /></button></div><textarea value={block.body} onChange={(event) => setSidebarBlocks((blocks) => blocks.map((item) => item.id === block.id ? { ...item, body: event.target.value } : item))} rows={3} className="mt-3 w-full resize-none rounded-md border border-[#202631] bg-[#171d28] p-2.5 text-xs text-stone-300" /></div>)}</div></div></div></main>
        </>}

        {activeTab === "evaluation" && <><div className="mb-6"><StudentContextPanel studentName={selectedStudent.name} profile={workstationState.studentProfile} students={students} selectedStudentToken={selectedStudent.token} onSelectStudent={handleStudentChange} onUpdateProfile={(studentProfile: StudentProfile) => setWorkstationState((previous) => ({ ...previous, studentProfile }))} /></div><section className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-12" aria-label="Student submission review workspace"><div className="space-y-5 lg:col-span-7"><div className="flex justify-between border-b border-[#202631] pb-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Submission Review Workspace</p><h2 className="mt-1 font-[var(--font-fraunces)] text-xl font-semibold text-stone-100">{selectedStudent.name}&apos;s answers</h2></div><span className={`w-fit rounded-sm border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${submissionStateClass}`}>{submissionState}</span></div><div className="rounded-xl border border-[#202631] bg-[#171d28]/60 p-5"><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Written response</p><p className="rounded-lg border border-[#202631] bg-[#0c1017] p-4 text-sm leading-relaxed text-stone-300">{workstationState.submission?.writingText || "No written response submitted."}</p></div></div><div className="lg:col-span-5 lg:sticky lg:top-6"><SubmissionEvaluator lessonId={lessonId} studentName={selectedStudent.name} evaluation={workstationState.evaluation} onUpdateEvaluation={(evaluation: LessonEvaluation) => setWorkstationState((previous) => ({ ...previous, evaluation }))} onSubmitFeedback={async (feedback: FeedbackPayload) => { const evaluation = { ...workstationState.evaluation, scores: feedback.scores, comments: feedback.comments, criterionFeedback: feedback.criterionFeedback, published: true }; setWorkstationState((previous) => ({ ...previous, evaluation })); await saveInstructorFeedback(lessonId, selectedStudent.token, evaluation); setPublishStatus("Strengths, study plan, and evaluation synced with student view!"); }} /></div></section></>}
      </div>
      {showPublishConfirmation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal="true" aria-labelledby="publish-confirmation-title"><div className="w-full max-w-md rounded-xl border border-[#394252] bg-[#171d28] p-6"><h2 id="publish-confirmation-title" className="text-lg font-semibold text-stone-100">Publish lesson?</h2><p className="mt-3 text-sm text-stone-400">Are you sure you want to publish this lesson?</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowPublishConfirmation(false)} className="rounded-lg border border-[#394252] px-4 py-2.5 text-xs text-stone-300">Cancel</button><button type="button" onClick={handleConfirmPublish} className="rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-semibold text-[#0c1017]">Confirm &amp; Publish</button></div></div></div>}
    </div>
  );
}