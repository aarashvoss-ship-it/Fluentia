import { supabase, type LessonRow, type LessonVersionRow, isSupabaseConfigured } from "@/lib/supabase";
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
  student_id?: string;
  student_token?: string;
  subject?: string;
  grade?: string;
  status?: "draft" | "published" | "evaluated";
  instructor_id?: string;
  assigned_all_students?: boolean;
  content: Record<string, any>;
  changes_summary?: string;
}

export interface UpdateLessonInput {
  title?: string;
  banner_url?: string;
  student_id?: string;
  student_token?: string | null;
  instructor_id?: string;
  assigned_all_students?: boolean;
  subject?: string;
  grade?: string;
  status?: "draft" | "published" | "evaluated";
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
export async function getLessonsByStudentId(studentId: string): Promise<LessonWithVersion[]> {
  if (!isSupabaseConfigured()) {
    console.warn("Supabase not configured");
    return [];
  }

  try {
    const studentUuid = studentId;
    if (!studentUuid) return [];
    const [directResult, assignmentIdsResult, allStudentsResult] = await Promise.all([
      supabase.from("lessons").select("*").eq("status", "published").eq("student_id", studentUuid),
      supabase.from("lesson_assignments").select("lesson_id").eq("student_id", studentUuid).eq("status", "assigned"),
      supabase.from("lessons").select("*").eq("status", "published").eq("assigned_all_students", true),
    ]);

    const assignmentLessonIds = (assignmentIdsResult.data || []).map((row) => row.lesson_id);
    const assignedResult = assignmentLessonIds.length > 0
      ? await supabase.from("lessons").select("*").eq("status", "published").in("id", assignmentLessonIds)
      : { data: [], error: null };
    const firstError = directResult.error || assignmentIdsResult.error || assignedResult.error || allStudentsResult.error;
    if (firstError) throw firstError;
    const uniqueLessons = new Map<string, LessonRow>();
    [...(directResult.data || []), ...(assignedResult.data || []), ...(allStudentsResult.data || [])].forEach((lesson) => {
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
  const assignmentPayload = {
    lesson_id: normalizedLessonId,
    student_id: student.id,
    status: "assigned",
    assigned_at: new Date().toISOString(),
  };
  const { error: assignmentError } = await supabase.from("lesson_assignments").upsert(assignmentPayload, { onConflict: "lesson_id,student_id" });
  if (assignmentError) throw assignmentError;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("fluentia:lesson-updated"));
  return updated;
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
    const { content, changes_summary, banner_url, student_id, student_token, instructor_id, ...lessonData } = input;
    const resolvedStudentId = student_id || undefined;
    const resolvedInstructorId = instructor_id || undefined;
    const hasTitle = typeof lessonData.title === "string" && lessonData.title.trim().length > 0;
    const title = hasTitle ? lessonData.title.trim() : "Untitled Lesson";
    const slug = (title && title.trim() !== "")
      ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now()
      : "lesson-" + Date.now();
    const versionContent = {
      ...content,
      slug,
      title,
    };

    // Insert the lesson
    const lessonPayload = {
      ...lessonData,
      title,
      slug,
      status: lessonData.status || "draft",
      ...(banner_url ? { banner_url } : {}),
      ...(resolvedStudentId ? { student_id: resolvedStudentId } : {}),
      ...(student_token ? { student_token } : {}),
      ...(resolvedInstructorId ? { instructor_id: resolvedInstructorId } : {}),
    };
    let { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .insert([lessonPayload])
      .select()
      .single();
    if (isMissingBannerColumn(lessonError) || isMissingStudentColumn(lessonError)) {
      const { banner_url: _ignoredBannerUrl, student_id: _ignoredStudentId, student_token: _ignoredStudentToken, instructor_id: _ignoredInstructorId, ...lessonPayloadWithoutOptionalColumns } = lessonPayload;
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
    const { content, changes_summary, banner_url, student_id, student_token, instructor_id, ...lessonData } = input;
    const resolvedStudentId = student_id || undefined;
    const resolvedInstructorId = instructor_id || undefined;
    // Update the lesson metadata
    const hasStudentTokenUpdate = Object.prototype.hasOwnProperty.call(input, "student_token");
    if (Object.keys(lessonData).length > 0 || banner_url || resolvedStudentId || resolvedInstructorId || hasStudentTokenUpdate) {
      const updatePayload = { ...lessonData, ...(banner_url ? { banner_url } : {}), ...(resolvedStudentId ? { student_id: resolvedStudentId } : {}), ...(resolvedInstructorId ? { instructor_id: resolvedInstructorId } : {}), ...(hasStudentTokenUpdate ? { student_token } : {}) };
      let { error: updateError } = await supabase
        .from("lessons")
        .update(updatePayload)
        .eq("id", id);
      if (isMissingBannerColumn(updateError) || isMissingStudentColumn(updateError)) {
        if (Object.keys(lessonData).length > 0 || hasStudentTokenUpdate) {
          ({ error: updateError } = await supabase
            .from("lessons")
            .update({ ...lessonData, ...(hasStudentTokenUpdate ? { student_token } : {}) })
            .eq("id", id));
        } else {
          updateError = null;
        }
      }

      if (updateError) throw updateError;
    }

    // If content is provided, create a new version
    let newVersion: LessonVersionRow | null = null;
    if (content) {
      const nextVersionNumber = await getNextVersionNumber(id);

      const { data: version, error: versionError } = await supabase
        .from("lesson_versions")
        .insert([
          {
            lesson_id: id,
            version_number: nextVersionNumber,
            content,
            changes_summary: changes_summary || "Updated version",
          },
        ])
        .select()
        .single();

      if (versionError) throw versionError;
      newVersion = version;
    }

    // Fetch and return the updated lesson
    const { data: lesson, error: fetchError } = await supabase
      .from("lessons")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    const latestVersion = newVersion || (await getLatestLessonVersion(id));

    return {
      ...lesson,
      current_version: latestVersion || undefined,
      content: latestVersion?.content,
    };
  } catch (error) {
    console.error(`Error updating lesson ${id}:`, error);
    throw error;
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
    const { error } = await supabase.from("lessons").delete().eq("id", id);

    if (error) throw error;
  } catch (error) {
    console.error(`Error deleting lesson ${id}:`, error);
    throw error;
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
    studentId: lesson.student_token || undefined,
    status: lesson.status === "draft" ? "draft" : "published",
    content: lesson.content,
    ...overrides,
  };
}
