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

export type LessonStatus = "draft" | "published";
export type SubmissionStatus = "not_started" | "in_progress" | "submitted" | "pending_evaluation" | "reviewed" | "evaluated";
type LessonStateMode = "interactive" | "review" | "summary";

const STUDY_STEP_IDS: readonly string[] = ["warm_up", "lesson", "listening", "reading", "writing", "speaking", "results"];

function isStudyStepId(value: unknown): value is StudyStepId {
  return typeof value === "string" && STUDY_STEP_IDS.includes(value);
}

function normalizeSubmissionStatus(value: unknown, fallback: SubmissionStatus = "in_progress"): SubmissionStatus {
  if (value === "draft") return "in_progress";
  if (value === "completed") return "pending_evaluation";
  return value === "not_started" || value === "in_progress" || value === "submitted" || value === "pending_evaluation" || value === "reviewed" || value === "evaluated"
    ? value
    : fallback;
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
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Unable to update local Fluentia cache (${key}):`, error);
  }
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type ApiRecord = Record<string, any>;

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  let payload: ApiRecord = {};
  try {
    payload = await response.json() as ApiRecord;
  } catch {
    // Fall through to the HTTP status in the error below.
  }
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Request failed (${response.status}).`);
  }
  return payload as T;
}

function cacheReadError(error: unknown, scope: string) {
  console.warn(`[Storage] ${scope} API unavailable; serving cached offline data.`, error);
}

function mapLessonRow(row: ApiRecord): LessonContent {
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

function mapSubmission(row: ApiRecord): StudentSubmission {
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
    evaluationViewedAt: typeof content.evaluationViewedAt === "string"
      ? content.evaluationViewedAt
      : typeof row.evaluationViewedAt === "string" ? row.evaluationViewedAt : undefined,
  };
}

export async function fetchLesson(slug: string): Promise<LessonContent | null> {
  try {
    const result = await apiRequest<{ lesson: ApiRecord }>(
      `/api/lessons?scope=one&id=${encodeURIComponent(slug)}`,
    );
    return mapLessonRow(result.lesson);
  } catch (error) {
    const cached = [...readManifest(), ...readInstructorLessons()].find((lesson) => lesson.slug === slug || lesson.id === slug);
    if (cached) cacheReadError(error, `Lesson ${slug}`);
    return cached || null;
  }
}

export async function fetchLessons(): Promise<LessonContent[]> {
  try {
    const result = await apiRequest<{ lessons: ApiRecord[] }>("/api/lessons?scope=student");
    const lessons = (result.lessons || []).map(mapLessonRow);
    writeManifest(lessons);
    return lessons;
  } catch (error) {
    cacheReadError(error, "Lesson list");
    return readManifest();
  }
}

export async function saveLesson(lesson: LessonContent): Promise<void> {
  const input = {
    title: String(lesson.title || "Untitled Lesson"),
    slug: String(lesson.slug),
    student_id: lesson.studentId || null,
    subtitle: lesson.subtitle?.trim() || null,
    module_number: Number.isFinite(lesson.moduleNumber) ? lesson.moduleNumber : 1,
    banner_url: lesson.coverImage || null,
    status: lesson.status === "published" ? "published" : "draft",
    content: lesson.content && typeof lesson.content === "object" ? lesson.content : {},
  };
  try {
    if (UUID_PATTERN.test(lesson.id)) {
      await apiRequest("/api/lessons", { method: "PATCH", body: JSON.stringify({ id: lesson.id, input }) });
    } else {
      await apiRequest("/api/lessons", { method: "POST", body: JSON.stringify({ input }) });
    }
    notifyDataUpdated({ type: "lesson", slug: lesson.slug, studentToken: lesson.studentId });
  } catch (error) {
    const lessons = readManifest().filter((item) => item.slug !== lesson.slug);
    writeManifest([...lessons, lesson]);
    notifyDataUpdated({ type: "lesson", slug: lesson.slug, studentToken: lesson.studentId });
    throw error;
  }
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
  const params = new URLSearchParams({ resource: "lesson-state", slug, mode });
  if (submissionId) params.set("submissionId", submissionId);
  try {
    const result = await apiRequest<{
      lesson: ApiRecord;
      submission: ApiRecord | null;
      evaluation: LessonEvaluation | null;
    }>(`/api/student-data?${params.toString()}`);
    const state: PublishedLessonState = {
      content: result.lesson.content as StrictStepContent || defaultContent(),
      bannerUrl: result.lesson.banner_url || "",
      studentProfile: defaultProfile(),
      evaluation: result.evaluation || emptyEvaluation(),
      status: result.lesson.status === "draft" ? "draft" : "published",
      submissionId: result.submission?.id,
      submission: result.submission ? mapSubmission(result.submission) : undefined,
    };
    writeJson(getLessonStateKey(slug, studentToken), state);
    return getStateForMode(slug, studentToken, mode) || state;
  } catch (error) {
    cacheReadError(error, `Lesson state ${slug}`);
    return getStateForMode(slug, studentToken, mode);
  }
}

export async function markStudentEvaluationAsViewed(
  slug: string,
  studentToken?: string,
  submissionId?: string,
): Promise<void> {
  const current = getState(slug, studentToken);
  if (current?.submission && !current.submission.evaluationViewedAt) {
    writeJson(getLessonStateKey(slug, studentToken), {
      ...current,
      submission: { ...current.submission, evaluationViewedAt: new Date().toISOString() },
    });
  }
  await apiRequest("/api/student-data?resource=evaluation-viewed", {
    method: "POST",
    body: JSON.stringify({ slug, submissionId }),
  });
  notifyDataUpdated({ type: "evaluation-viewed", slug, studentToken });
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
      evaluationViewedAt: submission.evaluationViewedAt,
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
  const defaults: StudentProgressRecord = {
    currentStep: "warm_up", completedSteps: [], completed: false, status: "not_started", updatedAt: new Date(0).toISOString(),
  };
  try {
    const result = await apiRequest<{ submission: ApiRecord | null }>(
      "/api/student-data?resource=lesson-state&slug=" + encodeURIComponent(slug) + "&mode=summary",
    );
    const answers = result.submission?.answers;
    const progress = answers && typeof answers === "object" && !Array.isArray(answers)
      ? (answers as ApiRecord).progress
      : null;
    if (progress && typeof progress === "object" && !Array.isArray(progress)) {
      const record = progress as ApiRecord;
      const value: StudentProgressRecord = {
        currentStep: isStudyStepId(record.currentStep) ? record.currentStep : "warm_up",
        completedSteps: Array.isArray(record.completedSteps) ? record.completedSteps.filter(isStudyStepId) : [],
        completed: record.completed === true,
        status: normalizeSubmissionStatus(record.status || result.submission?.status, "not_started"),
        updatedAt: result.submission?.submitted_at || defaults.updatedAt,
      };
      writeJson(progressKey(slug, studentToken), value);
      return value;
    }
    return defaults;
  } catch (error) {
    cacheReadError(error, "Progress " + slug);
    return readJson<StudentProgressRecord>(progressKey(slug, studentToken)) || defaults;
  }
}

export async function saveStudentProgress(
  slug: string,
  progress: StudentProgressRecord,
  studentToken?: string
): Promise<StudentProgressRecord> {
  const updated: StudentProgressRecord = {
    ...progress,
    completed: progress.completed ?? (progress.status === "submitted" || progress.status === "pending_evaluation" || progress.status === "reviewed" || progress.status === "evaluated"),
    updatedAt: new Date().toISOString(),
  };
  writeJson(progressKey(slug, studentToken), updated);
  const fetched = await fetchLessonState(slug, studentToken, "review");
  const current = fetched || getState(slug, studentToken) || {
    content: defaultContent(), bannerUrl: "", studentProfile: defaultProfile(), evaluation: emptyEvaluation(), status: "published" as const,
  };
  const state: PublishedLessonState = {
    ...current,
    submission: { ...(current.submission || {}), status: updated.status } as StudentSubmission,
  };
  await saveLessonState(slug, state, studentToken, updated);
  notifyDataUpdated({ type: "progress", slug, studentToken });
  return updated;
}

export async function saveLessonState(
  slug: string,
  state: PublishedLessonState,
  studentToken?: string,
  progress?: StudentProgressRecord,
): Promise<PublishedLessonState> {
  writeJson(getLessonStateKey(slug, studentToken), state);
  notifyDataUpdated({ type: "lesson-state", slug, studentToken });
  const result = await apiRequest<{ submission?: ApiRecord }>("/api/student-data?resource=lesson-state", {
    method: "POST",
    body: JSON.stringify({ slug, state, submissionId: state.submissionId, progress }),
  });
  if (result.submission) {
    const saved = { ...state, submissionId: result.submission.id };
    writeJson(getLessonStateKey(slug, studentToken), saved);
    return saved;
  }
  return state;
}

async function persistStudentSubmission(
  slug: string,
  studentToken: string | undefined,
  submission: StudentSubmission,
  progress?: Partial<StudentProgressRecord>
): Promise<PublishedLessonState> {
  const persistableSubmission = removeTemporaryBlobUrls(submission) as StudentSubmission;
  const current = await fetchLessonState(slug, studentToken, "review");
  const progressRecord = progress ? {
    currentStep: progress.currentStep || "warm_up",
    completedSteps: progress.completedSteps || [],
    completed: progress.completed ?? (persistableSubmission.status === "submitted" || persistableSubmission.status === "pending_evaluation" || persistableSubmission.status === "reviewed" || persistableSubmission.status === "evaluated"),
    status: progress.status || normalizeSubmissionStatus(persistableSubmission.status),
    updatedAt: new Date().toISOString(),
  } : undefined;
  const nextState: PublishedLessonState = {
    content: current?.content || defaultContent(), bannerUrl: current?.bannerUrl || "",
    studentProfile: current?.studentProfile || defaultProfile(), evaluation: current?.evaluation || emptyEvaluation(),
    status: current?.status || "published", submissionId: current?.submissionId,
    submission: persistableSubmission,
  };
  writeJson(getLessonStateKey(slug, studentToken), nextState);
  if (progressRecord) writeJson(progressKey(slug, studentToken), progressRecord);
  notifyDataUpdated({ type: "submission", slug, studentToken });
  const saved = await apiRequest<{ submission: ApiRecord }>("/api/student-data?resource=lesson-state", {
    method: "POST",
    body: JSON.stringify({ slug, state: nextState, progress: progressRecord, submissionId: nextState.submissionId }),
  });
  nextState.submissionId = saved.submission.id;
  writeJson(getLessonStateKey(slug, studentToken), nextState);
  return nextState;
}

export function saveStudentSubmissionDraft(
  slug: string,
  studentToken: string | undefined,
  submission: StudentSubmission,
  progress?: Partial<StudentProgressRecord>,
): Promise<PublishedLessonState> {
  return persistStudentSubmission(slug, studentToken, { ...submission, status: "in_progress" }, { ...progress, status: "in_progress" });
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
  const studentId = studentToken?.trim() || "";
  if (!UUID_PATTERN.test(studentId)) throw new Error("A valid selected student ID is required to save this evaluation.");
  const lessonResult = await apiRequest<{ lesson: ApiRecord }>(
    "/api/lessons?scope=one&id=" + encodeURIComponent(slug),
  );
  const lesson = lessonResult.lesson;
  const submissions = await apiRequest<{ submissions?: ApiRecord[]; submission?: ApiRecord | null }>(
    "/api/submissions?lessonId=" + encodeURIComponent(String(lesson.id)) + "&studentId=" + encodeURIComponent(studentId),
  );
  const submissionRows = submissions.submissions || (submissions.submission ? [submissions.submission] : []);
  const target = submissionId
    ? submissionRows.find((row) => row.id === submissionId)
    : submissionRows[0];
  if (!target?.id) throw new Error("No submission exists for this student and lesson.");
  const totalScore = Object.values(evaluation.scores).reduce<number>((total, score) => total + Number(score), 0);
  const savedEvaluation = { ...evaluation, totalScore, published: isPublished };
  const result = await apiRequest<{ evaluation?: LessonEvaluation }>("/api/evaluations", {
    method: "POST",
    body: JSON.stringify({ submissionId: target.id, evaluation: savedEvaluation, published: isPublished }),
  });
  const completedSteps: StudyStepId[] = ["warm_up", "lesson", "listening", "reading", "writing", "speaking", "results"];
  if (isPublished) {
    await apiRequest("/api/submissions", {
      method: "PATCH",
      body: JSON.stringify({
        id: target.id,
        status: "evaluated",
        answers: {
          ...(target.answers || {}),
          status: "evaluated",
          progress: { currentStep: "results", completedSteps, completed: true, status: "evaluated" },
        },
      }),
    });
  }
  const current = getState(slug, studentId);
  const nextState: PublishedLessonState = {
    content: current?.content || lesson.content || defaultContent(),
    bannerUrl: current?.bannerUrl || lesson.banner_url || "",
    studentProfile: current?.studentProfile || defaultProfile(),
    evaluation: result.evaluation || savedEvaluation,
    status: lesson.status === "draft" ? "draft" : "published",
    submissionId: target.id,
    submission: mapSubmission({
      ...target,
      ...(isPublished ? {
        status: "evaluated",
        answers: {
          ...(target.answers || {}),
          status: "evaluated",
          progress: {
            currentStep: "results",
            completedSteps,
            completed: true,
            status: "evaluated",
          },
        },
      } : {}),
    }),
  };
  if (isPublished) {
    writeJson(getLessonStateKey(slug, studentId), nextState);
    notifyDataUpdated({ type: "feedback", slug, studentToken: studentId });
  }
  return nextState;
}

async function uploadMediaBlob(blob: Blob, name: string, folderName: string): Promise<string> {
  const form = new FormData();
  form.set("file", blob, name);
  form.set("folder", folderName);
  const result = await apiRequest<{ url: string }>("/api/assets", { method: "POST", body: form });
  return result.url;
}

export async function prepareMediaUrl(
  input: string | Blob,
  bucket: StorageMediaAsset["bucket"],
  name = "media-" + Date.now(),
  folderName = "lesson-media",
): Promise<StorageMediaAsset> {
  if (typeof input === "string") return { bucket, name, url: input };
  const url = await uploadMediaBlob(input, name, folderName);
  return { bucket, name, url, size: input.size, type: input.type };
}

export async function uploadAudioSubmission(input: string | Blob, name?: string) {
  return prepareMediaUrl(input, "lesson-audio", name, "audio/submissions");
}

export async function uploadStudentAudio(input: string | Blob, studentId: string, name?: string) {
  const safeId = studentId?.trim() || "student";
  const fileName = name ? safeId + "/" + Date.now() + "-" + name : safeId + "/" + Date.now() + "-response.webm";
  if (typeof input === "string") {
    if (!isPersistentMediaUrl(input)) throw new Error("Student audio must be uploaded before it can be saved.");
    return { bucket: "student-resources" as const, name: fileName, url: input };
  }
  const url = await uploadMediaBlob(input, fileName, "audio/stage3");
  return { bucket: "student-resources" as const, name: fileName, url, size: input.size, type: input.type };
}

export async function uploadLessonMedia(input: string | Blob, name?: string) {
  return prepareMediaUrl(input, "lesson-media", name, "lesson-media");
}

export async function uploadLessonAsset(file: File, blockType: "image" | "audio" | "video" | "resource") {
  const fileExtension = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
  const fileName = crypto.randomUUID() + fileExtension;
  const folder = {
    image: "images/lessons",
    audio: "audio/lessons",
    video: "videos/lessons",
    resource: "resources/lessons",
  }[blockType];
  const url = await uploadMediaBlob(file, fileName, folder);
  return { url, path: url };
}

export async function uploadVoiceFeedback(input: string | Blob, name?: string) {
  return prepareMediaUrl(input, "voice-feedback", name, "audio/feedback");
}

function mapVocabularyRow(row: ApiRecord): SavedVocabularyWord {
  return {
    word: row.word,
    partOfSpeech: row.part_of_speech || row.partOfSpeech,
    definition: row.definition,
    example: row.example,
    pronunciationUrl: row.pronunciation_url || row.pronunciationUrl,
    source: row.source || "free-dictionary",
    savedAt: row.saved_at || row.savedAt || new Date().toISOString(),
  };
}

export async function fetchSavedVocabulary(studentToken?: string): Promise<SavedVocabularyWord[]> {
  try {
    const result = await apiRequest<{ words: ApiRecord[] }>("/api/student-data?resource=vocabulary");
    const words = (result.words || []).map(mapVocabularyRow);
    writeJson(scopedKey(VOCAB_PREFIX, studentToken), words);
    return words;
  } catch (error) {
    cacheReadError(error, "Saved vocabulary");
    return readJson<SavedVocabularyWord[]>(scopedKey(VOCAB_PREFIX, studentToken)) || [];
  }
}

export async function saveVocabularyWord(studentToken: string | undefined, word: SavedVocabularyWord): Promise<SavedVocabularyWord[]> {
  const current = await fetchSavedVocabulary(studentToken);
  const next = [word, ...current.filter((item) => item.word.toLowerCase() !== word.word.toLowerCase())];
  writeJson(scopedKey(VOCAB_PREFIX, studentToken), next);
  try {
    const saved = await apiRequest<{ word: ApiRecord }>("/api/student-data?resource=vocabulary", {
      method: "POST",
      body: JSON.stringify({
        word: word.word, part_of_speech: word.partOfSpeech, definition: word.definition, example: word.example,
        pronunciation_url: word.pronunciationUrl, source: word.source, saved_at: word.savedAt,
      }),
    });
    const normalized = mapVocabularyRow(saved.word);
    const persisted = [normalized, ...current.filter((item) => item.word.toLowerCase() !== normalized.word.toLowerCase())];
    writeJson(scopedKey(VOCAB_PREFIX, studentToken), persisted);
    return persisted;
  } catch (error) {
    throw new Error("Vocabulary was cached offline but could not be saved to the server: " + (error instanceof Error ? error.message : String(error)));
  }
}

export async function removeVocabularyWord(studentToken: string | undefined, word: string): Promise<SavedVocabularyWord[]> {
  const next = (await fetchSavedVocabulary(studentToken)).filter((item) => item.word.toLowerCase() !== word.toLowerCase());
  writeJson(scopedKey(VOCAB_PREFIX, studentToken), next);
  try {
    await apiRequest("/api/student-data?resource=vocabulary&word=" + encodeURIComponent(word), { method: "DELETE" });
    return next;
  } catch (error) {
    throw new Error("Vocabulary removal was cached offline but could not be saved to the server: " + (error instanceof Error ? error.message : String(error)));
  }
}

function mapNoteRow(row: ApiRecord): StudentNote {
  return { id: row.id, text: row.text, lessonSlug: row.lesson_slug || row.lessonSlug, updatedAt: row.updated_at || new Date().toISOString() };
}

export async function fetchStudentNotes(studentToken?: string): Promise<StudentNote[]> {
  try {
    const result = await apiRequest<{ notes: ApiRecord[] }>("/api/student-data?resource=notes");
    const notes = (result.notes || []).map(mapNoteRow);
    writeJson(scopedKey(NOTES_PREFIX, studentToken), notes);
    return notes;
  } catch (error) {
    cacheReadError(error, "Student notes");
    return readJson<StudentNote[]>(scopedKey(NOTES_PREFIX, studentToken)) || [];
  }
}

export async function saveStudentNote(studentToken: string | undefined, note: StudentNote): Promise<StudentNote[]> {
  const current = await fetchStudentNotes(studentToken);
  const next = [note, ...current.filter((item) => item.id !== note.id)];
  writeJson(scopedKey(NOTES_PREFIX, studentToken), next);
  try {
    const saved = await apiRequest<{ note: ApiRecord }>("/api/student-data?resource=notes", {
      method: "POST",
      body: JSON.stringify({ id: note.id, text: note.text, lesson_slug: note.lessonSlug, updated_at: note.updatedAt }),
    });
    const normalized = mapNoteRow(saved.note);
    const persisted = [normalized, ...current.filter((item) => item.id !== normalized.id)];
    writeJson(scopedKey(NOTES_PREFIX, studentToken), persisted);
    return persisted;
  } catch (error) {
    throw new Error("Note was cached offline but could not be saved to the server: " + (error instanceof Error ? error.message : String(error)));
  }
}

export async function fetchChatMessages(studentToken?: string): Promise<ChatMessage[]> {
  return readJson<ChatMessage[]>(scopedKey(CHAT_PREFIX, studentToken)) || [];
}

export async function saveChatMessage(studentToken: string | undefined, message: ChatMessage): Promise<ChatMessage[]> {
  const next = [...await fetchChatMessages(studentToken), message];
  writeJson(scopedKey(CHAT_PREFIX, studentToken), next);
  return next;
}

export async function fetchStudentTheme(studentToken?: string): Promise<"dark" | "light"> {
  return readJson<"dark" | "light">(scopedKey(THEME_PREFIX, studentToken)) || "dark";
}

export async function saveStudentTheme(studentToken: string | undefined, theme: "dark" | "light"): Promise<void> {
  writeJson(scopedKey(THEME_PREFIX, studentToken), theme);
}
