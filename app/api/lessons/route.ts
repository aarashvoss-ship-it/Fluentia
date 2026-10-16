import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";
import { assignUnownedSampleLesson } from "@/lib/server/sample-lesson";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instructorRoles = new Set(["instructor", "admin"]);
const lessonSelect = `
  SELECT lesson.*,
         latest.id AS version_id,
         latest.version_number,
         latest.content AS version_content,
         latest.changes_summary,
         latest.version_created_at,
         COALESCE((
           SELECT jsonb_agg(assignments.student_id::text ORDER BY assignments.assigned_at)
           FROM public.lesson_assignments AS assignments
           WHERE assignments.lesson_id = lesson.id AND assignments.status = 'assigned'
         ), '[]'::jsonb) AS assigned_student_ids
  FROM public.lessons AS lesson
  LEFT JOIN LATERAL (
    SELECT versions.id, versions.version_number, versions.content,
           versions.changes_summary, versions.created_at AS version_created_at
    FROM public.lesson_versions AS versions
    WHERE versions.lesson_id = lesson.id
    ORDER BY versions.version_number DESC, versions.created_at DESC
    LIMIT 1
  ) AS latest ON true
`;

function lessonFromRow(row: Record<string, unknown>): Record<string, unknown> & {
  status?: unknown;
  student_id?: unknown;
  assigned_all_students?: unknown;
  assigned_student_ids: string[];
} {
  const content = row.version_content && typeof row.version_content === "object"
    ? row.version_content as Record<string, unknown>
    : {};
  const currentVersion = row.version_id
    ? {
        id: row.version_id,
        lesson_id: row.id,
        version_number: row.version_number,
        content,
        changes_summary: row.changes_summary ?? null,
        created_at: row.version_created_at,
      }
    : undefined;
  return {
    ...row,
    current_version: currentVersion,
    content,
    assigned_student_ids: Array.isArray(row.assigned_student_ids)
      ? row.assigned_student_ids.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function requireInstructor() {
  const user = await getServerSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Sign in to access lessons." }, { status: 401 }) };
  }
  if (!instructorRoles.has(user.role)) {
    return { response: NextResponse.json({ error: "Only instructors can manage lessons." }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to access lessons." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") || "all";
  const identity = params.get("id")?.trim() || params.get("studentId")?.trim() || "";
  if (scope === "all" && !instructorRoles.has(user.role)) {
    return NextResponse.json({ error: "Only instructors can access the lesson library." }, { status: 403 });
  }
  if (scope === "instructor" && !instructorRoles.has(user.role)) {
    return NextResponse.json({ error: "Only instructors can access instructor lessons." }, { status: 403 });
  }
  if (scope === "instructor" && user.role !== "admin" && params.get("instructorId") && params.get("instructorId") !== user.id) {
    return NextResponse.json({ error: "You can only access your own lessons." }, { status: 403 });
  }
  if (scope === "student" && user.role === "student" && identity && identity !== user.id) {
    return NextResponse.json({ error: "You can only access your assigned lessons." }, { status: 403 });
  }
  if (scope === "one" && !identity) {
    return NextResponse.json({ error: "Provide a lesson ID or slug." }, { status: 400 });
  }
  if (scope === "versions" && !instructorRoles.has(user.role)) {
    return NextResponse.json({ error: "Only instructors can access lesson versions." }, { status: 403 });
  }

  try {
    await initializeDatabase();
    const pool = getPostgresPool();
    if (scope === "instructor" && user.role === "instructor") {
      await assignUnownedSampleLesson(pool, user.id);
    }
    if (scope === "versions") {
      const lessonId = params.get("lessonId")?.trim() || "";
      if (!uuidPattern.test(lessonId)) return NextResponse.json({ error: "Invalid lesson ID." }, { status: 400 });
      const versions = await pool.query(
        `SELECT id, lesson_id, version_number, content, changes_summary, created_at
         FROM public.lesson_versions WHERE lesson_id = $1 ORDER BY version_number ASC`,
        [lessonId],
      );
      return NextResponse.json({ versions: versions.rows });
    }

    let where = "";
    const values: unknown[] = [];
    if (scope === "one") {
      values.push(identity);
      where = uuidPattern.test(identity)
        ? "WHERE lesson.id::text = $1 OR lesson.slug = $1 OR latest.content->>'slug' = $1"
        : "WHERE lesson.slug = $1 OR latest.content->>'slug' = $1";
    } else if (scope === "student") {
      const studentId = identity || user.id;
      if (!instructorRoles.has(user.role) && studentId !== user.id) {
        return NextResponse.json({ error: "You can only access your assigned lessons." }, { status: 403 });
      }
      values.push(studentId);
      where = `WHERE (lesson.status = 'published' OR lesson.is_published = true)
        AND (lesson.student_id = $1::uuid
          OR lesson.assigned_all_students = true
          OR EXISTS (
            SELECT 1 FROM public.lesson_assignments assignments
            WHERE assignments.lesson_id = lesson.id
              AND assignments.student_id = $1::uuid
              AND assignments.status = 'assigned'
          ))`;
    } else if (scope === "instructor") {
      values.push(params.get("instructorId")?.trim() || user.id);
      where = "WHERE lesson.instructor_id::text = $1";
    }

    const result = await pool.query(`${lessonSelect} ${where} ORDER BY lesson.created_at DESC NULLS LAST`, values);
    let rows = result.rows.map((row) => lessonFromRow(row));
    if (scope === "one" && rows[0] && user.role === "student") {
      const permitted = (rows[0].status === "published" || rows[0].is_published === true)
        && (rows[0].student_id === user.id
          || rows[0].assigned_all_students === true
          || rows[0].assigned_student_ids.includes(user.id));
      if (!permitted) rows = [];
    }
    if (scope === "one") {
      return rows[0]
        ? NextResponse.json({ lesson: rows[0] })
        : NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    }
    return NextResponse.json({ lessons: rows });
  } catch (error) {
    logDatabaseError("PostgreSQL lesson query failed:", error);
    return NextResponse.json({ error: "Unable to load lessons from PostgreSQL." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isRecord(parsed)) return NextResponse.json({ error: "Provide valid lesson details." }, { status: 400 });
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Provide valid lesson details." }, { status: 400 });
  }

  const input = isRecord(body.input) ? body.input : body;
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Untitled Draft";
  const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "lesson";
  const slug = `${slugBase}-${Date.now()}`;
  const status = input.status === "published" || input.status === "evaluated" ? input.status : "draft";
  const content = isRecord(input.content) ? input.content : {};
  const versionContent = { ...content, slug, title };
  const id = randomUUID();
  const client = await getPostgresPool().connect();
  try {
    await initializeDatabase();
    await client.query("BEGIN");
    const lesson = await client.query(
      `INSERT INTO public.lessons
        (id, title, subtitle, module_number, slug, subject, grade, status, is_published,
         banner_url, student_id, student_token, instructor_id, instructor_note, assigned_all_students, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        id,
        title,
        typeof input.subtitle === "string" ? input.subtitle : null,
        Number.isInteger(input.module_number) ? input.module_number : null,
        slug,
        typeof input.subject === "string" ? input.subject : null,
        typeof input.grade === "string" ? input.grade : "B1",
        status,
        input.is_published === true || status === "published",
        typeof input.banner_url === "string" ? input.banner_url : null,
        typeof input.student_id === "string" && uuidPattern.test(input.student_id) ? input.student_id : null,
        typeof input.student_token === "string" ? input.student_token : null,
        typeof input.instructor_id === "string" && uuidPattern.test(input.instructor_id) ? input.instructor_id : access.user.id,
        typeof input.instructor_note === "string" ? input.instructor_note : null,
        input.assigned_all_students === true,
        JSON.stringify(isRecord(input.tags) ? input.tags : {}),
      ],
    );
    const version = await client.query(
      `INSERT INTO public.lesson_versions (lesson_id, version_number, content, changes_summary)
       VALUES ($1, 1, $2::jsonb, $3) RETURNING *`,
      [id, JSON.stringify(versionContent), typeof input.changes_summary === "string" ? input.changes_summary : "Initial version"],
    );
    await client.query("COMMIT");
    return NextResponse.json({ lesson: { ...lesson.rows[0], current_version: version.rows[0], content: versionContent } }, { status: 201 });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logDatabaseError("Lesson creation rollback failed:", rollbackError);
    }
    logDatabaseError("PostgreSQL lesson creation failed:", error);
    return NextResponse.json({ error: "Unable to create lesson." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isRecord(parsed)) return NextResponse.json({ error: "Provide valid lesson changes." }, { status: 400 });
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Provide valid lesson changes." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const action = typeof body.action === "string" ? body.action : "update";
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Invalid lesson ID." }, { status: 400 });
  const client = await getPostgresPool().connect();
  try {
    await initializeDatabase();
    await client.query("BEGIN");
    const current = await client.query(
      `${lessonSelect} WHERE lesson.id = $1 FOR UPDATE OF lesson`,
      [id],
    );
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    }
    if (
      access.user.role !== "admin"
      && current.rows[0].instructor_id
      && current.rows[0].instructor_id !== access.user.id
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "You can only manage your own lessons." }, { status: 403 });
    }
    const lesson = lessonFromRow(current.rows[0]);

    if (action === "assignments") {
      const studentIds = Array.isArray(body.studentIds)
        ? [...new Set(body.studentIds.filter((value): value is string => typeof value === "string" && uuidPattern.test(value)))]
        : [];
      const assignAll = body.assignAll === true;
      await client.query("DELETE FROM public.lesson_assignments WHERE lesson_id = $1", [id]);
      if (studentIds.length) {
        await client.query(
          `INSERT INTO public.lesson_assignments (lesson_id, student_id, status)
           SELECT $1, student.id, 'assigned'
           FROM public.profiles AS student
           WHERE student.id = ANY($2::uuid[]) AND student.role = 'student'
           ON CONFLICT (lesson_id, student_id) DO UPDATE SET status = 'assigned', assigned_at = now()`,
          [id, studentIds],
        );
      }
      const content = {
        ...(isRecord(lesson.content) ? lesson.content : {}),
        assignedAllStudents: assignAll,
        assignedStudents: assignAll ? [] : studentIds,
      };
      await client.query(
        `UPDATE public.lessons
         SET assigned_all_students = $2, student_id = $3, student_token = NULL,
             instructor_id = COALESCE(instructor_id, $4), updated_at = now()
         WHERE id = $1`,
        [id, assignAll, studentIds[0] || null, access.user.id],
      );
      if (isRecord(body.resourceOptions)) {
        const options = body.resourceOptions;
        const resourceStudentIds = Array.isArray(body.resourceStudentIds)
          ? [...new Set(body.resourceStudentIds.filter((value): value is string => typeof value === "string" && uuidPattern.test(value)))]
          : studentIds;
        const selectedResourceIds = new Set(Array.isArray(options.resourceIds)
          ? options.resourceIds.filter((value): value is string => typeof value === "string")
          : []);
        const lessonContent = isRecord(lesson.content) ? lesson.content : {};
        const lessonResources = Array.isArray(lessonContent.lessonResources)
          ? lessonContent.lessonResources.filter((value): value is Record<string, unknown> => isRecord(value))
          : [];
        const customResourcesByStudentId = isRecord(options.customResourcesByStudentId)
          ? options.customResourcesByStudentId
          : {};
        for (const studentId of resourceStudentIds) {
          await client.query(
            `DELETE FROM public.student_lesson_resources
             WHERE lesson_id = $1 AND student_id = $2`,
            [id, studentId],
          );
          for (const resource of lessonResources) {
            const resourceId = typeof resource.id === "string" ? resource.id : "";
            if (!resourceId || !selectedResourceIds.has(resourceId)) continue;
            const type = typeof resource.type === "string" ? resource.type : "";
            const resourceType = type === "Audio" ? "audio"
              : type === "Video" ? "video"
                : type === "Image" ? "image"
                  : type === "PDF" ? "file"
                    : "reading";
            const assignedResource = {
              id: resourceId,
              resource_type: resourceType,
              title: typeof resource.title === "string" ? resource.title : "Lesson resource",
              body: typeof resource.description === "string" ? resource.description : null,
              link_url: typeof resource.url === "string" ? resource.url : null,
              original_filename: type === "PDF" && typeof resource.title === "string" ? resource.title : null,
              resourceHubAssetId: typeof resource.resourceHubAssetId === "string" ? resource.resourceHubAssetId : null,
              is_external_url: typeof resource.url === "string" && !resource.url.includes("/storage/v1/object/"),
            };
            await client.query(
              `INSERT INTO public.student_lesson_resources
                 (student_id, lesson_id, source_resource_id, source_type, resource)
               VALUES ($1, $2, $3, 'lesson', $4::jsonb)`,
              [studentId, id, resourceId, JSON.stringify(assignedResource)],
            );
          }
          const customResources = customResourcesByStudentId[studentId];
          if (Array.isArray(customResources)) {
            for (const customResource of customResources) {
              if (!isRecord(customResource) || typeof customResource.id !== "string" || !isRecord(customResource.resource)) continue;
              await client.query(
                `INSERT INTO public.student_lesson_resources
                   (student_id, lesson_id, source_resource_id, source_type, resource)
                 VALUES ($1, $2, $3, 'custom', $4::jsonb)`,
                [studentId, id, customResource.id, JSON.stringify(customResource.resource)],
              );
            }
          }
        }
      }
      const versionNumber = Number((await client.query(
        "SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM public.lesson_versions WHERE lesson_id = $1",
        [id],
      )).rows[0].next);
      await client.query(
        `INSERT INTO public.lesson_versions (lesson_id, version_number, content, changes_summary)
         VALUES ($1, $2, $3::jsonb, $4)`,
        [id, versionNumber, JSON.stringify(content), typeof body.summary === "string" ? body.summary : "Updated lesson assignments"],
      );
    } else if (action === "publish") {
      const studentId = typeof body.studentId === "string" && uuidPattern.test(body.studentId) ? body.studentId : null;
      await client.query(
        `UPDATE public.lessons SET status = 'published', is_published = true,
          instructor_id = $2, updated_at = now() WHERE id = $1`,
        [id, access.user.id],
      );
      if (studentId) {
        await client.query(
          `INSERT INTO public.lesson_assignments (lesson_id, student_id, status)
           SELECT $1, id, 'assigned' FROM public.profiles
           WHERE id = $2 AND role = 'student'
           ON CONFLICT (lesson_id, student_id) DO UPDATE SET status = 'assigned', assigned_at = now()`,
          [id, studentId],
        );
      }
    } else {
      const input = isRecord(body.input) ? body.input : body;
      const allowedColumns: Record<string, string> = {
        title: "title",
        subtitle: "subtitle",
        module_number: "module_number",
        slug: "slug",
        status: "status",
        subject: "subject",
        grade: "grade",
        assigned_all_students: "assigned_all_students",
        banner_url: "banner_url",
        student_id: "student_id",
        student_token: "student_token",
        instructor_id: "instructor_id",
        instructor_note: "instructor_note",
        instructor_guidance: "instructor_guidance",
        is_published: "is_published",
        tags: "tags",
      };
      const sets: string[] = [];
      const values: unknown[] = [id];
      for (const [key, column] of Object.entries(allowedColumns)) {
        if (!(key in input)) continue;
        values.push(key === "tags" ? JSON.stringify(input[key] || {}) : input[key]);
        sets.push(`${column} = $${values.length}${key === "tags" ? "::jsonb" : ""}`);
      }
      if (sets.length) {
        sets.push("updated_at = now()");
        await client.query(`UPDATE public.lessons SET ${sets.join(", ")} WHERE id = $1`, values);
      }
      if (isRecord(input.content)) {
        const content = {
          ...input.content,
          ...(typeof input.title === "string" ? { title: input.title } : {}),
          ...(typeof input.slug === "string" ? { slug: input.slug } : {}),
        };
        const versionNumber = Number((await client.query(
          "SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM public.lesson_versions WHERE lesson_id = $1",
          [id],
        )).rows[0].next);
        await client.query(
          `INSERT INTO public.lesson_versions (lesson_id, version_number, content, changes_summary)
           VALUES ($1, $2, $3::jsonb, $4)`,
          [id, versionNumber, JSON.stringify(content), typeof input.changes_summary === "string" ? input.changes_summary : "Updated lesson"],
        );
      }
    }

    const updated = await client.query(`${lessonSelect} WHERE lesson.id = $1`, [id]);
    await client.query("COMMIT");
    return NextResponse.json({ lesson: lessonFromRow(updated.rows[0]) });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logDatabaseError("Lesson update rollback failed:", rollbackError);
    }
    logDatabaseError("PostgreSQL lesson update failed:", error);
    return NextResponse.json({ error: "Unable to save lesson changes." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;
  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Invalid lesson ID." }, { status: 400 });
  try {
    await initializeDatabase();
    const result = await getPostgresPool().query<{ id: string; instructor_id: string | null }>(
      "SELECT id, instructor_id::text FROM public.lessons WHERE id = $1",
      [id],
    );
    const lesson = result.rows[0];
    if (!lesson) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    if (access.user.role !== "admin" && lesson.instructor_id && lesson.instructor_id !== access.user.id) {
      return NextResponse.json({ error: "You can only delete your own lessons." }, { status: 403 });
    }
    await getPostgresPool().query("DELETE FROM public.lessons WHERE id = $1", [id]);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    logDatabaseError("PostgreSQL lesson deletion failed:", error);
    return NextResponse.json({ error: "Unable to delete lesson." }, { status: 500 });
  }
}
