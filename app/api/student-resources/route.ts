import { NextResponse } from "next/server";
import { isAllowedRequestOrigin } from "@/lib/auth";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resourceTypes = new Set([
  "note", "reading", "flashcard", "flashcards", "quiz", "audio",
  "data_table", "file", "image", "video", "links",
]);
const optionalColumns = [
  "body", "link_url", "question", "answer", "explanation", "cards",
  "original_filename", "media_type", "storage_path", "is_external_url",
] as const;

type ResourceType = typeof resourceTypes extends Set<infer T> ? T : never;
type ResourceRecord = Record<string, unknown>;
type ResourceFallback = {
  id?: string;
  student_id: string;
  student_token: string | null;
  lesson_id: string;
  created_at?: string | null;
};

function isRecord(value: unknown): value is ResourceRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeStudentResource(value: unknown, fallback: ResourceFallback): ResourceRecord | null {
  if (!isRecord(value)) return null;
  const resourceType = typeof value.resource_type === "string"
    ? value.resource_type
    : typeof value.type === "string" ? value.type : "";
  if (!resourceTypes.has(resourceType)) return null;
  const title = typeof value.title === "string" ? value.title : "";
  if (!title) return null;
  const nullableString = (field: string) => typeof value[field] === "string" ? value[field] : null;
  return {
    id: typeof value.id === "string" ? value.id : fallback.id || "",
    student_id: typeof value.student_id === "string" ? value.student_id : fallback.student_id,
    student_token: typeof value.student_token === "string" ? value.student_token : fallback.student_token,
    lesson_id: typeof value.lesson_id === "string" ? value.lesson_id : fallback.lesson_id,
    type: typeof value.type === "string" ? value.type : resourceType,
    resource_type: resourceType,
    title,
    body: nullableString("body"),
    link_url: nullableString("link_url"),
    question: nullableString("question"),
    answer: nullableString("answer"),
    explanation: nullableString("explanation"),
    subtitle: nullableString("subtitle"),
    sub_title: nullableString("sub_title"),
    example: nullableString("example"),
    cards: Array.isArray(value.cards) ? value.cards : null,
    original_filename: nullableString("original_filename"),
    media_type: nullableString("media_type"),
    storage_path: nullableString("storage_path"),
    is_external_url: typeof value.is_external_url === "boolean" ? value.is_external_url : false,
    created_at: typeof value.created_at === "string" ? value.created_at : fallback.created_at || null,
    updated_at: nullableString("updated_at"),
  };
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function requestBody(request: Request) {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

async function getStudentAndLesson(studentId: string, lessonId: string) {
  const result = await getPostgresPool().query<{
    id: string;
    token: string | null;
    legacy_token: string | null;
    assigned_instructor: string | null;
    lesson_instructor_id: string | null;
    lesson_student_id: string | null;
    assigned_all_students: boolean | null;
    has_lesson_assignment: boolean;
  }>(
    `SELECT student.id,
            student_profile.token,
            legacy_student.token AS legacy_token,
            student_profile.assigned_instructor,
            lesson.instructor_id::text AS lesson_instructor_id,
            lesson.student_id::text AS lesson_student_id,
            lesson.assigned_all_students,
            EXISTS (
              SELECT 1 FROM public.lesson_assignments assignment
              WHERE assignment.lesson_id = lesson.id
                AND assignment.student_id = student.id
                AND assignment.status = 'assigned'
            ) AS has_lesson_assignment
     FROM public.users student
     JOIN public.profiles student_profile ON student_profile.id = student.id
     LEFT JOIN public.students legacy_student ON legacy_student.id = student.id
     JOIN public.lessons lesson ON lesson.id = $2::uuid
     WHERE student.id = $1::uuid
       AND COALESCE(student_profile.role, 'student') = 'student'
     LIMIT 1`,
    [studentId, lessonId],
  );
  return result.rows[0] || null;
}

function studentHasLessonAccess(row: Awaited<ReturnType<typeof getStudentAndLesson>>) {
  return Boolean(row && (
    row.lesson_student_id === row.id
    || row.assigned_all_students
    || row.has_lesson_assignment
  ));
}

async function instructorOwnsStudent(instructorId: string, assignedInstructor: string | null) {
  if (!assignedInstructor) return false;
  const result = await getPostgresPool().query<{ owned: boolean }>(
    `SELECT (
       $1::text = $2
       OR $2 = (SELECT token FROM public.instructors WHERE id = $1::uuid LIMIT 1)
       OR $2 = (SELECT slug FROM public.instructors WHERE id = $1::uuid LIMIT 1)
     ) AS owned`,
    [instructorId, assignedInstructor],
  );
  return result.rows[0]?.owned === true;
}

async function validateInstructorTarget(user: { id: string; role: string }, studentId: string, lessonId: string) {
  if (!uuidPattern.test(studentId) || !uuidPattern.test(lessonId)) {
    return { error: errorResponse("Provide a valid student and lesson.", 400) };
  }
  const target = await getStudentAndLesson(studentId, lessonId);
  if (!target) return { error: errorResponse("Student or lesson not found.", 404) };
  if (!studentHasLessonAccess(target)) {
    return { error: errorResponse("The student is not assigned to this lesson.", 403) };
  }
  if (user.role !== "admin") {
    if (target.lesson_instructor_id !== user.id) {
      return { error: errorResponse("You can only manage resources for your own lessons.", 403) };
    }
    if (!await instructorOwnsStudent(user.id, target.assigned_instructor)) {
      return { error: errorResponse("You can only manage resources for your assigned students.", 403) };
    }
  }
  const studentToken = target.legacy_token || target.token;
  if (!studentToken) return { error: errorResponse("The student profile is missing its resource identity.", 409) };
  return { target, studentToken };
}

async function loadStudentResources(studentId: string, studentToken: string | null, lessonId: string) {
  const pool = getPostgresPool();
  const [customRows, lessonRows] = await Promise.all([
    pool.query<{ resource: ResourceRecord }>(
      `SELECT to_jsonb(custom_resource) AS resource
       FROM public.student_resources AS custom_resource
       WHERE custom_resource.student_id = $1::uuid
         AND custom_resource.lesson_id = $2::uuid
       ORDER BY custom_resource.created_at DESC`,
      [studentId, lessonId],
    ),
    pool.query<{ id: string; resource: unknown; created_at: string }>(
      `SELECT id, resource, created_at
       FROM public.student_lesson_resources
       WHERE student_id = $1::uuid AND lesson_id = $2::uuid
       ORDER BY created_at DESC`,
      [studentId, lessonId],
    ),
  ]);
  const merged = new Map<string, ResourceRecord>();
  for (const row of lessonRows.rows) {
    const resource = normalizeStudentResource(row.resource, {
      id: row.id,
      student_id: studentId,
      student_token: studentToken,
      lesson_id: lessonId,
      created_at: row.created_at,
    });
    if (resource) merged.set(row.id, resource);
  }
  for (const row of customRows.rows) {
    const resource = normalizeStudentResource(row.resource, {
      student_id: studentId,
      student_token: studentToken,
      lesson_id: lessonId,
    });
    if (resource && typeof resource.id === "string") merged.set(resource.id, resource);
  }
  return [...merged.values()];
}

function getResourceInput(body: ResourceRecord) {
  return isRecord(body.resource) ? body.resource : body;
}

function validateResourceInput(input: ResourceRecord) {
  const resourceType = typeof input.resource_type === "string"
    ? input.resource_type
    : typeof input.type === "string" ? input.type : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!resourceTypes.has(resourceType) || !title || title.length > 500) return null;
  return { resourceType: resourceType as ResourceType, title };
}

function buildWriteColumns(input: ResourceRecord, resourceType: ResourceType, title: string) {
  const columns: string[] = ["type", "resource_type", "title"];
  const values: unknown[] = [resourceType, resourceType, title];
  for (const column of optionalColumns) {
    if (!(column in input)) continue;
    columns.push(column);
    values.push(column === "cards" && input[column] !== null
      ? JSON.stringify(input[column])
      : input[column]);
  }
  return { columns, values };
}

export async function GET(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return errorResponse("Sign in to access student resources.", 401);

  const params = new URL(request.url).searchParams;
  const lessonId = params.get("lessonId")?.trim() || "";
  const studentId = params.get("studentId")?.trim() || "";
  if (!uuidPattern.test(lessonId)) return errorResponse("Provide a valid lesson ID.", 400);
  if (user.role === "student") {
    if (studentId && studentId !== user.id) return errorResponse("You can only access your own resources.", 403);
    if (!uuidPattern.test(user.id)) return errorResponse("Invalid student session.", 401);
  } else if ((user.role === "instructor" || user.role === "admin") && studentId) {
    try {
      await initializeDatabase();
      const target = await validateInstructorTarget(user, studentId, lessonId);
      if ("error" in target) return target.error;
      const rows = await getPostgresPool().query<{ resource: ResourceRecord }>(
        `SELECT to_jsonb(custom_resource) AS resource
         FROM public.student_resources AS custom_resource
         WHERE custom_resource.student_id = $1::uuid
           AND custom_resource.lesson_id = $2::uuid
         ORDER BY custom_resource.created_at DESC`,
        [studentId, lessonId],
      );
      return NextResponse.json({
        resources: rows.rows.flatMap(({ resource }) => {
          const normalized = normalizeStudentResource(resource, {
            student_id: studentId,
            student_token: target.studentToken,
            lesson_id: lessonId,
          });
          return normalized ? [normalized] : [];
        }),
      });
    } catch (error) {
      logDatabaseError("PostgreSQL instructor student-resource query failed:", error);
      return errorResponse("Unable to load student resources.", 500);
    }
  } else {
    return errorResponse("Only students and instructors can access student resources.", 403);
  }

  try {
    await initializeDatabase();
    const target = await getStudentAndLesson(user.id, lessonId);
    if (!target || !studentHasLessonAccess(target)) return errorResponse("Lesson not found or not assigned to this student.", 404);
    const resources = await loadStudentResources(user.id, target.legacy_token || target.token, lessonId);
    return NextResponse.json({ resources });
  } catch (error) {
    logDatabaseError("PostgreSQL student-resource query failed:", error);
    return errorResponse("Unable to load assigned student resources.", 500);
  }
}

export async function POST(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return errorResponse("Sign in to manage student resources.", 401);
  if (user.role !== "instructor" && user.role !== "admin") return errorResponse("Only instructors can manage student resources.", 403);
  if (!isAllowedRequestOrigin(request)) return errorResponse("Invalid request origin.", 403);

  const body = await requestBody(request);
  if (!body) return errorResponse("Provide valid resource details.", 400);
  const input = getResourceInput(body);
  const validated = validateResourceInput(input);
  const studentId = typeof body.studentId === "string" ? body.studentId : typeof input.student_id === "string" ? input.student_id : "";
  const lessonId = typeof body.lessonId === "string" ? body.lessonId : typeof input.lesson_id === "string" ? input.lesson_id : "";
  if (!validated) return errorResponse("Provide a supported resource type and title.", 400);

  try {
    await initializeDatabase();
    const target = await validateInstructorTarget(user, studentId, lessonId);
    if ("error" in target) return target.error;
    const { columns, values } = buildWriteColumns(input, validated.resourceType, validated.title);
    columns.unshift("student_id", "student_token", "lesson_id");
    values.unshift(studentId, target.studentToken, lessonId);
    const placeholders = values.map((_, index) => `$${index + 1}${columns[index] === "cards" ? "::jsonb" : ""}`);
    columns.push("updated_at");
    placeholders.push("now()");
    const result = await getPostgresPool().query(
      `INSERT INTO public.student_resources (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING *`,
      values,
    );
    return NextResponse.json({ resource: result.rows[0] }, { status: 201 });
  } catch (error) {
    logDatabaseError("PostgreSQL student-resource creation failed:", error);
    return errorResponse("Unable to create student resource.", 500);
  }
}

export async function PATCH(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return errorResponse("Sign in to manage student resources.", 401);
  if (user.role !== "instructor" && user.role !== "admin") return errorResponse("Only instructors can manage student resources.", 403);
  if (!isAllowedRequestOrigin(request)) return errorResponse("Invalid request origin.", 403);

  const body = await requestBody(request);
  if (!body) return errorResponse("Provide valid resource changes.", 400);
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const studentId = typeof body.studentId === "string" ? body.studentId : "";
  const lessonId = typeof body.lessonId === "string" ? body.lessonId : "";
  const input = getResourceInput(body);
  const validated = validateResourceInput(input);
  if (!uuidPattern.test(id) || !validated) return errorResponse("Provide valid resource changes.", 400);

  try {
    await initializeDatabase();
    const target = await validateInstructorTarget(user, studentId, lessonId);
    if ("error" in target) return target.error;
    const { columns, values } = buildWriteColumns(input, validated.resourceType, validated.title);
    columns.push("student_token", "updated_at");
    values.push(target.studentToken);
    const updates = columns.map((column, index) => `${column} = $${index + 1}${column === "cards" ? "::jsonb" : ""}`);
    values.push(id, studentId, lessonId);
    const result = await getPostgresPool().query(
      `UPDATE public.student_resources
       SET ${updates.join(", ")}
       WHERE id = $${values.length - 2}::uuid
         AND student_id = $${values.length - 1}::uuid
         AND lesson_id = $${values.length}::uuid
       RETURNING *`,
      values,
    );
    if (!result.rowCount) return errorResponse("Student resource not found.", 404);
    return NextResponse.json({ resource: result.rows[0] });
  } catch (error) {
    logDatabaseError("PostgreSQL student-resource update failed:", error);
    return errorResponse("Unable to update student resource.", 500);
  }
}

export async function DELETE(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return errorResponse("Sign in to manage student resources.", 401);
  if (user.role !== "instructor" && user.role !== "admin") return errorResponse("Only instructors can manage student resources.", 403);
  if (!isAllowedRequestOrigin(request)) return errorResponse("Invalid request origin.", 403);

  const body = await requestBody(request);
  if (!body) return errorResponse("Provide valid resource details.", 400);
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const studentId = typeof body.studentId === "string" ? body.studentId : "";
  const lessonId = typeof body.lessonId === "string" ? body.lessonId : "";
  if (!uuidPattern.test(id)) return errorResponse("Provide a valid resource ID.", 400);

  try {
    await initializeDatabase();
    const target = await validateInstructorTarget(user, studentId, lessonId);
    if ("error" in target) return target.error;
    const result = await getPostgresPool().query(
      `DELETE FROM public.student_resources
       WHERE id = $1::uuid AND student_id = $2::uuid AND lesson_id = $3::uuid
       RETURNING id`,
      [id, studentId, lessonId],
    );
    if (!result.rowCount) return errorResponse("Student resource not found.", 404);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    logDatabaseError("PostgreSQL student-resource deletion failed:", error);
    return errorResponse("Unable to delete student resource.", 500);
  }
}
