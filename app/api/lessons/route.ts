import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
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
         current_resources.resources AS current_lesson_resources,
         track.name AS track_name,
         track.is_archived AS track_is_archived,
         COALESCE((
           SELECT jsonb_agg(assignments.student_id::text ORDER BY assignments.assigned_at)
           FROM public.lesson_assignments AS assignments
           WHERE assignments.lesson_id = lesson.id AND assignments.status = 'assigned'
         ), '[]'::jsonb) AS assigned_student_ids
  FROM public.lessons AS lesson
  LEFT JOIN public.lesson_tracks AS track ON track.id = lesson.track_id
  LEFT JOIN LATERAL (
    SELECT versions.id, versions.version_number, versions.content,
           versions.changes_summary, versions.created_at AS version_created_at
    FROM public.lesson_versions AS versions
    WHERE versions.lesson_id = lesson.id
    ORDER BY versions.version_number DESC, versions.created_at DESC
    LIMIT 1
  ) AS latest ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(resource_entry.resource ORDER BY resource_entry.position) AS resources
    FROM (
      SELECT
        resource_link.position,
        jsonb_build_object(
          'id', resource_link.lesson_resource_id,
          'resourceHubAssetId', asset.id::text,
          'title', asset.title,
          'url', asset.url,
          'type', CASE asset.resource_type
            WHEN 'audio' THEN 'Audio'
            WHEN 'video' THEN 'Video'
            WHEN 'image' THEN 'Image'
            WHEN 'file' THEN 'PDF'
            ELSE 'Article'
          END,
          'resourceType', asset.resource_type,
          'description', asset.description,
          'mainCategory', asset.main_category,
          'subCategory', asset.sub_category,
          'cefrLevel', asset.cefr_level,
          'isDownloadable', asset.allow_student_download,
          'tags', asset.tags,
          'importedFromResourceHub', true,
          'original_filename', asset.original_filename,
          'media_type', asset.media_type,
          'storage_path', asset.storage_path
        ) || COALESCE(asset.content, '{}'::jsonb) AS resource
      FROM public.lesson_resource_links AS resource_link
      JOIN public.resource_assets AS asset
        ON asset.id = resource_link.resource_asset_id
       AND asset.instructor_id = resource_link.instructor_id
      WHERE resource_link.lesson_id = lesson.id
        AND resource_link.instructor_id = lesson.instructor_id

      UNION ALL

      SELECT
        (legacy.ordinality - 1)::integer AS position,
        legacy.resource
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(latest.content -> 'lessonResources') = 'array'
            THEN latest.content -> 'lessonResources'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS legacy(resource, ordinality)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.lesson_resource_links AS resource_link
        WHERE resource_link.lesson_id = lesson.id
          AND resource_link.instructor_id = lesson.instructor_id
          AND resource_link.lesson_resource_id = legacy.resource ->> 'id'
      )
    ) AS resource_entry
  ) AS current_resources ON true
`;

function lessonFromRow(row: Record<string, unknown>): Record<string, unknown> & {
  status?: unknown;
  student_id?: unknown;
  assigned_all_students?: unknown;
  assigned_student_ids: string[];
} {
  const versionContent = row.version_content && typeof row.version_content === "object"
    ? row.version_content as Record<string, unknown>
    : {};
  const content = { ...versionContent };

  const sidebarBlocks = content.sidebarBlocks ?? content.sidebar_blocks ?? content.sidebarBlocksByStep ?? content.sidebar_blocks_by_step;
  if (sidebarBlocks && typeof sidebarBlocks === "object" && !Array.isArray(sidebarBlocks)) {
    content.sidebarBlocks = sidebarBlocks as Record<string, unknown>;
  }
  if (Array.isArray(row.current_lesson_resources)) {
    content.lessonResources = row.current_lesson_resources;
  }

  const currentVersion = row.version_id
    ? {
        id: row.version_id,
        lesson_id: row.id,
        version_number: row.version_number,
        content: versionContent,
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

const defaultLessonBlockTitles = new Set([
  "text block",
  "audio lesson",
  "video lesson",
  "image",
  "document",
  "question",
  "fill in the blanks",
  "writing prompt",
  "quiz / exercise",
  "sidebar note",
]);

function sanitizeBlockList(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((block) => {
    if (!isRecord(block) || typeof block.title !== "string") return block;
    return defaultLessonBlockTitles.has(block.title.trim().toLowerCase())
      ? { ...block, title: "" }
      : block;
  });
}

function sanitizeLessonBlockTitles(content: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...content };
  for (const [stepKey, stepContent] of Object.entries(sanitized)) {
    if (isRecord(stepContent) && Array.isArray(stepContent.blocks)) {
      sanitized[stepKey] = { ...stepContent, blocks: sanitizeBlockList(stepContent.blocks) };
    }
  }

  for (const key of ["sidebarBlocks", "sidebar_blocks", "sidebarBlocksByStep", "sidebar_blocks_by_step"]) {
    const sidebarBlocks = sanitized[key];
    if (Array.isArray(sidebarBlocks)) {
      sanitized[key] = sanitizeBlockList(sidebarBlocks);
    } else if (isRecord(sidebarBlocks)) {
      sanitized[key] = Object.fromEntries(
        Object.entries(sidebarBlocks).map(([step, blocks]) => [step, sanitizeBlockList(blocks)]),
      );
    }
  }

  return sanitized;
}

const lessonResourceTypes = new Set([
  "note", "reading", "flashcard", "flashcards", "quiz", "audio",
  "data_table", "file", "image", "video", "links",
]);

function normalizeLessonResource(value: unknown) {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const type = value.type;
  const resourceType = value.resourceType;
  if (!id || id.length > 200 || !title || title.length > 500
    || !["PDF", "Article", "Video", "Audio", "Image"].includes(String(type))
    || (resourceType !== undefined && (typeof resourceType !== "string" || !lessonResourceTypes.has(resourceType)))
    || (value.resourceHubAssetId !== undefined && (typeof value.resourceHubAssetId !== "string" || !uuidPattern.test(value.resourceHubAssetId)))
    || (value.url !== undefined && typeof value.url !== "string")) {
    return null;
  }
  const resource: Record<string, unknown> = {
    id,
    title,
    url: typeof value.url === "string" ? value.url : "",
    type,
  };
  const optionalStrings = [
    "resourceType", "description", "mainCategory", "subCategory", "cefrLevel",
    "resourceHubAssetId",
  ] as const;
  optionalStrings.forEach((key) => {
    if (typeof value[key] === "string") resource[key] = value[key];
  });
  const nullableStrings = [
    "body", "question", "answer", "explanation", "subtitle", "sub_title",
    "example", "original_filename", "media_type", "storage_path",
  ] as const;
  nullableStrings.forEach((key) => {
    if (typeof value[key] === "string" || value[key] === null) resource[key] = value[key];
  });
  if (Array.isArray(value.cards)) resource.cards = value.cards;
  if (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")) {
    resource.tags = value.tags;
  }
  if (typeof value.isDownloadable === "boolean") resource.isDownloadable = value.isDownloadable;
  if (typeof value.importedFromResourceHub === "boolean") resource.importedFromResourceHub = value.importedFromResourceHub;
  return resource;
}

class ResourceAssetAccessError extends Error {}

function lessonResourceCategory(resource: Record<string, unknown>) {
  const resourceType = typeof resource.resourceType === "string" ? resource.resourceType : "";
  const mainCategory = ["documents", "videos", "audios", "visuals", "others"].includes(String(resource.mainCategory))
    ? String(resource.mainCategory)
    : resourceType === "audio" ? "audios"
      : resourceType === "video" ? "videos"
        : resourceType === "image" || resourceType === "flashcard" || resourceType === "flashcards" ? "visuals"
          : ["note", "reading", "quiz", "file", "data_table"].includes(resourceType) ? "documents" : "others";
  const defaultSubCategory = resourceType === "flashcard" || resourceType === "flashcards" ? "Flashcards"
    : resourceType === "audio" ? "Podcasts"
      : resourceType === "video" ? "Other Videos"
        : resourceType === "image" ? "Images"
          : resourceType === "file" ? "PDFs"
            : mainCategory === "documents" ? "Texts" : "General";
  return {
    mainCategory,
    subCategory: typeof resource.subCategory === "string" ? resource.subCategory : defaultSubCategory,
  };
}

function lessonResourceContent(resource: Record<string, unknown>) {
  const content: Record<string, unknown> = {};
  for (const key of ["body", "question", "answer", "explanation", "subtitle", "sub_title", "example"]) {
    if (typeof resource[key] === "string" || resource[key] === null) content[key] = resource[key];
  }
  if (Array.isArray(resource.cards)) content.cards = resource.cards;
  return content;
}

function toLessonResourceReference(resource: Record<string, unknown>, assetId: string) {
  const reference: Record<string, unknown> = {
    id: resource.id,
    resourceHubAssetId: assetId,
    title: resource.title,
    url: resource.url,
    type: resource.type,
    resourceType: resource.resourceType || "link",
  };
  for (const key of ["mainCategory", "subCategory", "cefrLevel"] as const) {
    if (typeof resource[key] === "string") reference[key] = resource[key];
  }
  if (typeof resource.isDownloadable === "boolean") reference.isDownloadable = resource.isDownloadable;
  if (Array.isArray(resource.tags)) reference.tags = resource.tags;
  if (resource.importedFromResourceHub === true) reference.importedFromResourceHub = true;
  return reference;
}

async function saveCanonicalLessonResources(
  client: PoolClient,
  instructorId: string,
  lessonId: string,
  resources: Record<string, unknown>[],
) {
  await client.query(
    "UPDATE public.lessons SET instructor_id = COALESCE(instructor_id, $2) WHERE id = $1",
    [lessonId, instructorId],
  );
  const references: Record<string, unknown>[] = [];
  for (let position = 0; position < resources.length; position += 1) {
    const resource = resources[position];
    const resourceId = typeof resource.id === "string" ? resource.id : "";
    if (!resourceId) throw new Error("Every lesson resource must have an ID.");
    const categories = lessonResourceCategory(resource);
    const resourceType = typeof resource.resourceType === "string" ? resource.resourceType : "links";
    const richContent = lessonResourceContent(resource);
    let assetId = typeof resource.resourceHubAssetId === "string" ? resource.resourceHubAssetId : "";
    if (!assetId) {
      const existing = await client.query<{ resource_asset_id: string }>(
        `SELECT resource_asset_id::text
         FROM public.lesson_resource_links
         WHERE lesson_id = $1 AND instructor_id = $2 AND lesson_resource_id = $3`,
        [lessonId, instructorId, resourceId],
      );
      assetId = existing.rows[0]?.resource_asset_id || "";
    }

    const assetValues = [
      instructorId,
      resource.title,
      typeof resource.description === "string" ? resource.description : null,
      categories.mainCategory,
      categories.subCategory,
      typeof resource.url === "string" ? resource.url : "",
      typeof resource.isDownloadable === "boolean" ? resource.isDownloadable : true,
      typeof resource.cefrLevel === "string"
        && ["A1", "A2", "B1", "B2", "C1", "C2", "All Levels"].includes(resource.cefrLevel)
        ? resource.cefrLevel
        : "All Levels",
      Array.isArray(resource.tags) ? resource.tags.filter((tag): tag is string => typeof tag === "string") : [],
      resourceType,
      JSON.stringify(richContent),
      typeof resource.original_filename === "string" ? resource.original_filename : null,
      typeof resource.media_type === "string" ? resource.media_type : null,
      typeof resource.storage_path === "string" ? resource.storage_path : null,
    ];
    let savedAsset;
    if (assetId) {
      savedAsset = await client.query<{ id: string }>(
        `UPDATE public.resource_assets
         SET title = $3, description = $4, main_category = $5, sub_category = $6,
             url = $7, allow_student_download = $8, cefr_level = $9, tags = $10,
             resource_type = $11, content = $12::jsonb, original_filename = $13,
             media_type = $14, storage_path = $15, updated_at = now()
         WHERE id = $1 AND instructor_id = $2
         RETURNING id::text`,
        [assetId, ...assetValues],
      );
      if (!savedAsset.rowCount) throw new ResourceAssetAccessError("The linked Resource Hub asset was not found or is not owned by this instructor.");
    } else {
      savedAsset = await client.query<{ id: string }>(
        `INSERT INTO public.resource_assets (
           instructor_id, title, description, main_category, sub_category, url,
           allow_student_download, cefr_level, tags, resource_type, content,
           original_filename, media_type, storage_path
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
         RETURNING id::text`,
        assetValues,
      );
    }
    const savedAssetId = savedAsset.rows[0]?.id;
    if (!savedAssetId) throw new Error("The canonical lesson resource was not returned after saving.");
    await client.query(
      `INSERT INTO public.lesson_resource_links
         (lesson_id, instructor_id, lesson_resource_id, resource_asset_id, position)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (lesson_id, lesson_resource_id)
       DO UPDATE SET instructor_id = EXCLUDED.instructor_id,
         resource_asset_id = EXCLUDED.resource_asset_id, position = EXCLUDED.position`,
      [lessonId, instructorId, resourceId, savedAssetId, position],
    );
    references.push(toLessonResourceReference(resource, savedAssetId));
  }
  await client.query(
    `DELETE FROM public.lesson_resource_links
     WHERE lesson_id = $1 AND instructor_id = $2
       AND NOT (lesson_resource_id = ANY($3::text[]))`,
    [lessonId, instructorId, resources.map((resource) => resource.id)],
  );
  return references;
}

function toAssignedStudentResource(resource: Record<string, unknown>) {
  const type = typeof resource.type === "string" ? resource.type : "";
  const resourceType = typeof resource.resourceType === "string" ? resource.resourceType
    : type === "Audio" ? "audio"
    : type === "Video" ? "video"
      : type === "Image" ? "image"
        : type === "PDF" ? "file"
          : "reading";
  const url = typeof resource.url === "string" ? resource.url : "";
  return {
    id: resource.id,
    resource_type: resourceType,
    title: resource.title,
    body: typeof resource.body === "string" ? resource.body
      : typeof resource.description === "string" ? resource.description : null,
    link_url: url || null,
    question: typeof resource.question === "string" ? resource.question : null,
    answer: typeof resource.answer === "string" ? resource.answer : null,
    explanation: typeof resource.explanation === "string" ? resource.explanation : null,
    subtitle: typeof resource.subtitle === "string" ? resource.subtitle : null,
    sub_title: typeof resource.sub_title === "string" ? resource.sub_title : null,
    example: typeof resource.example === "string" ? resource.example : null,
    cards: Array.isArray(resource.cards) ? resource.cards : null,
    original_filename: typeof resource.original_filename === "string"
      ? resource.original_filename
      : type === "PDF" && typeof resource.title === "string" ? resource.title : null,
    media_type: typeof resource.media_type === "string" ? resource.media_type : null,
    storage_path: typeof resource.storage_path === "string" ? resource.storage_path : null,
    resourceHubAssetId: typeof resource.resourceHubAssetId === "string" ? resource.resourceHubAssetId : null,
    is_external_url: !url.includes("/storage/v1/object/"),
  };
}

async function propagatePublishedLessonResourceChanges(
  client: PoolClient,
  lesson: Record<string, unknown>,
  nextResources: Record<string, unknown>[],
) {
  if (lesson.status !== "published" && lesson.is_published !== true) return;

  const lessonId = typeof lesson.id === "string" ? lesson.id : "";
  if (!lessonId) return;

  const previousContent = isRecord(lesson.content) ? lesson.content : {};
  const previousResources = Array.isArray(previousContent.lessonResources)
    ? previousContent.lessonResources.filter(isRecord)
    : [];
  const previousById = new Map(previousResources.flatMap((resource) => (
    typeof resource.id === "string" ? [[resource.id, resource] as const] : []
  )));
  const nextById = new Map(nextResources.flatMap((resource) => (
    typeof resource.id === "string" ? [[resource.id, resource] as const] : []
  )));
  const removedIds = [...previousById.keys()].filter((resourceId) => !nextById.has(resourceId));
  const changedResources = [...nextById.values()].filter((resource) => {
    const resourceId = typeof resource.id === "string" ? resource.id : "";
    return JSON.stringify(previousById.get(resourceId)) !== JSON.stringify(resource);
  });
  if (!removedIds.length && !changedResources.length) return;

  const students = await client.query<{ id: string; token: string }>(
    `SELECT student.id::text, student.token
     FROM public.students AS student
     JOIN public.profiles AS profile ON profile.id = student.id
     WHERE COALESCE(profile.role, 'student') = 'student'
       AND (
         student.id = $2::uuid
         OR $3::boolean IS TRUE
         OR EXISTS (
           SELECT 1
           FROM public.lesson_assignments AS assignment
           WHERE assignment.lesson_id = $1::uuid
             AND assignment.student_id = student.id
             AND assignment.status = 'assigned'
         )
       )`,
    [lessonId, typeof lesson.student_id === "string" ? lesson.student_id : null, lesson.assigned_all_students === true],
  );

  for (const student of students.rows) {
    if (removedIds.length) {
      await client.query(
        `DELETE FROM public.student_lesson_resources
         WHERE lesson_id = $1::uuid
           AND student_id = $2::uuid
           AND source_type = 'lesson'
           AND source_resource_id = ANY($3::text[])`,
        [lessonId, student.id, removedIds],
      );
    }
    for (const resource of changedResources) {
      const sourceResourceId = typeof resource.id === "string" ? resource.id : "";
      await client.query(
        `INSERT INTO public.student_lesson_resources
           (student_id, student_token, lesson_id, source_resource_id, source_type, resource)
         VALUES ($1::uuid, $2, $3::uuid, $4, 'lesson', $5::jsonb)
         ON CONFLICT (student_id, lesson_id, source_resource_id)
         DO UPDATE SET source_type = 'lesson', resource = EXCLUDED.resource, updated_at = now()`,
        [student.id, student.token, lessonId, sourceResourceId, JSON.stringify(toAssignedStudentResource(resource))],
      );
    }
  }
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
        AND lesson.is_archived IS NOT TRUE
        AND track.is_archived IS NOT TRUE
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
  const lessonOwnerId = access.user.role === "admin"
    && typeof input.instructor_id === "string"
    && uuidPattern.test(input.instructor_id)
    ? input.instructor_id
    : access.user.id;
  const content = isRecord(input.content) ? sanitizeLessonBlockTitles(input.content) : {};
  const rawLessonResources = Array.isArray(content.lessonResources) ? content.lessonResources : [];
  const initialResources = rawLessonResources.map(normalizeLessonResource);
  if (initialResources.some((resource) => !resource)) {
    return NextResponse.json({ error: "Provide valid lesson resources." }, { status: 400 });
  }
  const initialResourceIds = (initialResources as Record<string, unknown>[]).map((resource) => resource.id);
  if (new Set(initialResourceIds).size !== initialResourceIds.length) {
    return NextResponse.json({ error: "Lesson resource IDs must be unique." }, { status: 400 });
  }
  const trackId = input.track_id === null ? null
    : typeof input.track_id === "string" && uuidPattern.test(input.track_id) ? input.track_id
      : input.track_id === undefined ? null : undefined;
  if (trackId === undefined) {
    return NextResponse.json({ error: "Provide a valid lesson track." }, { status: 400 });
  }
  let versionContent: Record<string, unknown> = { ...content, slug, title };
  const id = randomUUID();
  const client = await getPostgresPool().connect();
  try {
    await initializeDatabase();
    await client.query("BEGIN");
    if (trackId) {
      const ownedTrack = await client.query(
        "SELECT id FROM public.lesson_tracks WHERE id = $1 AND instructor_id = $2",
        [trackId, access.user.id],
      );
      if (!ownedTrack.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Choose a track owned by this instructor." }, { status: 400 });
      }
    }
    await client.query(
      `INSERT INTO public.lessons
        (id, title, subtitle, module_number, slug, subject, grade, status, is_published,
         banner_url, student_id, student_token, instructor_id, instructor_note, assigned_all_students, tags,
         track_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
        lessonOwnerId,
        typeof input.instructor_note === "string" ? input.instructor_note : null,
        input.assigned_all_students === true,
        JSON.stringify(isRecord(input.tags) ? input.tags : {}),
        trackId,
      ],
    );
    if (initialResources.length) {
      const references = await saveCanonicalLessonResources(
        client,
        lessonOwnerId,
        id,
        initialResources as Record<string, unknown>[],
      );
      versionContent = { ...versionContent, lessonResources: references };
    } else if (Array.isArray(content.lessonResources)) {
      versionContent = { ...versionContent, lessonResources: [] };
    }
    const version = await client.query(
      `INSERT INTO public.lesson_versions (lesson_id, version_number, content, changes_summary)
       VALUES ($1, 1, $2::jsonb, $3) RETURNING *`,
      [id, JSON.stringify(versionContent), typeof input.changes_summary === "string" ? input.changes_summary : "Initial version"],
    );
    const savedLesson = await client.query(`${lessonSelect} WHERE lesson.id = $1`, [id]);
    await client.query("COMMIT");
    return NextResponse.json({ lesson: lessonFromRow(savedLesson.rows[0]) }, { status: 201 });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logDatabaseError("Lesson creation rollback failed:", rollbackError);
    }
    logDatabaseError("PostgreSQL lesson creation failed:", error);
    if (error instanceof ResourceAssetAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
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

    if (action === "resource" || action === "resources" || action === "resource-remove") {
      const content = isRecord(lesson.content) ? lesson.content : {};
      const lessonResources = Array.isArray(content.lessonResources)
        ? content.lessonResources.filter(isRecord)
        : [];
      let nextResources: Record<string, unknown>[];
      if (action === "resource-remove") {
        const resourceId = typeof body.resourceId === "string" ? body.resourceId.trim() : "";
        if (!resourceId || !lessonResources.some((resource) => resource.id === resourceId)) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "The lesson resource was not found." }, { status: 404 });
        }
        nextResources = lessonResources.filter((resource) => resource.id !== resourceId);
      } else if (action === "resources") {
        const submittedResources = Array.isArray(body.resources) ? body.resources : null;
        const normalizedResources = submittedResources?.map(normalizeLessonResource) || null;
        if (!normalizedResources || normalizedResources.some((resource) => !resource)) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Provide a valid list of lesson resources." }, { status: 400 });
        }
        nextResources = normalizedResources as Record<string, unknown>[];
        const resourceIds = nextResources.map((resource) => resource.id);
        if (new Set(resourceIds).size !== resourceIds.length) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Lesson resource IDs must be unique." }, { status: 400 });
        }
      } else {
        const nextResource = normalizeLessonResource(body.resource);
        if (!nextResource) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Provide a valid lesson resource." }, { status: 400 });
        }
        nextResources = [
          ...lessonResources.filter((resource) => resource.id !== nextResource.id),
          nextResource,
        ];
      }
      const ownerId = typeof lesson.instructor_id === "string" ? lesson.instructor_id : access.user.id;
      const references = await saveCanonicalLessonResources(client, ownerId, id, nextResources);
      nextResources = nextResources.map((resource, index) => ({
        ...resource,
        resourceHubAssetId: references[index]?.resourceHubAssetId,
      }));
      const nextContent = { ...content, lessonResources: references };
      const currentVersion = isRecord(lesson.current_version) ? lesson.current_version : null;
      if (lesson.status === "draft" && typeof currentVersion?.id === "string") {
        await client.query(
          `UPDATE public.lesson_versions
           SET content = $2::jsonb, changes_summary = $3
           WHERE id = $1 AND lesson_id = $4`,
          [currentVersion.id, JSON.stringify(nextContent), action === "resource-remove" ? "Removed lesson resource" : "Updated lesson resources", id],
        );
      } else {
        const versionNumber = Number((await client.query(
          "SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM public.lesson_versions WHERE lesson_id = $1",
          [id],
        )).rows[0].next);
        await client.query(
          `INSERT INTO public.lesson_versions (lesson_id, version_number, content, changes_summary)
           VALUES ($1, $2, $3::jsonb, $4)`,
          [id, versionNumber, JSON.stringify(nextContent), action === "resource-remove" ? "Removed lesson resource" : "Updated lesson resources"],
        );
      }
      await client.query("UPDATE public.lessons SET updated_at = now() WHERE id = $1", [id]);
      await propagatePublishedLessonResourceChanges(client, lesson, nextResources);
    } else if (action === "assignments") {
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
      const content: Record<string, unknown> = {
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
          const studentResult = await client.query<{ token: string }>(
            "SELECT token FROM public.students WHERE id = $1::uuid",
            [studentId],
          );
          const studentToken = studentResult.rows[0]?.token;
          if (!studentToken) throw new Error("An assigned student is missing its lesson-resource identity.");
          await client.query(
            `DELETE FROM public.student_lesson_resources
             WHERE lesson_id = $1::uuid AND student_id = $2::uuid
               AND source_type = 'lesson'
               AND NOT (source_resource_id = ANY($3::text[]))`,
            [id, studentId, [...selectedResourceIds]],
          );
          for (const resource of lessonResources) {
            const resourceId = typeof resource.id === "string" ? resource.id : "";
            if (!resourceId || !selectedResourceIds.has(resourceId)) continue;
            const type = typeof resource.type === "string" ? resource.type : "";
            const resourceType = typeof resource.resourceType === "string" ? resource.resourceType
              : type === "Audio" ? "audio"
              : type === "Video" ? "video"
                : type === "Image" ? "image"
                  : type === "PDF" ? "file"
                    : "reading";
            const assignedResource = {
              id: resourceId,
              resource_type: resourceType,
              title: typeof resource.title === "string" ? resource.title : "Lesson resource",
              body: typeof resource.body === "string" ? resource.body
                : typeof resource.description === "string" ? resource.description : null,
              link_url: typeof resource.url === "string" ? resource.url : null,
              question: typeof resource.question === "string" ? resource.question : null,
              answer: typeof resource.answer === "string" ? resource.answer : null,
              explanation: typeof resource.explanation === "string" ? resource.explanation : null,
              cards: Array.isArray(resource.cards) ? resource.cards : null,
              original_filename: typeof resource.original_filename === "string"
                ? resource.original_filename
                : type === "PDF" && typeof resource.title === "string" ? resource.title : null,
              media_type: typeof resource.media_type === "string" ? resource.media_type : null,
              storage_path: typeof resource.storage_path === "string" ? resource.storage_path : null,
              resourceHubAssetId: typeof resource.resourceHubAssetId === "string" ? resource.resourceHubAssetId : null,
              is_external_url: typeof resource.url === "string" && !resource.url.includes("/storage/v1/object/"),
            };
            await client.query(
              `INSERT INTO public.student_lesson_resources
                 (student_id, student_token, lesson_id, source_resource_id, source_type, resource)
               VALUES ($1::uuid, $2, $3::uuid, $4, 'lesson', $5::jsonb)
               ON CONFLICT (student_id, lesson_id, source_resource_id)
               DO UPDATE SET student_token = EXCLUDED.student_token,
                 source_type = 'lesson', resource = EXCLUDED.resource, updated_at = now()`,
              [studentId, studentToken, id, resourceId, JSON.stringify(assignedResource)],
            );
          }
          const customResources = customResourcesByStudentId[studentId];
          if (Array.isArray(customResources)) {
            for (const customResource of customResources) {
              if (!isRecord(customResource) || typeof customResource.id !== "string" || !isRecord(customResource.resource)) continue;
              await client.query(
                `INSERT INTO public.student_lesson_resources
                   (student_id, student_token, lesson_id, source_resource_id, source_type, resource)
                 VALUES ($1::uuid, $2, $3::uuid, $4, 'custom', $5::jsonb)
                 ON CONFLICT (student_id, lesson_id, source_resource_id)
                 DO UPDATE SET student_token = EXCLUDED.student_token,
                   source_type = 'custom', resource = EXCLUDED.resource, updated_at = now()`,
                [studentId, studentToken, id, customResource.id, JSON.stringify(customResource.resource)],
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
        track_id: "track_id",
        is_archived: "is_archived",
      };
      if ("track_id" in input) {
        const trackId = input.track_id;
        if (trackId !== null && (typeof trackId !== "string" || !uuidPattern.test(trackId))) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Provide a valid lesson track." }, { status: 400 });
        }
        if (typeof trackId === "string") {
          const trackOwnerId = current.rows[0].instructor_id || access.user.id;
          const ownedTrack = await client.query(
            "SELECT id FROM public.lesson_tracks WHERE id = $1 AND instructor_id = $2",
            [trackId, trackOwnerId],
          );
          if (!ownedTrack.rowCount) {
            await client.query("ROLLBACK");
            return NextResponse.json({ error: "Choose a track owned by this lesson's instructor." }, { status: 400 });
          }
        }
      }
      if ("is_archived" in input && typeof input.is_archived !== "boolean") {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Provide a valid lesson archive state." }, { status: 400 });
      }
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
        let content: Record<string, unknown> = sanitizeLessonBlockTitles({
          ...input.content,
          ...(typeof input.title === "string" ? { title: input.title } : {}),
          ...(typeof input.slug === "string" ? { slug: input.slug } : {}),
        });
        let fullLessonResources: Record<string, unknown>[] | null = null;
        if (Array.isArray(content.lessonResources)) {
          const normalizedResources = content.lessonResources.map(normalizeLessonResource);
          if (normalizedResources.some((resource) => !resource)) {
            await client.query("ROLLBACK");
            return NextResponse.json({ error: "Provide valid lesson resources." }, { status: 400 });
          }
          fullLessonResources = normalizedResources as Record<string, unknown>[];
          const ownerId = typeof lesson.instructor_id === "string" ? lesson.instructor_id : access.user.id;
          const references = await saveCanonicalLessonResources(client, ownerId, id, fullLessonResources);
          fullLessonResources = fullLessonResources.map((resource, index) => ({
            ...resource,
            resourceHubAssetId: references[index]?.resourceHubAssetId,
          }));
          content = { ...content, lessonResources: references };
        }
        const currentVersion = isRecord(lesson.current_version) ? lesson.current_version : null;
        const isDraftSave = input.status === "draft" || (input.status === undefined && lesson.status === "draft");
        const changesSummary = typeof input.changes_summary === "string" ? input.changes_summary : "Updated lesson";
        if (isDraftSave && typeof currentVersion?.id === "string") {
          await client.query(
            `UPDATE public.lesson_versions
             SET content = $2::jsonb, changes_summary = $3
             WHERE id = $1 AND lesson_id = $4`,
            [currentVersion.id, JSON.stringify(content), changesSummary, id],
          );
        } else {
          const versionNumber = Number((await client.query(
            "SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM public.lesson_versions WHERE lesson_id = $1",
            [id],
          )).rows[0].next);
          await client.query(
            `INSERT INTO public.lesson_versions (lesson_id, version_number, content, changes_summary)
             VALUES ($1, $2, $3::jsonb, $4)`,
            [id, versionNumber, JSON.stringify(content), changesSummary],
          );
        }
        if (fullLessonResources) {
          await propagatePublishedLessonResourceChanges(client, lesson, fullLessonResources);
        }
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
    if (error instanceof ResourceAssetAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
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
