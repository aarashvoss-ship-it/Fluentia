import type { StudentId } from "@/types/database";
import type { InstructorLessonMock, LessonContent, LessonResource } from "@/types/lesson";

export interface LessonRow {
  id: string;
  title: string;
  subtitle?: string | null;
  module_number?: number | null;
  banner_url?: string | null;
  slug?: string | null;
  instructor_note?: string | null;
  subject: string | null;
  grade: string | null;
  status: "draft" | "published" | "evaluated";
  student_id: StudentId | null;
  student_token?: string | null;
  instructor_id: string | null;
  tags: Record<string, unknown>;
  assigned_all_students?: boolean;
  is_published?: boolean;
  created_at: string;
  updated_at: string;
}

export interface LessonVersionRow {
  id: string;
  lesson_id: string;
  version_number: number;
  content: Record<string, any>;
  changes_summary: string | null;
  created_at: string;
}

export interface CreateLessonInput {
  title: string;
  banner_url?: string;
  student_id?: StudentId | null;
  /** @deprecated Use student_id. */
  student_token?: string;
  subject?: string;
  grade?: string;
  tags?: LessonTags;
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
  student_id?: StudentId | null;
  /** @deprecated Use student_id. */
  student_token?: string | null;
  instructor_id?: string;
  instructor_note?: string | null;
  instructor_guidance?: string | null;
  assigned_all_students?: boolean;
  subject?: string;
  grade?: string;
  tags?: LessonTags;
  status?: "draft" | "published" | "evaluated";
  is_published?: boolean;
  content?: Record<string, any>;
  changes_summary?: string;
}

export interface LessonAssignmentCustomResource {
  id: string;
  resource: Record<string, unknown>;
}

export interface LessonAssignmentResourceOptions {
  resourceIds: string[];
  customResourcesByStudentId?: Record<string, LessonAssignmentCustomResource[]>;
}

export interface LessonTags {
  domain: string;
  skill_focus: string;
  practice_type: string;
  custom: string[];
}

export interface LessonWithVersion extends LessonRow {
  current_version?: LessonVersionRow;
  content?: Record<string, any>;
  assigned_student_ids?: string[];
}

export const BENCHMARK_LESSON_ID = "b1b10001-1001-4001-8001-000000000001";
export const BENCHMARK_LESSON_SLUG = "the-architecture-of-daily-habits-b1";

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Lesson request failed (${response.status}).`);
  return result;
}

function emitLessonUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("fluentia:lesson-updated"));
}

export function resolveLessonContent(lesson: LessonWithVersion, version: LessonVersionRow | null) {
  const direct = lesson.content && typeof lesson.content === "object" ? lesson.content : undefined;
  const versionContent = version?.content && typeof version.content === "object" ? version.content : undefined;
  const versionTitle = typeof versionContent?.title === "string" ? versionContent.title.trim() : "";
  const lessonTitle = typeof lesson.title === "string" ? lesson.title.trim() : "";
  return versionTitle && lessonTitle && versionTitle.replace(/\s+/g, " ") !== lessonTitle.replace(/\s+/g, " ")
    ? direct || {}
    : versionContent || direct || {};
}

export async function getLatestLessonVersion(lessonId: string): Promise<LessonVersionRow | null> {
  const result = await apiRequest<{ versions: LessonVersionRow[] }>(
    `/api/lessons?scope=versions&lessonId=${encodeURIComponent(lessonId)}`,
  );
  return result.versions.at(-1) || null;
}

export async function getLessonBaseById(idOrSlug: string): Promise<LessonWithVersion | null> {
  try {
    const result = await apiRequest<{ lesson: LessonWithVersion }>(
      `/api/lessons?scope=one&id=${encodeURIComponent(idOrSlug)}`,
    );
    return result.lesson;
  } catch (error) {
    if (error instanceof Error && error.message === "Lesson not found.") return null;
    throw error;
  }
}

export async function getLessons(): Promise<LessonWithVersion[]> {
  const result = await apiRequest<{ lessons: LessonWithVersion[] }>("/api/lessons?scope=all");
  return result.lessons;
}

export async function getLessonById(idOrSlug = BENCHMARK_LESSON_SLUG): Promise<LessonWithVersion | null> {
  return getLessonBaseById(idOrSlug);
}

export async function getLessonsByStudentId(studentId: string): Promise<LessonWithVersion[]> {
  const result = await apiRequest<{ lessons: LessonWithVersion[] }>(
    `/api/lessons?scope=student&studentId=${encodeURIComponent(studentId)}`,
  );
  return result.lessons;
}

export async function getLessonsByInstructorId(instructorId: string): Promise<LessonWithVersion[]> {
  const result = await apiRequest<{ lessons: LessonWithVersion[] }>(
    `/api/lessons?scope=instructor&instructorId=${encodeURIComponent(instructorId)}`,
  );
  return result.lessons;
}

export async function setLessonAssignments(
  lessonId: string,
  studentIds: string[],
  resourceOptions?: LessonAssignmentResourceOptions,
  resourceStudentIds?: string[],
): Promise<LessonWithVersion> {
  const result = await apiRequest<{ lesson: LessonWithVersion }>("/api/lessons", {
    method: "PATCH",
    body: JSON.stringify({
      action: "assignments",
      id: lessonId,
      studentIds,
      resourceOptions,
      resourceStudentIds,
      summary: "Updated lesson assignments",
    }),
  });
  emitLessonUpdated();
  return result.lesson;
}

export async function assignLessonToStudent(lessonId: string, studentId: string): Promise<LessonWithVersion> {
  return setLessonAssignments(lessonId, [studentId]);
}

export async function publishLessonAndAssign(lessonId: string, studentId: string, instructorId: string): Promise<void> {
  await apiRequest<{ lesson: LessonWithVersion }>("/api/lessons", {
    method: "PATCH",
    body: JSON.stringify({ action: "publish", id: lessonId, studentId, instructorId }),
  });
  emitLessonUpdated();
}

export async function assignLessonToAllActiveStudents(
  lessonId: string,
  studentIds: string[] = [],
  resourceOptions?: LessonAssignmentResourceOptions,
): Promise<LessonWithVersion> {
  const result = await apiRequest<{ lesson: LessonWithVersion }>("/api/lessons", {
    method: "PATCH",
    body: JSON.stringify({
      action: "assignments",
      id: lessonId,
      studentIds,
      assignAll: true,
      resourceOptions,
      summary: "Assigned to all active students",
    }),
  });
  emitLessonUpdated();
  return result.lesson;
}

export async function unassignLesson(lessonId: string): Promise<LessonWithVersion> {
  const result = await apiRequest<{ lesson: LessonWithVersion }>("/api/lessons", {
    method: "PATCH",
    body: JSON.stringify({ action: "assignments", id: lessonId, studentIds: [], summary: "Unassigned lesson" }),
  });
  emitLessonUpdated();
  return result.lesson;
}

export async function createLesson(input: CreateLessonInput): Promise<LessonWithVersion> {
  const result = await apiRequest<{ lesson: LessonWithVersion }>("/api/lessons", {
    method: "POST",
    body: JSON.stringify({ input }),
  });
  emitLessonUpdated();
  return result.lesson;
}

export async function updateLesson(id: string, input: UpdateLessonInput): Promise<LessonWithVersion> {
  const result = await apiRequest<{ lesson: LessonWithVersion }>("/api/lessons", {
    method: "PATCH",
    body: JSON.stringify({ id, input }),
  });
  emitLessonUpdated();
  return result.lesson;
}

export async function deleteLesson(id: string): Promise<void> {
  await apiRequest<{ deleted: boolean }>(`/api/lessons?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  emitLessonUpdated();
}

export async function getLessonVersion(lessonId: string, versionNumber: number): Promise<LessonVersionRow | null> {
  const versions = await apiRequest<{ versions: LessonVersionRow[] }>(
    `/api/lessons?scope=versions&lessonId=${encodeURIComponent(lessonId)}`,
  );
  return versions.versions.find((version) => version.version_number === versionNumber) || null;
}

export async function getLessonVersions(lessonId: string): Promise<LessonVersionRow[]> {
  const result = await apiRequest<{ versions: LessonVersionRow[] }>(
    `/api/lessons?scope=versions&lessonId=${encodeURIComponent(lessonId)}`,
  );
  return result.versions;
}

function toStudentLessonResource(resource: LessonResource) {
  const resourceType = resource.type === "Audio"
    ? "audio"
    : resource.type === "Video"
      ? "video"
      : resource.type === "Image"
        ? "image"
        : resource.type === "PDF"
          ? "file"
          : "reading";
  return {
    id: resource.id,
    resource_type: resourceType,
    title: resource.title,
    body: resource.description || null,
    link_url: resource.url,
    original_filename: resource.type === "PDF" ? resource.title : null,
    resourceHubAssetId: resource.resourceHubAssetId || null,
    is_external_url: !resource.url.includes("/storage/v1/object/"),
  };
}

export async function syncStudentLessonResources(
  lessonId: string,
  studentIds: string[],
  lessonResources: LessonResource[],
  options: LessonAssignmentResourceOptions,
): Promise<void> {
  await apiRequest<{ saved: boolean }>("/api/student-lesson-resources", {
    method: "POST",
    body: JSON.stringify({
      action: "sync",
      lessonId,
      studentIds,
      resources: lessonResources.map((resource) => ({
        resourceId: resource.id,
        resource: toStudentLessonResource(resource),
      })),
      options,
    }),
  });
}

export async function setStudentLessonResourceSelected(
  studentId: string,
  lessonId: string,
  resource: LessonResource,
  selected: boolean,
): Promise<void> {
  await apiRequest<{ saved: boolean }>("/api/student-lesson-resources", {
    method: "POST",
    body: JSON.stringify({
      action: selected ? "select" : "deselect",
      lessonId,
      studentId,
      resourceId: resource.id,
      resource: toStudentLessonResource(resource),
    }),
  });
}

export async function clearStudentLessonResources(lessonId: string, studentIds: string[]): Promise<void> {
  await apiRequest<{ saved: boolean }>("/api/student-lesson-resources", {
    method: "POST",
    body: JSON.stringify({ action: "clear", lessonId, studentIds }),
  });
}

export async function removeStudentLessonCustomResource(
  studentId: string,
  lessonId: string,
  sourceResourceId: string,
): Promise<void> {
  await apiRequest<{ saved: boolean }>("/api/student-lesson-resources", {
    method: "POST",
    body: JSON.stringify({
      action: "remove-custom",
      lessonId,
      studentId,
      resourceId: sourceResourceId,
    }),
  });
}

export function toLessonContent(lesson: LessonWithVersion, overrides?: Partial<LessonContent>): LessonContent {
  return {
    id: lesson.id,
    slug: lesson.slug || lesson.id,
    title: lesson.title,
    subtitle: lesson.subtitle || undefined,
    moduleNumber: lesson.module_number || 0,
    studentId: lesson.student_id || undefined,
    status: lesson.status === "draft" ? "draft" : "published",
    content: lesson.content,
    ...overrides,
  } as LessonContent;
}

export type { InstructorLessonMock };
