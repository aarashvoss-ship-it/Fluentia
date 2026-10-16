import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instructorRoles = new Set(["instructor", "admin"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function canAccessLesson(
  user: { id: string; role: string },
  lessonId: string,
  studentId: string,
) {
  const pool = getPostgresPool();
  const lessonResult = await pool.query<{
    instructor_id: string | null;
    student_id: string | null;
    assigned_all_students: boolean;
    status: string;
  }>(
    `SELECT instructor_id::text, student_id::text, assigned_all_students, status
     FROM public.lessons WHERE id = $1`,
    [lessonId],
  );
  const lesson = lessonResult.rows[0];
  if (!lesson) return false;

  if (instructorRoles.has(user.role)) {
    return user.role === "admin" || lesson.instructor_id === user.id;
  }
  if (user.role !== "student" || user.id !== studentId || lesson.status !== "published") return false;
  if (lesson.student_id === studentId || lesson.assigned_all_students) return true;
  const assignment = await pool.query(
    `SELECT 1 FROM public.lesson_assignments
     WHERE lesson_id = $1 AND student_id = $2 AND status = 'assigned'`,
    [lessonId, studentId],
  );
  return assignment.rowCount !== null && assignment.rowCount > 0;
}

async function parseBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to access lesson resources." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const lessonId = params.get("lessonId")?.trim() || "";
  const studentId = params.get("studentId")?.trim() || user.id;
  if (!uuidPattern.test(lessonId) || !uuidPattern.test(studentId)) {
    return NextResponse.json({ error: "Provide a valid lesson and student." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    if (!await canAccessLesson(user, lessonId, studentId)) {
      return NextResponse.json({ error: "You cannot access these lesson resources." }, { status: 403 });
    }
    const result = await getPostgresPool().query(
      `SELECT source_resource_id, source_type, resource
       FROM public.student_lesson_resources
       WHERE student_id = $1 AND lesson_id = $2
       ORDER BY created_at ASC`,
      [studentId, lessonId],
    );
    return NextResponse.json({ resources: result.rows });
  } catch (error) {
    logDatabaseError("PostgreSQL student lesson resources query failed:", error);
    return NextResponse.json({ error: "Unable to load lesson resources." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to update lesson resources." }, { status: 401 });
  const body = await parseBody(request);
  if (!body) return NextResponse.json({ error: "Provide valid lesson resource details." }, { status: 400 });

  const action = typeof body.action === "string" ? body.action : "";
  const lessonId = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : user.id;
  if (!uuidPattern.test(lessonId) || !uuidPattern.test(studentId)) {
    return NextResponse.json({ error: "Provide a valid lesson and student." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    if (!await canAccessLesson(user, lessonId, studentId)) {
      return NextResponse.json({ error: "You cannot update these lesson resources." }, { status: 403 });
    }
    const pool = getPostgresPool();

    if (action === "sync") {
      if (!instructorRoles.has(user.role)) {
        return NextResponse.json({ error: "Only instructors can assign lesson resources." }, { status: 403 });
      }
      const studentIds = Array.isArray(body.studentIds)
        ? [...new Set(body.studentIds.filter((id): id is string => typeof id === "string" && uuidPattern.test(id)))]
        : [];
      const options = isRecord(body.options) ? body.options : {};
      const resourceIds = new Set(Array.isArray(options.resourceIds)
        ? options.resourceIds.filter((id): id is string => typeof id === "string")
        : []);
      const resources = Array.isArray(body.resources)
        ? body.resources.filter((item): item is Record<string, unknown> => isRecord(item))
        : [];
      const customResourcesByStudentId = isRecord(options.customResourcesByStudentId)
        ? options.customResourcesByStudentId
        : {};
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const targetStudentId of studentIds) {
          if (!await canAccessLesson(user, lessonId, targetStudentId)) {
            throw new Error("A selected student is not assigned to this instructor.");
          }
          await client.query(
            `DELETE FROM public.student_lesson_resources
             WHERE student_id = $1 AND lesson_id = $2`,
            [targetStudentId, lessonId],
          );
          for (const item of resources) {
            const resourceId = typeof item.resourceId === "string" ? item.resourceId : "";
            if (!resourceId || !resourceIds.has(resourceId) || !isRecord(item.resource)) continue;
            await client.query(
              `INSERT INTO public.student_lesson_resources
                 (student_id, lesson_id, source_resource_id, source_type, resource)
               VALUES ($1, $2, $3, 'lesson', $4::jsonb)`,
              [targetStudentId, lessonId, resourceId, JSON.stringify(item.resource)],
            );
          }
          const customResources = customResourcesByStudentId[targetStudentId];
          if (Array.isArray(customResources)) {
            for (const item of customResources) {
              if (!isRecord(item) || typeof item.id !== "string" || !isRecord(item.resource)) continue;
              await client.query(
                `INSERT INTO public.student_lesson_resources
                   (student_id, lesson_id, source_resource_id, source_type, resource)
                 VALUES ($1, $2, $3, 'custom', $4::jsonb)`,
                [targetStudentId, lessonId, item.id, JSON.stringify(item.resource)],
              );
            }
          }
        }
        await client.query("COMMIT");
        return NextResponse.json({ saved: true });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    if (action === "clear") {
      if (!instructorRoles.has(user.role)) {
        return NextResponse.json({ error: "Only instructors can clear assigned resources." }, { status: 403 });
      }
      const studentIds = Array.isArray(body.studentIds)
        ? [...new Set(body.studentIds.filter((id): id is string => typeof id === "string" && uuidPattern.test(id)))]
        : [];
      await pool.query(
        `DELETE FROM public.student_lesson_resources
         WHERE lesson_id = $1 AND student_id = ANY($2::uuid[])`,
        [lessonId, studentIds],
      );
      return NextResponse.json({ saved: true });
    }

    if (action === "select" || action === "deselect" || action === "remove-custom") {
      const resourceId = typeof body.resourceId === "string" ? body.resourceId.trim() : "";
      if (!resourceId) return NextResponse.json({ error: "Provide a resource ID." }, { status: 400 });
      if (action === "deselect" || action === "remove-custom") {
        await pool.query(
          `DELETE FROM public.student_lesson_resources
           WHERE student_id = $1 AND lesson_id = $2 AND source_resource_id = $3
             AND source_type = $4`,
          [studentId, lessonId, resourceId, action === "remove-custom" ? "custom" : "lesson"],
        );
      } else {
        if (!isRecord(body.resource)) {
          return NextResponse.json({ error: "Provide the selected resource details." }, { status: 400 });
        }
        await pool.query(
          `INSERT INTO public.student_lesson_resources
             (student_id, lesson_id, source_resource_id, source_type, resource)
           VALUES ($1, $2, $3, 'lesson', $4::jsonb)
           ON CONFLICT (student_id, lesson_id, source_resource_id)
           DO UPDATE SET source_type = 'lesson', resource = EXCLUDED.resource, updated_at = now()`,
          [studentId, lessonId, resourceId, JSON.stringify(body.resource)],
        );
      }
      return NextResponse.json({ saved: true });
    }

    return NextResponse.json({ error: "Unsupported lesson resource action." }, { status: 400 });
  } catch (error) {
    logDatabaseError("PostgreSQL student lesson resource update failed:", error);
    return NextResponse.json({ error: "Unable to update lesson resources." }, { status: 500 });
  }
}
