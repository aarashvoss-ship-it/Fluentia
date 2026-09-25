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
export type SubmissionStatus = "not_started" | "in_progress" | "submitted" | "reviewed";

export interface StudentProgressRecord {
  currentStep: StudyStepId;
  completedSteps: StudyStepId[];
  completed?: boolean;
  status: SubmissionStatus;
  updatedAt: string;
}

export interface StorageMediaAsset {
  bucket: "audio-submissions" | "lesson-audio" | "lesson-media" | "lesson-assets" | "student-audio" | "voice-feedback";
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
const demoDataEnabled = () => process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA === "true";

function notifyDataUpdated(detail: { type: string; slug?: string; studentToken?: string }) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FLUENTIA_DATA_UPDATED_EVENT, { detail }));
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
    status: row.status || content.status || "in_progress",
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

export async function fetchLessonState(slug: string, studentToken?: string): Promise<PublishedLessonState | null> {
  if (isSupabaseConfigured()) {
    try {
      const lesson = await fetchStudentLesson(slug, studentToken);
      if (lesson) {
        const resolvedStudentId = await getStudentId() || lesson.student_id;
        const lessonId = typeof lesson.id === "string" ? lesson.id.trim() : "";
        const studentId = typeof resolvedStudentId === "string" ? resolvedStudentId.trim() : "";
        if (UUID_PATTERN.test(lessonId) && UUID_PATTERN.test(studentId)) {
          let submission = null;
          let feedback = null;
          try {
            const result = await supabase.from("submissions").select("answers,status,submitted_at").eq("lesson_id", lessonId).eq("student_id", studentId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
            if (!result.error) submission = result.data;
          } catch {
            submission = null;
          }
          try {
            const result = await supabase.from("instructor_feedback").select("*").eq("lesson_id", lessonId).eq("student_id", studentId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
            if (!result.error) feedback = result.data;
          } catch {
            feedback = null;
          }
          return {
            content: lesson.content || defaultContent(),
            bannerUrl: lesson.coverImage || "",
            studentProfile: defaultProfile(),
            evaluation: feedback ? { scores: feedback?.scores || {}, comments: feedback?.comments || "", strengths: feedback?.strengths, areasToImprove: feedback?.areas_to_improve, studyHubPrescription: feedback?.study_hub_prescription, voiceFeedbackUrl: feedback?.voice_feedback_url, published: Boolean(feedback?.is_published) } : emptyEvaluation(),
            status: lesson.status === "draft" ? "draft" : "published",
            submission: submission ? mapSubmission(submission) : undefined,
          };
        }
      }
      return getState(slug, studentToken) || null;
    } catch {
      // Use local state when Supabase is unavailable or the lesson has no saved state yet.
      return getState(slug, studentToken) || null;
    }
  }
  return getState(slug, studentToken);
}

export async function fetchStudentProgress(slug: string, studentToken?: string): Promise<StudentProgressRecord> {
  if (isSupabaseConfigured()) {
    try {
      const studentId = await getStudentId();
      const lesson = studentId ? await fetchStudentLesson(slug, studentId) : null;
      if (lesson && studentId) { // has lesson + student -> save to Supabase
        const { data, error } = await supabase.from("submissions").select("answers,status,submitted_at").eq("lesson_id", lesson.id).eq("student_id", studentId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
        const progress = data?.answers?.progress;
        if (progress) return { currentStep: progress.currentStep || "warm_up", completedSteps: progress.completedSteps || [], completed: Boolean(progress.completed), status: data?.status || progress.status || "not_started", updatedAt: data?.submitted_at || new Date(0).toISOString() };
      }
    } catch {
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
  const updated = { ...progress, updatedAt: new Date().toISOString() };
  if (isSupabaseConfigured()) {
    try {
      const studentId = await getStudentId();
      const lesson = studentId ? await fetchStudentLesson(slug, studentId) : null;
      if (lesson && studentId) {
        const { data: existingSubmission, error: lookupError } = await supabase.from("submissions").select("id,answers").eq("lesson_id", lesson.id).eq("student_id", studentId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
        if (lookupError) throw lookupError;
        const answers = { ...(existingSubmission?.answers || {}), progress: { currentStep: updated.currentStep, completedSteps: updated.completedSteps, status: updated.status } };
        const { error } = existingSubmission
          ? await supabase.from("submissions").update({ answers, status: updated.status, submitted_at: updated.updatedAt }).eq("id", existingSubmission.id)
          : await supabase.from("submissions").insert({ lesson_id: lesson.id, student_id: studentId, answers, status: updated.status, submitted_at: updated.updatedAt });
        if (!error) {
          notifyDataUpdated({ type: "progress", slug, studentToken });
          return updated;
        }
      }
    } catch {
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

export async function submitStudentLesson(
  slug: string,
  studentToken: string | undefined,
  submission: StudentSubmission,
  progress?: Partial<StudentProgressRecord>
): Promise<PublishedLessonState> {
  const current = await fetchLessonState(slug, studentToken);
  const nextState: PublishedLessonState = {
    content: current?.content || defaultContent(),
    bannerUrl: current?.bannerUrl || "",
    studentProfile: current?.studentProfile || defaultProfile(),
    evaluation: current?.evaluation || emptyEvaluation(),
    status: current?.status || "published",
    submission,
  };
  if (isSupabaseConfigured()) {
    try {
      const lesson = await fetchStudentLesson(slug, studentToken);
      const authenticatedStudentId = await getStudentId();
      const studentId = authenticatedStudentId || lesson?.student_id;
      if (lesson && studentId) {
        const { data: existingSubmission, error: lookupError } = await supabase.from("submissions").select("id").eq("lesson_id", lesson.id).eq("student_id", studentId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
        if (lookupError) throw lookupError;
        const submissionPayload = { answers: submission, status: submission.status, submitted_at: submission.submittedAt || new Date().toISOString() };
        const { error } = existingSubmission
          ? await supabase.from("submissions").update(submissionPayload).eq("id", existingSubmission.id)
          : await supabase.from("submissions").insert({ lesson_id: lesson.id, student_id: studentId, ...submissionPayload });
        if (error) throw error;
        if (progress) {
          void saveStudentProgress(slug, { currentStep: progress.currentStep || "warm_up", completedSteps: progress.completedSteps || [], status: progress.status || (submission.status === "submitted" ? "submitted" : "in_progress"), updatedAt: new Date().toISOString() }, studentToken).catch((progressError) => {
            console.error("Failed to save lesson progress:", progressError);
          });
        }
        notifyDataUpdated({ type: "submission", slug, studentToken });
        return nextState;
      }
    } catch (error) {
      if (!demoDataEnabled()) throw toStorageError(error, `Unable to save submission for ${slug}`);
    }
  }
    // Supabase lesson not found — fall through to local save instead of throwing
  await saveLessonState(slug, nextState, studentToken);
  if (progress) {
    await saveStudentProgress(slug, {
      currentStep: progress.currentStep || "warm_up",
      completedSteps: progress.completedSteps || [],
      status: progress.status || (submission.status === "submitted" ? "submitted" : "in_progress"),
      updatedAt: new Date().toISOString(),
    }, studentToken);
  }
  notifyDataUpdated({ type: "submission", slug, studentToken });
  return nextState;
}

export async function saveInstructorFeedback(
  slug: string,
  studentToken: string | undefined,
  evaluation: LessonEvaluation
): Promise<PublishedLessonState> {
  const current = await fetchLessonState(slug, studentToken);
  const submission = current?.submission
    ? { ...current.submission, status: "reviewed" as const }
    : current?.submission;
  const nextState: PublishedLessonState = {
    content: current?.content || defaultContent(),
    bannerUrl: current?.bannerUrl || "",
    studentProfile: current?.studentProfile || defaultProfile(),
    evaluation: { ...evaluation, published: true },
    status: current?.status || "published",
    submission,
  };
  if (isSupabaseConfigured()) {
    try {
      const [lesson, studentId] = await Promise.all([fetchLesson(slug), getStudentId(studentToken)]);
      if (lesson && studentId) {
        const { error } = await supabase.from("instructor_feedback").upsert({ lesson_id: lesson.id, student_id: studentId, scores: evaluation.scores, comments: evaluation.comments, strengths: evaluation.strengths, areas_to_improve: evaluation.areasToImprove, study_hub_prescription: evaluation.studyHubPrescription, voice_feedback_url: evaluation.voiceFeedbackUrl, is_published: true, updated_at: new Date().toISOString() }, { onConflict: "lesson_id,student_id" });
        if (!error) {
          await saveStudentProgress(slug, { currentStep: "results", completedSteps: ["warm_up", "lesson", "listening", "reading", "writing", "speaking", "results"], status: "reviewed", updatedAt: new Date().toISOString() }, studentToken);
          notifyDataUpdated({ type: "feedback", slug, studentToken });
          return nextState;
        }
      }
    } catch {
      // Continue with the local state fallback below.
    }
  }
  await saveLessonState(slug, nextState, studentToken);
  await saveStudentProgress(slug, {
    currentStep: "results",
    completedSteps: ["warm_up", "lesson", "listening", "reading", "writing", "speaking", "results"],
    status: "reviewed",
    updatedAt: new Date().toISOString(),
  }, studentToken);
  notifyDataUpdated({ type: "feedback", slug, studentToken });
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
  if (typeof input === "string") return { bucket: "student-audio" as const, name: fileName, url: input };
  // Try student-audio bucket, fallback to lesson-media, then Blob URL — never throw UI toast
  const tryUpload = async (bucket: StorageMediaAsset["bucket"]): Promise<StorageMediaAsset | null> => {
    if (!isSupabaseConfigured()) return null;
    try {
      const path = `${Date.now()}-${fileName}`;
      const { error } = await supabase.storage.from(bucket).upload(path, input, { upsert: true, contentType: input.type || undefined });
      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return { bucket, name: path, url: data.publicUrl, size: input.size, type: input.type };
      }
    } catch { /* fallback */ }
    return null;
  };
  return (await tryUpload("student-audio")) || (await tryUpload("lesson-media")) || {
    bucket: "student-audio" as const,
    name: fileName,
    url: URL.createObjectURL(input),
    size: input.size,
    type: input.type,
  };
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
