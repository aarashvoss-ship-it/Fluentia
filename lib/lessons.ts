import { type LessonRow, type LessonVersionRow, isSupabaseConfigured } from "@/lib/supabase";
import { supabase } from "@/lib/supabaseClient";
import type { StudentId } from "@/types/database";
import type { LessonContent, InstructorLessonMock } from "@/types/lesson";

/**
 * Service layer for lesson management with Supabase integration.
 * Provides functions to fetch, create, and update lessons with version control.
 */

// ============================================================================
// Types
// ============================================================================

export interface CreateLessonInput {
  title: string;
  banner_url?: string;
  student_id?: StudentId;
  /** @deprecated Use student_id. */
  student_token?: string;
  subject?: string;
  grade?: string;
  status?: "draft" | "published" | "evaluated";
  is_published?: boolean;
  instructor_id?: string;
  instructor_note?: string;
  assigned_all_students?: boolean;
  content: Record<string, any>;
  changes_summary?: string;
}

export interface UpdateLessonInput {
  slug?: string;
  title?: string;
  subtitle?: string;
  module_number?: number;
  banner_url?: string;
  student_id?: StudentId;
  /** @deprecated Use student_id. */
  student_token?: string | null;
  instructor_id?: string;
  instructor_note?: string | null;
  instructor_guidance?: string | null;
  assigned_all_students?: boolean;
  subject?: string;
  grade?: string;
  status?: "draft" | "published" | "evaluated";
  is_published?: boolean;
  content?: Record<string, any>;
  changes_summary?: string;
}

export interface LessonWithVersion extends LessonRow {
  current_version?: LessonVersionRow;
  content?: Record<string, any>;
}

export const BENCHMARK_LESSON_ID = "b1b10001-1001-4001-8001-000000000001";
export const BENCHMARK_LESSON_SLUG = "the-architecture-of-daily-habits-b1";
const demoDataEnabled = () => process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA === "true";

const FALLBACK_LESSON: LessonWithVersion = {
  id: BENCHMARK_LESSON_ID,
  title: "The Architecture of Daily Habits",
  subtitle: "A practical lesson about routines, friction, and sustainable change.",
  module_number: 1,
  banner_url: undefined,
  slug: BENCHMARK_LESSON_SLUG,
  subject: "English",
  grade: "B1",
  status: "published",
  student_token: null,
  student_id: null,
  instructor_id: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  content: {
    slug: BENCHMARK_LESSON_SLUG,
    title: "The Architecture of Daily Habits",
    subtitle: "A practical lesson about routines, friction, and sustainable change.",
    moduleNumber: 1,
    warm_up: {
      intro_narrative: { text: "Small changes become easier when the environment supports them.", enabled: true },
      quote: { text: "What habit would you like to make easier?", enabled: true },
    },
    lesson: {
      core_concept: { text: "Design the environment around the behavior you want to repeat.", enabled: true },
      examples: [
        { text: "Put a book beside your bed to make reading more visible.", enabled: true },
        { text: "Prepare your running clothes the night before to reduce friction.", enabled: true },
      ],
    },
    listening: {
      transcript: { text: "Listen for the ideas about cues, friction, and repetition.", enabled: true },
      questions: [],
    },
    reading: {
      article_markdown: { text: "A reliable routine begins with a clear cue and a manageable first step.", enabled: true },
      analytical_questions: [],
    },
    writing: {
      prompt: { text: "Describe one routine you want to improve and the first small step you will take.", enabled: true },
      draft_editor: { enabled: true, placeholder: "Write your response here..." },
    },
    speaking: {
      scenario: { text: "Explain your habit plan aloud in two or three sentences.", enabled: true },
      audio_capture: { enabled: false },
    },
    results: {},
  },
};

function isMissingBannerColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204") && /banner_url/i.test(error.message || ""));
}

function isMissingStudentColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204") && /student_(id|token)/i.test(error.message || ""));
}

function isMissingPublishedColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204") && /is_published/i.test(error.message || ""));
}

function isMissingInstructorNoteColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204") && /instructor_note/i.test(error.message || ""));
}

const LESSON_UPDATE_COLUMNS = [
  "title",
  "subtitle",
  "module_number",
  "slug",
  "status",
  "subject",
  "grade",
  "assigned_all_students",
  "banner_url",
  "student_id",
  "student_token",
  "instructor_id",
  "is_published",
  "instructor_note",
] as const;

function sanitizeJsonValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sanitizeJsonValue).filter((item) => item !== undefined);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, sanitizeJsonValue(item)] as const)
        .filter(([, item]) => item !== undefined),
    );
  }
  return String(value);
}

function sanitizeLessonContent(content: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!content) return undefined;
  return sanitizeJsonValue(content) as Record<string, any>;
}

function sanitizeLessonUpdatePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    LESSON_UPDATE_COLUMNS
      .filter((column) => payload[column] !== undefined)
      .map((column) => [column, payload[column]]),
  );
}

function describeSupabaseError(error: unknown) {
  if (error instanceof Error) {
    const value = error as Error & { code?: string; details?: string; hint?: string; status?: number };
    return { code: value.code, message: value.message, details: value.details, hint: value.hint, status: value.status, stack: value.stack };
  }
  if (error && typeof error === "object") {
    const value = error as { code?: string; message?: string; details?: string; hint?: string; status?: number };
    return { code: value.code, message: value.message, details: value.details, hint: value.hint, status: value.status };
  }
  return { message: String(error) };
}

function toSupabaseError(error: unknown, fallback: string) {
  const details = describeSupabaseError(error);
  const message = [details.message, details.details, details.hint].filter(Boolean).join(" | ") || fallback;
  const normalized = new Error(message);
  Object.assign(normalized, details);
  return normalized;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetches the latest version for a given lesson
 */
export async function getLatestLessonVersion(lessonId: string): Promise<LessonVersionRow | null> {
  try {
    const { data, error } = await supabase
      .from("lesson_versions")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn(`No version found for ${lessonId}, using base lesson.`, error);
    }

    return data || null;
  } catch (error) {
    console.warn(`Error fetching version for ${lessonId}:`, error);
    return null;
  }
}

export async function getLessonBaseById(idOrSlug: string): Promise<LessonWithVersion | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrSlug);
    const lookupColumn = isUuid ? "id" : "slug";
    const { data, error } = await supabase
      .from("lessons")
      .select("*")
      .eq(lookupColumn, idOrSlug)
      .maybeSingle();
    if (error) {
      console.warn(`Unable to load base lesson ${idOrSlug}:`, error);
      return null;
    }
    return data || null;
  } catch (error) {
    console.warn(`Error loading base lesson ${idOrSlug}:`, error);
    return null;
  }
}

/**
 * Gets the next version number for a lesson
 */
async function getNextVersionNumber(lessonId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("lesson_versions")
      .select("version_number")
      .eq("lesson_id", lessonId)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code === "PGRST116") {
      return 1; // First version
    }

    if (error) throw error;
    return (data?.version_number || 0) + 1;
  } catch (error) {
    console.error(`Error getting next version number for lesson ${lessonId}:`, error);
    throw error;
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Fetches all lessons with their latest version content
 */
export async function getLessons(): Promise<LessonWithVersion[]> {
  if (!isSupabaseConfigured()) {
    console.warn("Supabase not configured, returning empty array");
    return [];
  }

  try {
    const { data: lessons, error } = await supabase
      .from("lessons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Promise.all((lessons || []).map(async (lesson) => {
      const version = await getLatestLessonVersion(lesson.id);
      return { ...lesson, current_version: version || undefined, content: version?.content };
    }));
  } catch (error) {
    console.error("Error fetching lessons:", error);
    throw error;
  }
}

/**
 * Fetches a single lesson by ID or slug/title with its latest version content
 * Tries to find by ID first (UUID format), then by title as a slug-like match
 * Returns null gracefully if lesson not found or error occurs (instead of throwing)
 */
export async function getLessonById(idOrSlug = BENCHMARK_LESSON_SLUG): Promise<LessonWithVersion | null> {
  const fallback = { ...FALLBACK_LESSON, slug: idOrSlug || FALLBACK_LESSON.slug };
  if (!isSupabaseConfigured()) {
    if (demoDataEnabled()) return fallback;
    throw new Error("Supabase is not configured and demo data is disabled");
  }

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrSlug);
    const lookupColumn = isUuid ? "id" : "slug";
    const { data: lesson, error } = await supabase
      .from("lessons")
      .select("*")
      .eq(lookupColumn, idOrSlug)
      .maybeSingle();

    if (error) {
      console.warn(`Error searching for lesson ${idOrSlug} by ${lookupColumn}:`, error);
      if (demoDataEnabled()) return fallback;
      throw error;
    }

    if (!lesson) {
      if (!isUuid) {
        const { data: lessonById, error: idError } = await supabase
          .from("lessons")
          .select("*")
          .eq("id", idOrSlug)
          .maybeSingle();
        if (!idError && lessonById) {
          const version = await getLatestLessonVersion(lessonById.id);
          return { ...lessonById, current_version: version || undefined, content: version?.content };
        }
      }
      if (idOrSlug !== BENCHMARK_LESSON_SLUG && demoDataEnabled()) {
        const benchmark = await getLessonById(BENCHMARK_LESSON_SLUG);
        if (benchmark) return benchmark;
      }
      throw new Error(`Lesson not found: ${idOrSlug}`);
    }

    const version = await getLatestLessonVersion(lesson.id);
    return {
      ...lesson,
      current_version: version || undefined,
      content: version?.content,
    };
  } catch (error) {
    // Catch all unexpected errors and return null gracefully
    console.error(`Error fetching lesson ${idOrSlug}:`, error);
    if (demoDataEnabled()) return fallback;
    throw error;
  }
}

/**
 * Fetches lessons by student ID
 */
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveStudentLookupId(studentId: string): Promise<{ studentIds: string[]; studentTokens: string[] }> {
  const normalizedStudentId = studentId.trim();
  if (!normalizedStudentId) return { studentIds: [], studentTokens: [] };

  const studentIds = new Set<string>();
  const studentTokens = new Set<string>();
  if (isUuid(normalizedStudentId)) {
    studentIds.add(normalizedStudentId);
  } else {
    studentTokens.add(normalizedStudentId);
  }

  try {
    const { data: studentRow, error } = await supabase
      .from("students")
      .select("id, token")
      .or(`id.eq.${normalizedStudentId},token.eq.${normalizedStudentId}`)
      .maybeSingle();

    if (!error && studentRow) {
      if (studentRow.id) studentIds.add(studentRow.id);
      if (studentRow.token) studentTokens.add(studentRow.token);
    }
  } catch (error) {
    console.warn("Student identity resolution failed:", error);
  }

  return {
    studentIds: [...studentIds].filter(Boolean),
    studentTokens: [...studentTokens].filter(Boolean),
  };
}

export async function getLessonsByStudentId(studentId: string): Promise<LessonWithVersion[]> {
  if (!isSupabaseConfigured()) {
    console.warn("Supabase not configured");
    return [];
  }

  try {
    const normalizedStudentId = studentId?.trim();
    if (!normalizedStudentId) return [];

    const { studentIds, studentTokens } = await resolveStudentLookupId(normalizedStudentId);
    const normalizedStudentIds = [...new Set(studentIds.filter(Boolean))];
    const normalizedStudentTokens = [...new Set(studentTokens.filter(Boolean))];

    const assignmentQuery = normalizedStudentIds.length > 0
      ? supabase.from("lesson_assignments").select("lesson_id").in("student_id", normalizedStudentIds)
      : supabase.from("lesson_assignments").select("lesson_id").eq("student_id", "00000000-0000-0000-0000-000000000000");

    const [directResult, assignmentIdsResult, allStudentsResult] = await Promise.all([
      normalizedStudentIds.length > 0
        ? supabase.from("lessons").select("*").eq("status", "published").in("student_id", normalizedStudentIds)
        : supabase.from("lessons").select("*").eq("status", "published").eq("student_id", normalizedStudentId),
      assignmentQuery,
      supabase.from("lessons").select("*").eq("status", "published").eq("assigned_all_students", true),
    ]);

    const assignmentLessonIds = [...new Set((assignmentIdsResult.data || []).map((row) => row.lesson_id))];
    const assignedResult = assignmentLessonIds.length > 0
      ? await supabase.from("lessons").select("*").eq("status", "published").in("id", assignmentLessonIds)
      : { data: [], error: null };

    const tokenResult = normalizedStudentTokens.length > 0
      ? await supabase.from("lessons").select("*").eq("status", "published").in("student_token", normalizedStudentTokens)
      : { data: [], error: null };

    const firstError = directResult.error || tokenResult.error || assignmentIdsResult.error || assignedResult.error || allStudentsResult.error;
    if (firstError) throw firstError;

    const uniqueLessons = new Map<string, LessonRow>();
    [...(directResult.data || []), ...(tokenResult.data || []), ...(assignedResult.data || []), ...(allStudentsResult.data || [])].forEach((lesson) => {
      uniqueLessons.set(lesson.id, lesson as LessonRow);
    });

    return Promise.all([...uniqueLessons.values()].map(async (lesson) => {
      const version = await getLatestLessonVersion(lesson.id);
      return { ...lesson, current_version: version || undefined, content: version?.content };
    }));
  } catch (error) {
    console.warn(`Unable to load assigned lessons for student ${studentId}; using published fallback.`, error);
    return [];
  }
}

async function upsertLessonAssignment(lessonId: string, studentId: string) {
  const assignmentPayload = {
    lesson_id: lessonId,
    student_id: studentId,
    assigned_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("lesson_assignments")
    .upsert(assignmentPayload, { onConflict: "lesson_id,student_id" });
  if (error) {
    const details = describeSupabaseError(error);
    console.error("Supabase lesson assignment upsert failed:", details);
    throw toSupabaseError(error, `Failed to assign lesson ${lessonId} to student ${studentId}`);
  }
}

export async function assignLessonToStudent(lessonId: string, studentId: string): Promise<LessonWithVersion> {
  const normalizedLessonId = lessonId.trim();
  const normalizedStudentId = studentId.trim();
  if (!normalizedLessonId || !normalizedStudentId) throw new Error("A lesson and student are required for assignment");
  const lesson = await getLessonById(normalizedLessonId);
  if (!lesson) throw new Error("Lesson not found");
  const { data: student, error: studentError } = await supabase.from("students").select("id, token").eq("id", normalizedStudentId).maybeSingle();
  if (studentError) throw studentError;
  if (!student) throw new Error(`Student ${normalizedStudentId} was not found`);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user?.id) throw authError || new Error("No authenticated instructor session");
  const content = { ...(lesson.content || {}), assignedAllStudents: false, assignedStudents: [student.id] };
  const updated = await updateLesson(normalizedLessonId, { student_id: student.id, student_token: student.token, instructor_id: authData.user.id, assigned_all_students: false, content, changes_summary: "Assigned to student" });
  await upsertLessonAssignment(normalizedLessonId, student.id);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("fluentia:lesson-updated"));
  return updated;
}

export async function publishLessonAndAssign(lessonId: string, studentId: string, instructorId: string): Promise<void> {
  const normalizedLessonId = lessonId.trim();
  const normalizedStudentId = studentId.trim();
  if (!normalizedLessonId || !normalizedStudentId || !instructorId.trim()) throw new Error("Lesson, student, and instructor are required to publish");

  let { error: lessonError } = await supabase
    .from("lessons")
    .update({ status: "published", is_published: true, instructor_id: instructorId })
    .eq("id", normalizedLessonId);
  if (isMissingPublishedColumn(lessonError)) {
    ({ error: lessonError } = await supabase
      .from("lessons")
      .update({ status: "published", instructor_id: instructorId })
      .eq("id", normalizedLessonId));
  }
  if (lessonError) throw lessonError;

  await upsertLessonAssignment(normalizedLessonId, normalizedStudentId);
}

export async function assignLessonToAllActiveStudents(lessonId: string): Promise<LessonWithVersion> {
  const lesson = await getLessonById(lessonId);
  if (!lesson) throw new Error("Lesson not found");
  const content = { ...(lesson.content || {}), assignedAllStudents: true, assignedStudents: [] };
  const updated = await updateLesson(lessonId, { student_token: null, assigned_all_students: true, content, changes_summary: "Assigned to all active students" });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("fluentia:lesson-updated"));
  return updated;
}

export async function unassignLesson(lessonId: string): Promise<LessonWithVersion> {
  const lesson = await getLessonById(lessonId);
  if (!lesson) throw new Error("Lesson not found");
  const content = { ...(lesson.content || {}), assignedAllStudents: false, assignedStudents: [] };
  const updated = await updateLesson(lessonId, { student_token: null, assigned_all_students: false, content, changes_summary: "Unassigned lesson" });
  const { error: assignmentError } = await supabase.from("lesson_assignments").delete().eq("lesson_id", lessonId);
  if (assignmentError) throw assignmentError;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("fluentia:lesson-updated"));
  return updated;
}

/**
 * Fetches lessons by instructor ID
 */
export async function getLessonsByInstructorId(instructorId: string): Promise<LessonWithVersion[]> {
  if (!isSupabaseConfigured()) {
    console.warn("Supabase not configured");
    return [];
  }

  try {
    const { data: lessons, error } = await supabase
      .from("lessons")
      .select("*")
      .eq("instructor_id", instructorId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const enrichedLessons = await Promise.all(
      (lessons || []).map(async (lesson) => {
        const version = await getLatestLessonVersion(lesson.id);
        return {
          ...lesson,
          current_version: version || undefined,
          content: version?.content,
        };
      })
    );

    return enrichedLessons;
  } catch (error) {
    console.error(`Error fetching lessons for instructor ${instructorId}:`, error);
    throw error;
  }
}

/**
 * Creates a new lesson with an initial version
 */
export async function createLesson(input: CreateLessonInput): Promise<LessonWithVersion> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const { content, changes_summary, banner_url, student_id, student_token, instructor_id, instructor_note, is_published, ...lessonData } = input;
    const resolvedStudentId = student_id || undefined;
    const resolvedInstructorId = instructor_id || undefined;
    const hasTitle = typeof lessonData.title === "string" && lessonData.title.trim().length > 0;
    const title = hasTitle ? lessonData.title.trim() : "Untitled Lesson";
    const slug = (title && title.trim() !== "")
      ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now()
      : "lesson-" + Date.now();
    const safeContent = sanitizeLessonContent(content) || {};
    const safeInstructorNote = typeof instructor_note === "string" ? instructor_note.trim() : undefined;
    const versionContent = {
      ...safeContent,
      slug,
      title,
    };

    // Insert the lesson
    const lessonPayload = {
      ...lessonData,
      title,
      slug,
      status: lessonData.status || "draft",
      is_published: is_published ?? lessonData.status === "published",
      ...(banner_url ? { banner_url } : {}),
      ...(resolvedStudentId ? { student_id: resolvedStudentId } : {}),
      ...(student_token ? { student_token } : {}),
      ...(resolvedInstructorId ? { instructor_id: resolvedInstructorId } : {}),
      ...(safeInstructorNote !== undefined ? { instructor_note: safeInstructorNote } : {}),
    };
    let { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .insert([lessonPayload])
      .select()
      .single();
    if (isMissingBannerColumn(lessonError) || isMissingStudentColumn(lessonError) || isMissingPublishedColumn(lessonError)) {
      const { banner_url: _ignoredBannerUrl, student_id: _ignoredStudentId, student_token: _ignoredStudentToken, instructor_id: _ignoredInstructorId, is_published: _ignoredPublished, ...lessonPayloadWithoutOptionalColumns } = lessonPayload;
      ({ data: lesson, error: lessonError } = await supabase
        .from("lessons")
        .insert([lessonPayloadWithoutOptionalColumns])
        .select()
        .single());
    }

    if (lessonError) throw lessonError;

    // Insert the initial version
    const { data: version, error: versionError } = await supabase
      .from("lesson_versions")
      .insert([
        {
          lesson_id: lesson.id,
          version_number: 1,
          content: versionContent,
          changes_summary: changes_summary || "Initial version",
        },
      ])
      .select()
      .single();

    if (versionError) throw versionError;

    return {
      ...lesson,
      current_version: version,
      content: version.content,
    };
  } catch (error) {
    console.error("Error creating lesson:", error);
    throw error;
  }
}

/**
 * Updates a lesson and creates a new version if content changes
 */
export async function updateLesson(
  id: string,
  input: UpdateLessonInput
): Promise<LessonWithVersion> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const { content, changes_summary, banner_url, student_id, student_token, instructor_id, instructor_note, instructor_guidance, is_published, slug, title, subtitle, module_number, status, subject, grade, assigned_all_students } = input;
    const safeContent = sanitizeLessonContent(content);
    const safeInstructorNote = typeof (instructor_note ?? instructor_guidance) === "string"
      ? (instructor_note ?? instructor_guidance)?.trim()
      : undefined;
    const resolvedStudentId = student_id || undefined;
    const resolvedInstructorId = instructor_id || undefined;
    // Update the lesson metadata
    const hasStudentTokenUpdate = Object.prototype.hasOwnProperty.call(input, "student_token");
    if (title !== undefined || subtitle !== undefined || module_number !== undefined || slug !== undefined || status !== undefined || subject !== undefined || grade !== undefined || assigned_all_students !== undefined || banner_url !== undefined || resolvedStudentId || resolvedInstructorId || hasStudentTokenUpdate || is_published !== undefined || safeInstructorNote !== undefined) {
      const updatePayload = sanitizeLessonUpdatePayload({
        ...(title !== undefined ? { title } : {}),
        ...(subtitle !== undefined ? { subtitle: typeof subtitle === "string" ? subtitle.trim() : subtitle } : {}),
        ...(module_number !== undefined ? { module_number } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(subject !== undefined ? { subject } : {}),
        ...(grade !== undefined ? { grade } : {}),
        ...(assigned_all_students !== undefined ? { assigned_all_students } : {}),
        ...(banner_url !== undefined ? { banner_url } : {}),
        ...(resolvedStudentId ? { student_id: resolvedStudentId } : {}),
        ...(resolvedInstructorId ? { instructor_id: resolvedInstructorId } : {}),
        ...(hasStudentTokenUpdate ? { student_token } : {}),
        ...(is_published !== undefined ? { is_published } : {}),
        ...(safeInstructorNote !== undefined ? { instructor_note: safeInstructorNote } : {}),
      });
      let { data: updatedRows, error: updateError } = await supabase
        .from("lessons")
        .update(updatePayload)
        .eq("id", id)
        .select("id");
      if (isMissingBannerColumn(updateError) || isMissingStudentColumn(updateError) || isMissingPublishedColumn(updateError) || isMissingInstructorNoteColumn(updateError)) {
        const { banner_url: _ignoredBannerUrl, student_id: _ignoredStudentId, student_token: _ignoredStudentToken, is_published: _ignoredPublished, instructor_note: _ignoredInstructorNote, ...compatPayload } = updatePayload;
        if (Object.keys(compatPayload).length > 0) {
          ({ data: updatedRows, error: updateError } = await supabase
            .from("lessons")
            .update(compatPayload)
            .eq("id", id)
            .select("id"));
        } else {
          updateError = null;
        }
      }

      if (updateError) {
        const errorDetails = describeSupabaseError(updateError);
        console.error("Supabase update error details:", {
          code: errorDetails.code,
          message: errorDetails.message,
          details: errorDetails.details,
          hint: errorDetails.hint,
          status: errorDetails.status,
        });
        throw toSupabaseError(updateError, `Failed to update lesson ${id}`);
      }
      if (!updatedRows?.length) {
        const { data: existingLesson, error: existingError } = await supabase.from("lessons").select("id").eq("id", id).maybeSingle();
        if (existingError) throw toSupabaseError(existingError, `Failed to check lesson ${id}`);
        if (!existingLesson) {
          const { error: upsertError } = await supabase.from("lessons").upsert({ id, ...sanitizeLessonUpdatePayload(updatePayload) }, { onConflict: "id" });
          if (upsertError) {
            const errorDetails = describeSupabaseError(upsertError);
            console.error("Supabase lesson upsert error details:", {
              code: errorDetails.code,
              message: errorDetails.message,
              details: errorDetails.details,
              hint: errorDetails.hint,
              status: errorDetails.status,
            });
            throw toSupabaseError(upsertError, `Failed to upsert lesson ${id}`);
          }
        }
      }
    }

    // If content is provided, create a new version
    let newVersion: LessonVersionRow | null = null;
    if (safeContent) {
      const nextVersionNumber = await getNextVersionNumber(id);

      const { data: version, error: versionError } = await supabase
        .from("lesson_versions")
        .insert([
          {
            lesson_id: id,
            version_number: nextVersionNumber,
            content: safeContent,
            changes_summary: changes_summary || "Updated version",
          },
        ])
        .select()
        .single();

      if (versionError) {
        const errorDetails = describeSupabaseError(versionError);
        console.error("Supabase lesson version error details:", {
          code: errorDetails.code,
          message: errorDetails.message,
          details: errorDetails.details,
          hint: errorDetails.hint,
          status: errorDetails.status,
        });
        throw toSupabaseError(versionError, `Failed to save lesson version ${id}`);
      }
      newVersion = version;
    }

    // Fetch and return the updated lesson
    const { data: lesson, error: fetchError } = await supabase
      .from("lessons")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) throw toSupabaseError(fetchError, `Failed to reload lesson ${id}`);

    const latestVersion = newVersion || (await getLatestLessonVersion(id));

    return {
      ...lesson,
      current_version: latestVersion || undefined,
      content: latestVersion?.content,
    };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : toSupabaseError(error, `Failed to update lesson ${id}`);
    const errorDetails = describeSupabaseError(normalizedError);
    console.error(`Error updating lesson ${id}:`, {
      code: errorDetails.code,
      message: errorDetails.message,
      details: errorDetails.details,
      hint: errorDetails.hint,
      status: errorDetails.status,
    });
    throw normalizedError;
  }
}

/**
 * Deletes a lesson and all its versions
 */
export async function deleteLesson(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const childTables = [
      "lesson_versions",
      "submissions",
      "instructor_feedback",
      "lesson_assignments",
    ] as const;

    for (const table of childTables) {
      try {
        const { error: childError } = await supabase.from(table).delete().eq("lesson_id", id);
        if (childError) {
          const details = describeSupabaseError(childError);
          console.warn(`Supabase child cleanup skipped for ${table} and lesson ${id}:`, {
            code: details.code,
            message: details.message,
            details: details.details,
            hint: details.hint,
            status: details.status,
          });
        }
      } catch (childError) {
        const details = describeSupabaseError(childError);
        console.warn(`Supabase child cleanup skipped for ${table} and lesson ${id}:`, {
          code: details.code,
          message: details.message,
          details: details.details,
          hint: details.hint,
          status: details.status,
        });
      }
    }

    const { error } = await supabase.from("lessons").delete().eq("id", id);

    if (error) {
      const details = describeSupabaseError(error);
      console.error(`Supabase lesson deletion failed for ${id}:`, {
        code: details.code,
        message: details.message,
        details: details.details,
        hint: details.hint,
        status: details.status,
      });
      throw toSupabaseError(error, `Unable to delete lesson ${id}`);
    }
  } catch (error) {
    const normalizedError = error instanceof Error ? error : toSupabaseError(error, `Unable to delete lesson ${id}`);
    const details = describeSupabaseError(normalizedError);
    console.error(`Error deleting lesson ${id}:`, {
      code: details.code,
      message: details.message,
      details: details.details,
      hint: details.hint,
      status: details.status,
    });
    throw normalizedError;
  }
}

/**
 * Gets a specific version of a lesson
 */
export async function getLessonVersion(
  lessonId: string,
  versionNumber: number
): Promise<LessonVersionRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("lesson_versions")
      .select("*")
      .eq("lesson_id", lessonId)
      .eq("version_number", versionNumber)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return data || null;
  } catch (error) {
    console.error(
      `Error fetching version ${versionNumber} of lesson ${lessonId}:`,
      error
    );
    throw error;
  }
}

/**
 * Gets all versions of a lesson
 */
export async function getLessonVersions(lessonId: string): Promise<LessonVersionRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("lesson_versions")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("version_number", { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error(`Error fetching versions for lesson ${lessonId}:`, error);
    throw error;
  }
}

// ============================================================================
// Utility Functions (for backward compatibility with existing UI)
// ============================================================================

/**
 * Converts a lesson database row to LessonContent format
 * Use this when you need to adapt database format to UI component format
 */
export function toLessonContent(
  lesson: LessonWithVersion,
  overrides?: Partial<LessonContent>
): LessonContent {
  return {
    id: lesson.id,
    slug: lesson.id, // Use UUID as slug if no slug field in database
    title: lesson.title,
    subtitle: undefined,
    moduleNumber: 0,
    studentId: lesson.student_id || undefined,
    status: lesson.status === "draft" ? "draft" : "published",
    content: lesson.content,
    ...overrides,
  };
}
