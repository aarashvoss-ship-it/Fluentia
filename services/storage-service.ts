import {
  LessonContent,
  LessonEvaluation,
  StudentProfile,
  StudentSubmission,
  SavedVocabularyWord,
  StudentNote,
  ChatMessage,
  StudyStepId,
  StrictStepContent,
} from "@/types/lesson";
import { PublishedLessonState, getLessonStateKey } from "@/lib/lesson-store";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { resolveUserUuid } from "@/lib/identity";

export type LessonStatus = "draft" | "published";
export type SubmissionStatus = "not_started" | "in_progress" | "submitted" | "pending_evaluation" | "reviewed" | "evaluated";
type LessonStateMode = "interactive" | "review" | "summary";

const STUDY_STEP_IDS: readonly string[] = ["warm_up", "lesson", "listening", "reading", "writing", "speaking", "results"];

function isStudyStepId(value: unknown): value is StudyStepId {
  return typeof value === "string" && STUDY_STEP_IDS.includes(value);
}

const SUBMISSION_STATUS_FALLBACKS: Record<SubmissionStatus, string[]> = {
  not_started: ["draft", "not_started", "in_progress", "submitted", "pending_evaluation", "completed"],
  in_progress: ["draft", "in_progress", "not_started", "submitted", "pending_evaluation", "completed"],
  submitted: ["submitted", "pending_evaluation", "completed"],
  pending_evaluation: ["submitted", "pending_evaluation", "completed"],
  reviewed: ["reviewed", "completed"],
  evaluated: ["evaluated", "reviewed", "completed"],
};

async function writeSubmissionWithStatusFallback(
  status: SubmissionStatus,
  write: (status: string) => PromiseLike<{ error: { code?: string } | null }>,
) {
  let constraintError: { code?: string } | null = null;
  for (const candidate of SUBMISSION_STATUS_FALLBACKS[status]) {
    const { error } = await write(candidate);
    if (!error) return candidate;
    if (error.code !== "23514") throw error;
    constraintError = error;
  }
  throw constraintError || new Error(`No database-compatible status found for ${status}.`);
}

function normalizeSubmissionStatus(value: unknown, fallback: SubmissionStatus = "in_progress"): SubmissionStatus {
  if (value === "draft") return "in_progress";
  if (value === "completed") return "pending_evaluation";
  return value === "not_started" || value === "in_progress" || value === "submitted" || value === "pending_evaluation" || value === "reviewed" || value === "evaluated"
    ? value
    : fallback;
}

function removeUndefinedValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeUndefinedValues);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, removeUndefinedValues(entry)]),
  );
}

function removeTemporaryBlobUrls(value: unknown): unknown {
  if (typeof value === "string") return /^blob:/i.test(value.trim()) ? undefined : value;
  if (Array.isArray(value)) return value.map(removeTemporaryBlobUrls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, removeTemporaryBlobUrls(entry)] as const)
      .filter(([, entry]) => entry !== undefined),
  );
}

function isPersistentMediaUrl(value: string) {
  if (/^data:audio\/[\w.+-]+(?:;[^,]*)?,/i.test(value)) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to encode audio fallback."));
    reader.onerror = () => reject(reader.error || new Error("Unable to encode audio fallback."));
    reader.readAsDataURL(blob);
  });
}

function logSubmissionPayload(kind: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[Submission ${kind}] payload`, JSON.stringify(payload));
  }
}

export interface StudentProgressRecord {
  currentStep: StudyStepId;
  completedSteps: StudyStepId[];
  completed?: boolean;
  status: SubmissionStatus;
  updatedAt: string;
}

export interface StorageMediaAsset {
  bucket: "audio-submissions" | "student-resources" | "lesson-audio" | "lesson-media" | "lesson-assets" | "voice-feedback";
  name: string;
  url: string;
  size?: number;
  type?: string;
}

export const LESSONS_MANIFEST_KEY = "fluentia:lessons-manifest";
const PROGRESS_PREFIX = "fluentia:progress:";
const VOCAB_PREFIX = "fluentia:vocab:";
const NOTES_PREFIX = "fluentia:notes:";
const CHAT_PREFIX = "fluentia:chat:";
const THEME_PREFIX = "fluentia:theme:";
export const FLUENTIA_DATA_UPDATED_EVENT = "fluentia:data-updated";
const FLUENTIA_DATA_UPDATED_STORAGE_KEY = "fluentia:data-updated";
const demoDataEnabled = () => process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA === "true";

function notifyDataUpdated(detail: { type: string; slug?: string; studentToken?: string }) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FLUENTIA_DATA_UPDATED_EVENT, { detail }));
    try {
      window.localStorage.setItem(
        FLUENTIA_DATA_UPDATED_STORAGE_KEY,
        JSON.stringify({ ...detail, updatedAt: Date.now() }),
      );
    } catch (error) {
      console.warn("Unable to broadcast Fluentia data update to other tabs:", error);
    }
  }
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : null;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function studentScopeKey(studentId?: string) {
  return studentId || "anonymous";
}

function progressKey(slug: string, studentId?: string) {
  return `${PROGRESS_PREFIX}${slug}:${studentScopeKey(studentId)}`;
}

function scopedKey(prefix: string, studentId?: string) {
  return `${prefix}${studentScopeKey(studentId)}`;
}

function readManifest() {
  return readJson<LessonContent[]>(LESSONS_MANIFEST_KEY) || [];
}

function writeManifest(lessons: LessonContent[]) {
  writeJson(LESSONS_MANIFEST_KEY, lessons);
}

function readInstructorLessons() {
  return readJson<LessonContent[]>("fluentia:instructor-lessons") || [];
}

function getState(slug: string, studentToken?: string): PublishedLessonState | null {
  return readJson<PublishedLessonState>(getLessonStateKey(slug, studentToken));
}

function emptyEvaluation(): LessonEvaluation {
  return {
    scores: { task: 0, coherence: 0, lexical: 0, grammar: 0 },
    comments: "",
    criterionFeedback: {},
    published: false,
  };
}

function defaultProfile(): StudentProfile {
  return {
    fullName: "Student",
    level: "B1 Intermediate",
    targetGoal: "Fluency",
    weaknesses: [],
    teacherNotes: "",
    attendanceRate: 0,
    completedModulesCount: 0,
  };
}

function defaultContent(): StrictStepContent {
  return {};
}

type SupabaseRow = Record<string, any>;
function isMissingSchemaObject(error: { code?: string; message?: string; status?: number } | null) {
  if (!error) return false;
  return error.status === 404
    || error.code === "42P01"
    || error.code === "42703"
    || error.code === "PGRST204"
    || error.code === "PGRST205"
    || /does not exist|could not find the table|schema cache/i.test(error.message || "");
}

function mapFeedbackRow(feedback: SupabaseRow | null): LessonEvaluation {
  const scores = feedback?.rubric_scores || {};
  const criterionFeedback = feedback?.criterion_feedback || {};
  return {
    scores,
    totalScore: Number(feedback?.total_score ?? Object.values(scores).reduce<number>((total, score) => total + Number(score), 0)),
    comments: typeof criterionFeedback.overallComments === "string"
      ? criterionFeedback.overallComments
      : feedback?.comments || "",
    criterionFeedback: criterionFeedback.comments || criterionFeedback,
    stageFeedback: criterionFeedback.stages || {},
    stageScores: criterionFeedback.stageScores || {},
    stageRubricScales: criterionFeedback.stageRubricScales || {},
    reportCardScoreOverrides: criterionFeedback.reportCardScoreOverrides || {},
    taskFeedback: criterionFeedback.taskFeedback || {},
    inlineCorrections: criterionFeedback.inlineCorrections || {},
    stageVoiceFeedback: criterionFeedback.stageVoiceFeedback || {},
    strengths: feedback?.strengths || undefined,
    areasToImprove: feedback?.areas_to_improve || undefined,
    studyHubPrescription: feedback?.study_hub_prescription || undefined,
    voiceFeedbackUrl: feedback?.voice_feedback_url || undefined,
    published: Boolean(feedback?.is_published),
  };
}

function toStorageError(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const details = error as { message?: string; details?: string; hint?: string; code?: string };
    const message = [details.message, details.details, details.hint].filter(Boolean).join(" | ") || fallback;
    const normalized = new Error(message);
    if (details.code) normalized.name = details.code;
    return normalized;
  }
  return new Error(error instanceof Error ? error.message : fallback);
}

async function getStudentId(_legacyIdentifier?: string) {
  if (!isSupabaseConfigured()) return null;
  try {
    return await resolveUserUuid();
  } catch {
    return null;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the canonical Supabase student UUID for the current request.
 * Identity is strictly auth.uid()-derived (see PROJECT_CONTEXT); an explicit
 * studentId argument is only honoured when it is a valid UUID.
 */
async function resolveStudentId(explicitStudentId?: string): Promise<string | null> {
  const authenticatedStudentId = await getStudentId();
  if (authenticatedStudentId) return authenticatedStudentId;
  if (explicitStudentId && UUID_PATTERN.test(explicitStudentId.trim())) return explicitStudentId.trim();
  return null;
}

async function fetchStudentLesson(slug: string, explicitStudentId?: string) {
  const studentId = await resolveStudentId(explicitStudentId);
  if (!studentId) return null;

  const slugIsUuid = UUID_PATTERN.test(slug);

  if (slugIsUuid) {
    const directLessonById = await supabase
      .from("lessons")
      .select("*")
      .eq("id", slug)
      .eq("student_id", studentId)
      .maybeSingle();
    if (!directLessonById.error && directLessonById.data) return directLessonById.data;
  }

  const directLessonBySlug = await supabase
    .from("lessons")
    .select("*")
    .eq("slug", slug)
    .eq("student_id", studentId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!directLessonBySlug.error && directLessonBySlug.data) return directLessonBySlug.data;

  const { data: assignments, error: assignmentError } = await supabase
    .from("lesson_assignments")
    .select("lesson_id")
    .eq("student_id", studentId)
    .eq("status", "assigned");

  if (!assignmentError && assignments?.length) {
    const assignedLessonIds = assignments.map((assignment) => assignment.lesson_id).filter(Boolean);
    if (assignedLessonIds.length > 0) {
      const assignedLessonBySlug = await supabase
        .from("lessons")
        .select("*")
        .in("id", assignedLessonIds)
        .eq("slug", slug)
        .maybeSingle();
      if (!assignedLessonBySlug.error && assignedLessonBySlug.data) return assignedLessonBySlug.data;

      if (slugIsUuid) {
        const assignedLessonById = await supabase
          .from("lessons")
          .select("*")
          .in("id", assignedLessonIds)
          .eq("id", slug)
          .maybeSingle();
        if (!assignedLessonById.error && assignedLessonById.data) return assignedLessonById.data;
      }
    }
  }

  return null;
}

function mapLessonRow(row: SupabaseRow): LessonContent {
  return {
    id: String(row.id),
    slug: row.slug || String(row.id),
    title: row.title || "Untitled lesson",
    studentId: row.student_id || undefined,
    subtitle: row.subtitle || undefined,
    moduleNumber: row.module_number || row.moduleNumber || 1,
    coverImage: row.banner_url || row.cover_image || undefined,
    ambientMusicUrl: row.ambient_music_url || undefined,
    instructor: row.instructor || undefined,
    status: row.status === "draft" ? "draft" : "published",
    content: row.content || undefined,
  };
}

function mapSubmission(row: SupabaseRow): StudentSubmission {
  const content = row.answers || row.content || {};
  return {
    ...content,
    status: normalizeSubmissionStatus(content.status || row.status),
    listeningAnswers: content.listeningAnswers || {},
    readingAnswers: content.readingAnswers || {},
    writingText: content.writingText || "",
    writing_responses: content.writing_responses || {},
    speakingAudioUrl: row.audio_url || content.speakingAudioUrl,
    blockResponses: content.blockResponses || {},
    quizSelections: content.quizSelections || {},
    audioUploads: content.audioUploads || {},
    submittedAt: row.submitted_at || content.submittedAt,
  };
}

export async function fetchLesson(slug: string): Promise<LessonContent | null> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.from("lessons").select("*").eq("slug", slug).maybeSingle();
      if (!error && data) return mapLessonRow(data);
    } catch {
      // Use the local manifest when Supabase is unavailable.
    }
  }
  return null;
}

export async function fetchLessons(): Promise<LessonContent[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.from("lessons").select("*").neq("status", "draft").order("created_at", { ascending: false });
      if (!error && data) {
        const databaseLessons = data.map(mapLessonRow);
        return databaseLessons;
      }
    } catch {
      // Use the local manifest when Supabase is unavailable.
    }
  }
  return [];
}

export async function saveLesson(lesson: LessonContent): Promise<void> {
  let persistenceError: unknown;
  if (isSupabaseConfigured()) {
    try {
      const resolvedStudentId = lesson.studentId || null;
      const payload = {
        id: String(lesson.id),
        slug: String(lesson.slug),
        student_id: resolvedStudentId,
        title: String(lesson.title || "Untitled Lesson"),
        subtitle: lesson.subtitle?.trim() || null,
        module_number: Number.isFinite(lesson.moduleNumber) ? lesson.moduleNumber : 1,
        banner_url: lesson.coverImage || null,
        status: lesson.status === "published" ? "published" : "draft",
        content: lesson.content && typeof lesson.content === "object" ? lesson.content : {},
      };
      const { error } = await supabase.from("lessons").upsert(payload);
      if (!error) {
        notifyDataUpdated({ type: "lesson", slug: lesson.slug, studentToken: lesson.studentId });
        return;
      }
      persistenceError = error;
    } catch (error) {
      persistenceError = error;
    }
  }
  if (isSupabaseConfigured() && !demoDataEnabled()) {
    throw persistenceError || new Error("Unable to save lesson to Supabase");
  }
  const lessons = readManifest().filter((item) => item.slug !== lesson.slug);
  writeManifest([...lessons, lesson]);
  notifyDataUpdated({ type: "lesson", slug: lesson.slug, studentToken: lesson.studentId });
  if (persistenceError) throw persistenceError;
}

export async function updateLessonStatus(slug: string, status: LessonStatus): Promise<LessonContent | null> {
  const lesson = await fetchLesson(slug);
  if (!lesson) return null;
  const updated = { ...lesson, status };
  await saveLesson(updated);
  return updated;
}

/**
 * Interactive loads expose only the current draft; review loads include answers,
 * while summary loads return progress metadata without answer contents.
 */
export async function fetchLessonState(
  slug: string,
  studentToken?: string,
  mode: LessonStateMode = "interactive",
  submissionId?: string,
): Promise<PublishedLessonState | null> {
  if (isSupabaseConfigured()) {
    let authenticatedStudentId: string | null = null;
    try {
      authenticatedStudentId = await getStudentId();
      if (!authenticatedStudentId) return null;
      const lesson = await fetchStudentLesson(slug, authenticatedStudentId);
      if (lesson) {
        const lessonId = typeof lesson.id === "string" ? lesson.id.trim() : "";
        if (UUID_PATTERN.test(lessonId) && UUID_PATTERN.test(authenticatedStudentId)) {
          let submission = null;
          let feedback = null;
          try {
            if (mode === "review") {
              let scopedSubmissionId = submissionId;
              if (!scopedSubmissionId) {
                const latest = await supabase
                  .from("submissions")
                  .select("id")
                  .eq("lesson_id", lessonId)
                  .eq("student_id", authenticatedStudentId)
                  .order("submitted_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (latest.error) throw latest.error;
                scopedSubmissionId = latest.data?.id;
              }
              if (scopedSubmissionId) {
                const result = await supabase
                  .from("submissions")
                  .select("id,answers,status,submitted_at")
                  .eq("id", scopedSubmissionId)
                  .eq("lesson_id", lessonId)
                  .eq("student_id", authenticatedStudentId)
                  .maybeSingle();
                if (result.error) throw result.error;
                submission = result.data;
              }
            } else {
              const result = await supabase
                .from("submissions")
                .select("id,status,submitted_at")
                .eq("lesson_id", lessonId)
                .eq("student_id", authenticatedStudentId)
                .order("submitted_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (result.error) throw result.error;
              submission = result.data;
            }
          } catch (error) {
            console.error("[Dashboard Progress] Submission fetch threw an error:", { lessonId, studentId: authenticatedStudentId, submissionId, mode, error });
          }
          if (mode !== "interactive") {
            try {
              const result = await supabase
                .from("instructor_feedback")
                .select("*")
                .eq("lesson_id", lessonId)
                .eq("student_id", authenticatedStudentId)
                .eq("is_published", true)
                .limit(1)
                .maybeSingle();
              if (!result.error) feedback = result.data;
              else if (!isMissingSchemaObject(result.error) && result.error.code !== "PGRST116") {
                console.warn("[Dashboard Progress] Instructor feedback is unavailable:", result.error.message);
              }
            } catch {
              feedback = null;
            }
          }
          return {
            content: lesson.content || defaultContent(),
            bannerUrl: lesson.coverImage || "",
            studentProfile: defaultProfile(),
            evaluation: feedback ? mapFeedbackRow(feedback) : emptyEvaluation(),
            status: lesson.status === "draft" ? "draft" : "published",
            submission: submission ? mapSubmission(submission) : undefined,
          };
        }
      }
      return getStateForMode(slug, authenticatedStudentId, mode);
    } catch (error) {
      console.error("[Dashboard Progress] Failed to fetch lesson state:", { slug, studentToken, error });
      // Use local state when Supabase is unavailable or the lesson has no saved state yet.
      return authenticatedStudentId ? getStateForMode(slug, authenticatedStudentId, mode) : null;
    }
  }
  return getStateForMode(slug, studentToken, mode);
}

function getStateForMode(slug: string, studentToken: string | undefined, mode: LessonStateMode) {
  const state = getState(slug, studentToken);
  if (!state) return state;
  const studentState = {
    ...state,
    evaluation: state.evaluation?.published ? state.evaluation : emptyEvaluation(),
  };
  if (mode === "review") return studentState;
  const submission = studentState.submission;
  if (!submission) return studentState;
  return {
    ...studentState,
    submission: {
      status: submission.status,
      listeningAnswers: {},
      readingAnswers: {},
      writingText: "",
      writing_responses: {},
      blockResponses: {},
      quizSelections: {},
      audioUploads: {},
    },
  };
}

export async function fetchStudentProgress(slug: string, studentToken?: string): Promise<StudentProgressRecord> {
  if (isSupabaseConfigured()) {
    try {
      const studentId = await getStudentId();
      const lesson = studentId ? await fetchStudentLesson(slug, studentId) : null;
      if (lesson && studentId) { // has lesson + student -> save to Supabase
        const { data, error } = await supabase.from("submissions").select("status,submitted_at,progress:answers->progress").eq("lesson_id", lesson.id).eq("student_id", studentId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        const progress = data?.progress;
        if (progress && typeof progress === "object" && !Array.isArray(progress)) {
          return {
            currentStep: isStudyStepId(progress.currentStep) ? progress.currentStep : "warm_up",
            completedSteps: Array.isArray(progress.completedSteps) ? progress.completedSteps.filter(isStudyStepId) : [],
            completed: progress.completed === true,
            status: normalizeSubmissionStatus(progress.status || data?.status, "not_started"),
            updatedAt: data?.submitted_at || new Date(0).toISOString(),
          };
        }
      }
    } catch (error) {
      console.error("[Dashboard Progress] Failed to fetch student progress:", { slug, studentToken, error });
      // Progress reads are optional; return the default state when the query fails.
    }
  }
  if (isSupabaseConfigured() && !demoDataEnabled()) return {
    currentStep: "warm_up",
    completedSteps: [],
    completed: false,
    status: "not_started",
    updatedAt: new Date(0).toISOString(),
  };
  return readJson<StudentProgressRecord>(progressKey(slug, studentToken)) || {
    currentStep: "warm_up",
    completedSteps: [],
    completed: false,
    status: "not_started",
    updatedAt: new Date(0).toISOString(),
  };
}

export async function saveStudentProgress(
  slug: string,
  progress: StudentProgressRecord,
  studentToken?: string
): Promise<StudentProgressRecord> {
  const updated = {
    ...progress,
    completed: progress.completed ?? (progress.status === "submitted" || progress.status === "pending_evaluation" || progress.status === "reviewed" || progress.status === "evaluated"),
    updatedAt: new Date().toISOString(),
  };
  if (isSupabaseConfigured()) {
    try {
      const studentId = await getStudentId();
      const lesson = studentId ? await fetchStudentLesson(slug, studentId) : null;
      if (lesson && studentId) {
        const { data: existingSubmission, error: lookupError } = await supabase.from("submissions").select("id,answers").eq("lesson_id", lesson.id).eq("student_id", studentId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
        if (lookupError) throw lookupError;
        const answers = removeUndefinedValues({ ...(existingSubmission?.answers || {}), progress: { currentStep: updated.currentStep, completedSteps: updated.completedSteps, completed: updated.completed, status: updated.status } });
        await writeSubmissionWithStatusFallback(updated.status, (databaseStatus) => {
          const payload = removeUndefinedValues({ lesson_id: lesson.id, student_id: studentId, answers, status: databaseStatus, submitted_at: updated.updatedAt }) as Record<string, unknown>;
          logSubmissionPayload("progress", payload);
          return existingSubmission
            ? supabase.from("submissions").update(payload).eq("id", existingSubmission.id)
            : supabase.from("submissions").insert(payload);
        });
        notifyDataUpdated({ type: "progress", slug, studentToken });
        return updated;
      }
      console.error("[Dashboard Progress] Could not resolve a Supabase lesson/student for progress save:", { slug, studentToken });
    } catch (error) {
      console.error("[Dashboard Progress] Failed to save student progress:", { slug, studentToken, error });
      // Keep local progress as an offline fallback.
    }
  }
  writeJson(progressKey(slug, studentToken), updated);
  notifyDataUpdated({ type: "progress", slug, studentToken });
  return updated;
}

export async function saveLessonState(
  slug: string,
  state: PublishedLessonState,
  studentToken?: string
): Promise<PublishedLessonState> {
  // Graceful fallback: always persist locally to avoid red screen during step navigation
  writeJson(getLessonStateKey(slug, studentToken), state);
  notifyDataUpdated({ type: "lesson-state", slug, studentToken });
  return state;
}

async function persistStudentSubmission(
  slug: string,
  studentToken: string | undefined,
  submission: StudentSubmission,
  progress?: Partial<StudentProgressRecord>
): Promise<PublishedLessonState> {
  const persistableSubmission = removeTemporaryBlobUrls(submission) as StudentSubmission;
  const authenticatedStudentId = await getStudentId();
  if (isSupabaseConfigured() && !authenticatedStudentId) {
    throw new Error("An authenticated student session is required to save lesson answers.");
  }
  const studentScope = authenticatedStudentId || studentToken;
  const current = await fetchLessonState(slug, studentScope);
  const nextState: PublishedLessonState = {
    content: current?.content || defaultContent(),
    bannerUrl: current?.bannerUrl || "",
    studentProfile: current?.studentProfile || defaultProfile(),
    evaluation: current?.evaluation || emptyEvaluation(),
    status: current?.status || "published",
    submission: persistableSubmission,
  };
  await saveLessonState(slug, nextState, studentScope);
  if (isSupabaseConfigured()) {
    try {
      const lesson = await fetchStudentLesson(slug, studentScope);
      const studentId = authenticatedStudentId;
      if (lesson && studentId) {
        const { data: existingSubmission, error: lookupError } = await supabase.from("submissions").select("id").eq("lesson_id", lesson.id).eq("student_id", studentId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
        if (lookupError) throw lookupError;
        const answers = removeUndefinedValues(progress
            ? {
              ...persistableSubmission,
              progress: {
                currentStep: progress.currentStep || "warm_up",
                completedSteps: progress.completedSteps || [],
                completed: progress.completed ?? (persistableSubmission.status === "submitted" || persistableSubmission.status === "pending_evaluation" || persistableSubmission.status === "reviewed" || persistableSubmission.status === "evaluated"),
                status: progress.status || normalizeSubmissionStatus(persistableSubmission.status),
              },
            }
          : persistableSubmission);
        const submittedAt = persistableSubmission.submittedAt || new Date().toISOString();
        await writeSubmissionWithStatusFallback(normalizeSubmissionStatus(persistableSubmission.status), (databaseStatus) => {
          const submissionPayload = removeUndefinedValues({
            lesson_id: lesson.id,
            student_id: studentId,
            answers,
            status: databaseStatus,
            submitted_at: submittedAt,
          }) as Record<string, unknown>;
          logSubmissionPayload(persistableSubmission.status === "pending_evaluation" ? "final" : "autosave", submissionPayload);
          return existingSubmission
            ? supabase.from("submissions").update(submissionPayload).eq("id", existingSubmission.id)
            : supabase.from("submissions").insert(submissionPayload);
        });
        notifyDataUpdated({ type: "submission", slug, studentToken: studentScope });
        return nextState;
      }
      if (!demoDataEnabled()) {
        throw new Error(`Unable to resolve the Supabase lesson or student for submission ${slug}.`);
      }
    } catch (error) {
      if (submission.status === "in_progress") {
        if (process.env.NODE_ENV === "development") {
          console.warn("[Lesson Autosave] Supabase draft save failed:", { slug, error });
        }
      } else {
        console.error("[Lesson Submission] Supabase final save failed:", { slug, studentToken, error });
      }
      if (!demoDataEnabled()) throw toStorageError(error, `Unable to save submission for ${slug}`);
    }
  }
    // Supabase lesson not found — fall through to local save instead of throwing
  await saveLessonState(slug, nextState, studentScope);
  if (progress) {
    await saveStudentProgress(slug, {
      currentStep: progress.currentStep || "warm_up",
      completedSteps: progress.completedSteps || [],
      completed: progress.completed ?? (submission.status === "submitted" || submission.status === "pending_evaluation" || submission.status === "reviewed" || submission.status === "evaluated"),
      status: progress.status || (submission.status === "evaluated" ? "evaluated" : submission.status === "reviewed" ? "reviewed" : submission.status === "pending_evaluation" ? "pending_evaluation" : submission.status === "submitted" ? "submitted" : "in_progress"),
      updatedAt: new Date().toISOString(),
    }, studentScope);
  }
  notifyDataUpdated({ type: "submission", slug, studentToken: studentScope });
  return nextState;
}

export function saveStudentSubmissionDraft(
  slug: string,
  studentToken: string | undefined,
  submission: StudentSubmission,
  progress?: Partial<StudentProgressRecord>,
): Promise<PublishedLessonState> {
  return persistStudentSubmission(slug, studentToken, { ...submission, status: "in_progress" }, {
    ...progress,
    status: "in_progress",
  });
}

export function submitStudentLesson(
  slug: string,
  studentToken: string | undefined,
  submission: StudentSubmission,
  progress?: Partial<StudentProgressRecord>,
): Promise<PublishedLessonState> {
  return persistStudentSubmission(slug, studentToken, submission, progress);
}

export async function saveInstructorFeedback(
  slug: string,
  studentToken: string | undefined,
  evaluation: LessonEvaluation,
  submissionId?: string,
  isPublished = true,
): Promise<PublishedLessonState> {
  const completedSteps: StudyStepId[] = ["warm_up", "lesson", "listening", "reading", "writing", "speaking", "results"];
  const evaluatedAt = new Date().toISOString();
  const totalScore = Object.values(evaluation.scores).reduce<number>((total, score) => total + Number(score), 0);
  const savedEvaluation = { ...evaluation, totalScore, published: isPublished };
  if (isSupabaseConfigured()) {
    const studentId = studentToken?.trim() || "";
    if (!UUID_PATTERN.test(studentId)) throw new Error("A valid selected student ID is required to save this evaluation.");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData.user) throw new Error("An authenticated instructor is required to save this evaluation.");
    const authenticatedInstructorId = authData.user.id;
    if (!UUID_PATTERN.test(authenticatedInstructorId)) {
      throw new Error("The authenticated instructor ID is not a valid UUID.");
    }

    let lessonQuery = supabase.from("lessons").select("id,content,banner_url,status,instructor_id");
    lessonQuery = UUID_PATTERN.test(slug)
      ? lessonQuery.eq("id", slug)
      : lessonQuery.eq("slug", slug);
    const { data: lesson, error: lessonError } = await lessonQuery.maybeSingle();
    if (lessonError) throw lessonError;
    if (!lesson) throw new Error(`Lesson ${slug} could not be found for evaluation.`);
    if (String(lesson.instructor_id) !== authenticatedInstructorId) {
      throw new Error("The signed-in user is not the instructor assigned to this lesson.");
    }

    let submissionQuery = supabase
      .from("submissions")
      .select("id,answers,submitted_at,status")
      .eq("lesson_id", lesson.id)
      .eq("student_id", studentId);
    if (submissionId) {
      submissionQuery = submissionQuery.eq("id", submissionId);
    } else {
      submissionQuery = submissionQuery.order("submitted_at", { ascending: false }).limit(1);
    }
    const { data: existingSubmission, error: submissionError } = await submissionQuery.maybeSingle();
    if (submissionError) throw submissionError;
    if (!existingSubmission) throw new Error("No submission exists for this student and lesson.");

    const answers = isPublished
      ? removeUndefinedValues({
        ...(existingSubmission.answers || {}),
        status: "evaluated",
        progress: { currentStep: "results", completedSteps, completed: true, status: "evaluated" },
      }) as Record<string, unknown>
      : existingSubmission.answers || {};
    const rubricFeedback = {
      comments: savedEvaluation.criterionFeedback || {},
      overallComments: savedEvaluation.comments,
      stages: savedEvaluation.stageFeedback || {},
      stageScores: savedEvaluation.stageScores || {},
      stageRubricScales: savedEvaluation.stageRubricScales || {},
      reportCardScoreOverrides: savedEvaluation.reportCardScoreOverrides || {},
      taskFeedback: savedEvaluation.taskFeedback || {},
      inlineCorrections: savedEvaluation.inlineCorrections || {},
      stageVoiceFeedback: savedEvaluation.stageVoiceFeedback || {},
    };
    const { error: feedbackError } = isPublished
      ? await supabase.from("instructor_feedback").upsert({
        lesson_id: lesson.id,
        student_id: studentId,
        instructor_id: authenticatedInstructorId,
        rubric_scores: savedEvaluation.scores,
        total_score: savedEvaluation.totalScore,
        criterion_feedback: rubricFeedback,
        strengths: savedEvaluation.strengths,
        areas_to_improve: savedEvaluation.areasToImprove,
        study_hub_prescription: savedEvaluation.studyHubPrescription,
        voice_feedback_url: savedEvaluation.voiceFeedbackUrl,
        is_published: true,
        updated_at: evaluatedAt,
      }, { onConflict: "lesson_id,student_id" })
      : await supabase.from("instructor_evaluation_drafts").upsert({
        submission_id: existingSubmission.id,
        lesson_id: lesson.id,
        student_id: studentId,
        instructor_id: authenticatedInstructorId,
        evaluation: savedEvaluation,
        updated_at: evaluatedAt,
      }, { onConflict: "submission_id" });
    if (feedbackError) throw feedbackError;

    if (isPublished) {
      const { error: statusError } = await supabase
        .from("submissions")
        .update({ status: "evaluated", answers })
        .eq("id", existingSubmission.id)
        .eq("lesson_id", lesson.id)
        .eq("student_id", studentId);
      if (statusError) throw statusError;
    }
    if (isPublished) {
      const { error: draftError } = await supabase
        .from("instructor_evaluation_drafts")
        .delete()
        .eq("submission_id", existingSubmission.id)
        .eq("instructor_id", authenticatedInstructorId);
      if (draftError) throw draftError;
    }

    const current = getState(slug, studentId);
    const nextState: PublishedLessonState = {
      content: current?.content || lesson.content || defaultContent(),
      bannerUrl: current?.bannerUrl || lesson.banner_url || "",
      studentProfile: current?.studentProfile || defaultProfile(),
      evaluation: savedEvaluation,
      status: lesson.status === "draft" ? "draft" : "published",
      submission: mapSubmission({
        answers,
        status: isPublished ? "evaluated" : existingSubmission.status,
        submitted_at: existingSubmission.submitted_at,
      }),
    };
    if (isPublished) {
      await saveLessonState(slug, nextState, studentId);
      notifyDataUpdated({ type: "feedback", slug, studentToken: studentId });
    }
    return nextState;
  }

  const current = getState(slug, studentToken);
  const nextState: PublishedLessonState = {
    content: current?.content || defaultContent(),
    bannerUrl: current?.bannerUrl || "",
    studentProfile: current?.studentProfile || defaultProfile(),
    evaluation: savedEvaluation,
    status: current?.status || "published",
    submission: current?.submission
      ? { ...current.submission, status: isPublished ? "evaluated" : current.submission.status }
      : undefined,
  };
  if (isPublished) {
    await saveLessonState(slug, nextState, studentToken);
  }
  if (isPublished) {
    await saveStudentProgress(slug, {
      currentStep: "results",
      completedSteps,
      status: "evaluated",
      updatedAt: evaluatedAt,
    }, studentToken);
  }
  if (isPublished) {
    notifyDataUpdated({ type: "feedback", slug, studentToken });
  }
  return nextState;
}

export async function prepareMediaUrl(
  input: string | Blob,
  bucket: StorageMediaAsset["bucket"],
  name = `media-${Date.now()}`
): Promise<StorageMediaAsset> {
  if (typeof input !== "string" && isSupabaseConfigured()) {
    try {
      const path = `${Date.now()}-${name}`;
      const { error } = await supabase.storage.from(bucket).upload(path, input, { upsert: true, contentType: input.type || undefined });
      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return { bucket, name: path, url: data.publicUrl, size: input.size, type: input.type };
      }
      throw error || new Error(`Unable to upload media to ${bucket}`);
    } catch {
      if (!demoDataEnabled()) throw new Error(`Unable to upload media to ${bucket}`);
    }
  }
  const url = typeof input === "string" ? input : URL.createObjectURL(input);
  return {
    bucket,
    name,
    url,
    ...(typeof input !== "string" ? { size: input.size, type: input.type } : {}),
  };
}

export async function uploadAudioSubmission(input: string | Blob, name?: string) {
  return prepareMediaUrl(input, "lesson-audio", name);
}

export async function uploadStudentAudio(input: string | Blob, studentId: string, name?: string) {
  const safeId = studentId?.trim() || "anonymous";
  const fileName = name ? `${safeId}/${Date.now()}-${name}` : `${safeId}/${Date.now()}-response.webm`;
  const fallbackAsset = async (): Promise<StorageMediaAsset> => {
    let url = "";
    try {
      url = typeof input === "string"
        ? isPersistentMediaUrl(input) ? input : ""
        : await blobToDataUrl(input);
    } catch (error) {
      console.warn("[Student Audio] Unable to create durable audio fallback.", error);
    }
    return {
      bucket: "student-resources",
      name: fileName,
      url,
      ...(typeof input !== "string" ? { size: input.size, type: input.type } : {}),
    };
  };
  if (typeof input === "string") return fallbackAsset();
  if (!isSupabaseConfigured()) return fallbackAsset();

  const deadline = Date.now() + 2000;
  const withTimeout = <T,>(request: PromiseLike<T>, timeoutMs: number, operation: string): Promise<T> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${operation} timed out`)), timeoutMs);
    Promise.resolve(request).then(resolve, reject).finally(() => clearTimeout(timer));
  });

  let candidates: Array<"student-resources" | "audio-submissions"> = ["student-resources", "audio-submissions"];
  try {
    const bucketList = await withTimeout(supabase.storage.listBuckets(), Math.min(1500, deadline - Date.now()), "Storage bucket lookup");
    if (!bucketList.error) {
      const available = new Set(bucketList.data.map((bucket) => bucket.name));
      candidates = candidates.filter((bucket) => available.has(bucket));
    }
  } catch (error) {
    console.warn("[Student Audio] Bucket lookup failed; trying configured audio buckets.", error);
  }

  for (const bucket of candidates) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const path = `${Date.now()}-${fileName}`;
      const { error } = await withTimeout(
        supabase.storage.from(bucket).upload(path, input, { upsert: true, contentType: input.type || undefined }),
        remaining,
        `Audio upload to ${bucket}`,
      );
      if (error) {
        console.warn(`[Student Audio] Upload to ${bucket} failed; trying fallback.`, error.message);
        continue;
      }
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return { bucket, name: path, url: data.publicUrl, size: input.size, type: input.type };
    } catch (error) {
      console.warn(`[Student Audio] Upload to ${bucket} failed; trying fallback.`, error);
    }
  }

  if (candidates.length === 0) console.warn("[Student Audio] No configured student audio bucket is available; using a durable audio data URL.");
  return fallbackAsset();
}

export async function uploadLessonMedia(input: string | Blob, name?: string) {
  return prepareMediaUrl(input, "lesson-media", name);
}

export async function uploadLessonAsset(file: File, blockType: "image" | "audio" | "video" | "resource") {
  const fileExtension = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
  const fileName = `${crypto.randomUUID()}${fileExtension}`;
  const path = `${blockType}/${fileName}`;
  const { error } = await supabase.storage.from("lesson-assets").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("lesson-assets").getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function uploadVoiceFeedback(input: string | Blob, name?: string) {
  return prepareMediaUrl(input, "voice-feedback", name);
}

export async function fetchSavedVocabulary(studentToken?: string): Promise<SavedVocabularyWord[]> {
  if (isSupabaseConfigured()) {
    try {
      const studentId = await getStudentId(studentToken);
      if (studentId) {
        const { data, error } = await supabase.from("user_vocab").select("*").eq("user_id", studentId).order("saved_at", { ascending: false });
        if (!error && data) return data.map((row: SupabaseRow) => ({ word: row.word, partOfSpeech: row.part_of_speech || row.partOfSpeech, definition: row.definition, example: row.example, pronunciationUrl: row.pronunciation_url || row.pronunciationUrl, source: row.source || "free-dictionary", savedAt: row.saved_at || row.savedAt || new Date().toISOString() }));
      }
    } catch (error) {
      if (!demoDataEnabled()) throw error;
    }
  }
  if (isSupabaseConfigured() && !demoDataEnabled()) {
    console.warn("Vocabulary unavailable from Supabase; using an empty vocabulary list.");
    return [];
  }
  return readJson<SavedVocabularyWord[]>(scopedKey(VOCAB_PREFIX, studentToken)) || [];
}

export async function saveVocabularyWord(studentToken: string | undefined, word: SavedVocabularyWord): Promise<SavedVocabularyWord[]> {
  const current = await fetchSavedVocabulary(studentToken);
  const next = [word, ...current.filter((item) => item.word.toLowerCase() !== word.word.toLowerCase())];
  if (isSupabaseConfigured()) {
    try {
      const studentId = await getStudentId(studentToken);
      if (studentId) {
        const { error } = await supabase.from("user_vocab").upsert({ user_id: studentId, word: word.word, part_of_speech: word.partOfSpeech, definition: word.definition, example: word.example, pronunciation_url: word.pronunciationUrl, source: word.source, saved_at: word.savedAt }, { onConflict: "user_id,word" });
        if (!error) return next;
        console.warn("Vocabulary Supabase upsert failed, falling back to local:", error.message);
      }
    } catch (error) {
      console.warn("Vocabulary save Supabase error, falling back to local:", error);
      if (!demoDataEnabled()) {
        // fall through to local fallback instead of throwing red screen
      }
    }
  }
  writeJson(scopedKey(VOCAB_PREFIX, studentToken), next);
  return next;
}

export async function removeVocabularyWord(studentToken: string | undefined, word: string): Promise<SavedVocabularyWord[]> {
  const next = (await fetchSavedVocabulary(studentToken)).filter((item) => item.word.toLowerCase() !== word.toLowerCase());
  if (isSupabaseConfigured()) {
    try {
      const studentId = await getStudentId(studentToken);
      if (studentId) {
        const { error } = await supabase.from("user_vocab").delete().eq("user_id", studentId).eq("word", word);
        if (!error) return next;
      }
    } catch (error) {
      if (!demoDataEnabled()) throw error;
    }
  }
  if (isSupabaseConfigured() && !demoDataEnabled()) throw new Error("Unable to remove vocabulary from Supabase");
  writeJson(scopedKey(VOCAB_PREFIX, studentToken), next);
  return next;
}

export async function fetchStudentNotes(studentToken?: string): Promise<StudentNote[]> {
  if (isSupabaseConfigured()) {
    try {
      const studentId = await getStudentId(studentToken);
      if (studentId) {
        const { data, error } = await supabase.from("user_notes").select("*").eq("user_id", studentId).order("updated_at", { ascending: false });
        if (!error && data) return data.map((row: SupabaseRow) => ({ id: row.id, text: row.text, lessonSlug: row.lesson_slug || row.lessonSlug, updatedAt: row.updated_at || new Date().toISOString() }));
      }
    } catch (error) {
      if (!demoDataEnabled()) throw error;
    }
  }
  if (isSupabaseConfigured() && !demoDataEnabled()) {
    console.warn("Notes unavailable from Supabase; using an empty notes list.");
    return [];
  }
  return readJson<StudentNote[]>(scopedKey(NOTES_PREFIX, studentToken)) || [];
}

export async function saveStudentNote(studentToken: string | undefined, note: StudentNote): Promise<StudentNote[]> {
  const current = await fetchStudentNotes(studentToken);
  const next = [note, ...current.filter((item) => item.id !== note.id)];
  if (isSupabaseConfigured()) {
    try {
      const studentId = await getStudentId(studentToken);
      if (studentId) {
        const { error } = await supabase.from("user_notes").upsert({ id: note.id, user_id: studentId, text: note.text, lesson_slug: note.lessonSlug, updated_at: note.updatedAt }, { onConflict: "id" });
        if (!error) return next;
      }
    } catch (error) {
      if (!demoDataEnabled()) throw error;
    }
  }
  if (isSupabaseConfigured() && !demoDataEnabled()) throw new Error("Unable to save notes to Supabase");
  writeJson(scopedKey(NOTES_PREFIX, studentToken), next);
  return next;
}

export async function fetchChatMessages(studentToken?: string): Promise<ChatMessage[]> {
  if (isSupabaseConfigured() && !demoDataEnabled()) {
    console.warn("Chat history is managed by the Supabase chat widgets; returning an empty fallback for legacy callers.");
    return [];
  }
  return readJson<ChatMessage[]>(scopedKey(CHAT_PREFIX, studentToken)) || [];
}

export async function saveChatMessage(studentToken: string | undefined, message: ChatMessage): Promise<ChatMessage[]> {
  if (isSupabaseConfigured() && !demoDataEnabled()) throw new Error("Chat messages must be saved through Supabase chat widgets");
  const next = [...await fetchChatMessages(studentToken), message];
  writeJson(scopedKey(CHAT_PREFIX, studentToken), next);
  return next;
}

export async function fetchStudentTheme(studentToken?: string): Promise<"dark" | "light"> {
  return readJson<"dark" | "light">(scopedKey(THEME_PREFIX, studentToken)) || "dark";
}

export async function saveStudentTheme(studentToken: string | undefined, theme: "dark" | "light"): Promise<void> {
  if (isSupabaseConfigured() && !demoDataEnabled()) throw new Error("Theme persistence is not configured in Supabase");
  writeJson(scopedKey(THEME_PREFIX, studentToken), theme);
}
