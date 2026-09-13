"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { MOCK_INSTRUCTOR_LESSONS } from "@/lib/mock-instructor-data";
import { StudentContextPanel } from "@/components/instructor/student-context-panel";
import { LessonTailorEditor } from "@/components/instructor/lesson-tailor-editor";
import { InstructorBannerManager } from "@/components/instructor/banner-manager";
import { SubmissionEvaluator } from "@/components/instructor/submission-evaluator";
import { LessonContent, LessonEvaluation, StrictStepContent, StudentProfile, StudentSubmission } from "@/types/lesson";
import { INSTRUCTOR_TOKEN, PublishedLessonState } from "@/lib/lesson-store";
import { FeedbackPayload } from "@/components/instructor/submission-evaluator";
import { DEFAULT_STUDENT, STUDENT_USERS, StudentUser } from "@/lib/users";
import { saveInstructorFeedback, saveLesson } from "@/services/storage-service";
import { AccessCard } from "@/components/access/access-card";

interface InstructorWorkstationProps {
  instructorToken: string;
  lessonSlug: string;
  allowStudentQuery?: boolean;
}

export default function InstructorLessonWorkstationPage({ instructorToken, lessonSlug, allowStudentQuery = true }: InstructorWorkstationProps) {
  const lessonId = lessonSlug;

  const initialLesson = MOCK_INSTRUCTOR_LESSONS[lessonId] || MOCK_INSTRUCTOR_LESSONS["habits-01"] || {};
  const [isMounted, setIsMounted] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(DEFAULT_STUDENT);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Explicitly set type to StudentUser[] to resolve "type 'never'" errors
  const [students, setStudents] = useState<StudentUser[]>([])
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
    content: (initialLesson?.content as StrictStepContent) || {},
    bannerUrl: initialLesson?.banner_image_url || "",
    customBannerUrl: "",
    studentProfile: DEFAULT_STUDENT.profile,
    evaluation: {
      scores: { task: 4, coherence: 4, lexical: 3, grammar: 4 },
      comments:
        "Great work on incorporating specific behavioral terms. Focus a bit more on hedging phrases in your introduction.",
      criterionFeedback: {},
      published: false,
    },
    submission: undefined,
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishConfirmation, setShowPublishConfirmation] = useState(false);

  // Explicitly set type to string | null to resolve SetStateAction errors
const [publishStatus, setPublishStatus] = useState<string | null>(null);
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
  const setLessonTitle = (title: string) => setNewLesson((previous) => ({ ...previous, title }));
  const setSlug = (slug: string) => setNewLesson((previous) => ({ ...previous, slug }));
  const resetNewLessonForm = (studentId = "") => setNewLesson({ studentId, title: "", slug: "", subtitle: "", moduleNumber: "", warmUp: "", lessonText: "", lexiconNotes: "", prompts: "", status: "draft" });

  async function handleCreateLesson() {
    const student = selectedStudentId ? students.find((item) => item.id === selectedStudentId) : undefined;
    const slug = newLesson.slug.trim().toLowerCase();
    const moduleNumber = Number(newLesson.moduleNumber);
    if (!selectedStudentId || !student || !newLesson.title.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !Number.isInteger(moduleNumber)) {
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
      coverImage: initialLesson?.banner_image_url || "",
      content: {
        warm_up: {
          intro_narrative: { text: newLesson.warmUp.trim(), enabled: true },
          quote: { text: newLesson.prompts.trim(), enabled: true },
          lexicon_notes: { text: newLesson.lexiconNotes.trim(), enabled: true },
        },
        lesson: {
          core_concept: { text: newLesson.lessonText.trim(), enabled: true },
        },
      },
    };
    await saveLesson(lesson);
    setNewLesson({ studentId: student.id, title: "", slug: "", subtitle: "", moduleNumber: "", warmUp: "", lessonText: "", lexiconNotes: "", prompts: "", status: "draft" });
    setPublishStatus(`Lesson "\({lesson.title}" saved as\){lesson.status}.`);
  }

  useEffect(() => {
    void (async () => {
      setPublishStatus(null);
      if (instructorToken !== INSTRUCTOR_TOKEN) {
        setAccessDenied(true);
        setIsMounted(true);
        return;
      }
      const query = new URLSearchParams(window.location.search);
      const requestedStudentToken = allowStudentQuery ? query.get("student") : null;
      const { data: studentRows, error: studentsError } = await supabase
        .from("students")
        .select("*")
        .eq("is_active", true)
        .order("full_name");
      const databaseStudents: StudentUser[] = studentsError ? [] : (studentRows || []).map((row: any) => ({
        id: row.id,
        token: row.token || row.id,
        name: row.full_name || row.name || row.email || row.id,
        role: "student" as const,
        profile: {
          id: row.id,
          fullName: row.full_name || row.name || row.email || row.id,
          avatarUrl: row.avatar_url || "",
          level: row.level || "B2 Intermediate",
          targetGoal: row.target_goal || "Fluency",
          weaknesses: row.weaknesses || [],
          teacherNotes: row.teacher_notes || "",
          attendanceRate: row.attendance_rate || 0,
          completedModulesCount: row.completed_modules_count || 0,
        },
      }));
      const availableStudents = databaseStudents.length > 0 ? databaseStudents : STUDENT_USERS;
      setStudents(availableStudents);
      const requestedStudent = availableStudents.find((student) => student.id === requestedStudentToken || student.token === requestedStudentToken)
        || availableStudents[0];
      if (!requestedStudent) {
        setIsMounted(true);
        return;
      }
      window.localStorage.setItem("fluentia:active-user", INSTRUCTOR_TOKEN);
      setSelectedStudent(requestedStudent);
      setSelectedStudentId(requestedStudent.id);
      setNewLesson((previous) => ({ ...previous, studentId: requestedStudent.id }));
      setIsMounted(true);
      await handleStudentChange(requestedStudent);
    })();
  }, []);

  useEffect(() => {
    void supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then(({ count }) => setPendingSubmissionCount(count || 0));
  }, []);

  if (!isMounted) {
    return ;
  }

  if (accessDenied) {
    return ;
  }

  async function handleStudentChange(student: StudentUser, requestedLessonSlug = lessonId) {
    setPublishStatus(null);
    const selectedStudentId = student?.id?.trim();
    if (!selectedStudentId) {
      setSelectedStudentId(null);
      resetNewLessonForm();
      return;
    }
    setSelectedStudentId(selectedStudentId);
    const { data: lesson, error } = await supabase
      .from("lessons")
      .select("*")
      .eq("student_id", selectedStudentId)
      .eq("slug", requestedLessonSlug)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== "PGRST116") {
      setPublishStatus("Unable to load this student's lesson from Supabase.");
      return;
    }
    const loadedLesson = Array.isArray(lesson) ? lesson[0] : lesson;
    if (error?.code === "PGRST116" || !loadedLesson) {
      setPublishStatus(null);
      resetNewLessonForm(selectedStudentId);
    }
    const lessonContent = loadedLesson?.content || {};
    const { data: submissions } = loadedLesson
      ? await supabase.from("submissions").select("*").eq("lesson_id", loadedLesson.id).eq("student_id", selectedStudentId).order("updated_at", { ascending: false })
      : { data: [] };
    const submissionRow = submissions?.[0];
    const savedEvaluation = loadedLesson?.evaluation || lessonContent.evaluation;
    const baseContent = lessonContent || initialLesson?.content || {};
    const databaseSubmission = submissionRow?.content as StudentSubmission | undefined;
    setSelectedStudent(student);
    setDatabaseLessonId(loadedLesson?.id || null);
    setNewLesson(loadedLesson
      ? (previous) => ({ ...previous, studentId: student.id })
      : () => ({ studentId: selectedStudentId, title: "", slug: "", subtitle: "", moduleNumber: "", warmUp: "", lessonText: "", lexiconNotes: "", prompts: "", status: "draft" }));
    setWorkstationState({
      content: baseContent,
      bannerUrl: loadedLesson?.banner_url || initialLesson?.banner_image_url || "",
      customBannerUrl: "",
      studentProfile: loadedLesson?.student_profile || student.profile,
      evaluation: savedEvaluation || {
        scores: { task: 4, coherence: 4, lexical: 3, grammar: 4 },
        comments: "Great work on incorporating specific behavioral terms. Focus a bit more on hedging phrases in your introduction.",
        criterionFeedback: {},
        published: false,
      },
      submission: databaseSubmission ? { ...databaseSubmission, status: submissionRow.status || databaseSubmission.status, submittedAt: submissionRow.submitted_at || databaseSubmission.submittedAt } : undefined,
    });
    if (loadedLesson?.status === "draft" || loadedLesson?.status === "published") setLessonStatus(loadedLesson.status);
    window.localStorage.setItem("fluentia:active-student-token", student.token);
    window.localStorage.setItem("fluentia:active-user", INSTRUCTOR_TOKEN);
  }

  const saveLessonChanges = async (status: "draft" | "published") => {
    const lessonTitle = newLesson.title.trim() || initialLesson?.title?.trim() || "Untitled Lesson";
    const lessonSlug = newLesson.slug.trim().toLowerCase() || lessonId.trim().toLowerCase() || `lesson-${Date.now()}`;
    const moduleNumber = Number(newLesson.moduleNumber || initialLesson?.moduleNumber) || 1;
    const isPublish = status === "published";
    if (!selectedStudentId || !lessonTitle || !lessonSlug || !Number.isInteger(moduleNumber)) {
      setPublishStatus("Select a student and add a title, valid slug, and module number before saving the lesson.");
      return;
    }
    setIsPublishing(true);
    setPublishStatus(null);
    setLessonStatus(status);
    const contentBlocks = Object.values(workstationState.content || {}).flatMap((stepContent: any) =>
      Array.isArray(stepContent?.blocks) ? stepContent.blocks : []
    );
    const warmUp = newLesson.warmUp || "";
    const lessonText = newLesson.lessonText || "";
    const quote = newLesson.prompts || "";
    const blocks = contentBlocks || [];
    try {
      const { data, error } = await supabase.from("lessons").upsert({
        student_id: selectedStudentId,
        title: lessonTitle,
        slug: lessonSlug,
        module_number: Number(moduleNumber) || 1,
        status: isPublish ? "published" : "draft",
        warm_up: warmUp,
        lesson_text: lessonText,
        quote,
        blocks,
      }).select("id").single();
      if (error) {
        console.log(error.message);
        setIsPublishing(false);
        setPublishStatus(error.message || null);
        return;
      }
      setDatabaseLessonId(data.id);
      setLessonStatus(isPublish ? "published" : "draft");
      setNewLesson((previous) => ({
        ...previous,
        studentId: selectedStudentId,
        title: lessonTitle,
        slug: lessonSlug,
        moduleNumber: String(moduleNumber),
        status: isPublish ? "published" : "draft",
      }));
      const savedStudent = students.find((student) => student.id === selectedStudentId);
      if (savedStudent) await handleStudentChange(savedStudent, lessonSlug);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(message);
      setIsPublishing(false);
      setPublishStatus(message || null);
      return;
    }

    setTimeout(() => {
      setIsPublishing(false);
      setPublishStatus(`Lesson saved as ${status} and synced with student view.`);
      setTimeout(() => setPublishStatus(null), 4000);
    }, 800);
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

;
}