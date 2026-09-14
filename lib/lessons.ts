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
  subject?: string;
  grade?: string;
  status?: "draft" | "published" | "evaluated";
  student_id?: string;
  instructor_id?: string;
  content: Record<string, any>;
  changes_summary?: string;
}

export interface UpdateLessonInput {
  title?: string;
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetches the latest version for a given lesson
 */
async function getLatestVersion(lessonId: string): Promise<LessonVersionRow | null> {
  try {
    const { data, error } = await supabase
      .from("lesson_versions")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "no rows found" which is expected for new lessons
      throw error;
    }

    return data || null;
  } catch (error) {
    console.error(`Error fetching latest version for lesson ${lessonId}:`, error);
    throw error;
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

    // Enrich each lesson with its latest version content
    const enrichedLessons = await Promise.all(
      (lessons || []).map(async (lesson) => {
        const version = await getLatestVersion(lesson.id);
        return {
          ...lesson,
          current_version: version || undefined,
          content: version?.content,
        };
      })
    );

    return enrichedLessons;
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
export async function getLessonById(idOrSlug: string): Promise<LessonWithVersion | null> {
  if (!isSupabaseConfigured()) {
    console.warn("Supabase not configured");
    return null;
  }

  try {
    // First try: search by ID (assuming UUID format)
    const { data: lesson, error } = await supabase
      .from("lessons")
      .select("*")
      .eq("id", idOrSlug)
      .single();

    // If found by ID, return it
    if (lesson) {
      const version = await getLatestVersion(lesson.id);
      return {
        ...lesson,
        current_version: version || undefined,
        content: version?.content,
      };
    }

    // If not found by ID (PGRST116 = no rows found), try searching by title
    // This handles slug-like patterns such as "habits-01"
    if (error?.code === "PGRST116" || !lesson) {
      const { data: lessonByTitle, error: titleError } = await supabase
        .from("lessons")
        .select("*")
        .ilike("title", `%${idOrSlug}%`)
        .limit(1)
        .single();

      if (lessonByTitle) {
        const version = await getLatestVersion(lessonByTitle.id);
        return {
          ...lessonByTitle,
          current_version: version || undefined,
          content: version?.content,
        };
      }

      // If still not found or error, return null gracefully
      if (titleError?.code === "PGRST116") {
        console.warn(`Lesson not found: ${idOrSlug}`);
        return null;
      }

      if (titleError) {
        console.warn(`Error searching for lesson ${idOrSlug}:`, titleError);
        return null;
      }
    }

    // If we get here, lesson was not found
    return null;
  } catch (error) {
    // Catch all unexpected errors and return null gracefully
    console.error(`Error fetching lesson ${idOrSlug}:`, error);
    return null;
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
    const { data: lessons, error } = await supabase
      .from("lessons")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const enrichedLessons = await Promise.all(
      (lessons || []).map(async (lesson) => {
        const version = await getLatestVersion(lesson.id);
        return {
          ...lesson,
          current_version: version || undefined,
          content: version?.content,
        };
      })
    );

    return enrichedLessons;
  } catch (error) {
    console.error(`Error fetching lessons for student ${studentId}:`, error);
    throw error;
  }
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
        const version = await getLatestVersion(lesson.id);
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
    const { content, changes_summary, ...lessonData } = input;

    // Insert the lesson
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .insert([
        {
          ...lessonData,
          status: lessonData.status || "draft",
        },
      ])
      .select()
      .single();

    if (lessonError) throw lessonError;

    // Insert the initial version
    const { data: version, error: versionError } = await supabase
      .from("lesson_versions")
      .insert([
        {
          lesson_id: lesson.id,
          version_number: 1,
          content,
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
    const { content, changes_summary, ...lessonData } = input;

    // Update the lesson metadata
    const updatePayload = Object.keys(lessonData).length > 0 ? lessonData : null;
    if (updatePayload) {
      const { error: updateError } = await supabase
        .from("lessons")
        .update(updatePayload)
        .eq("id", id);

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

    const latestVersion = newVersion || (await getLatestVersion(id));

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
    studentId: lesson.student_id || undefined,
    status: lesson.status,
    content: lesson.content,
    ...overrides,
  };
}
