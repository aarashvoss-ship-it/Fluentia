import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PUBLISHED_CONTENT_LENGTH = 200_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to publish Academis feedback." }, { status: 401 });
  if (user.role !== "instructor" && user.role !== "admin") {
    return NextResponse.json({ error: "Only instructors can publish Academis feedback." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a valid Academis publication request." }, { status: 400 });
  }
  if (!isRecord(body)
    || typeof body.reportId !== "string"
    || !UUID_PATTERN.test(body.reportId)
    || (typeof body.publishedContent !== "string"
      && !Array.isArray(body.publishedContent)
      && !isRecord(body.publishedContent))) {
    return NextResponse.json({ error: "Provide a report and student-facing content to publish." }, { status: 400 });
  }

  const publishedContent = JSON.stringify(body.publishedContent);
  if (publishedContent.length > MAX_PUBLISHED_CONTENT_LENGTH) {
    return NextResponse.json({ error: "Published content exceeds the supported size." }, { status: 413 });
  }

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query<{
      id: string;
      student_id: string;
      module_id: string;
      stage_id: string;
      task_id: string;
      published_content: unknown;
      is_published: boolean;
      updated_at: Date | string;
    }>(
      `UPDATE public.student_task_reports AS report
       SET published_content = $1::jsonb,
           is_published = true
       FROM public.lessons AS lesson
       WHERE report.id = $2::uuid
         AND lesson.id::text = report.module_id
         AND ($3::text = 'admin' OR lesson.instructor_id::text = $4)
       RETURNING report.id::text, report.student_id, report.module_id, report.stage_id,
                 report.task_id, report.published_content, report.is_published, report.updated_at`,
      [publishedContent, body.reportId, user.role, user.id],
    );
    const report = result.rows[0];
    if (!report) {
      return NextResponse.json({ error: "Report not found or you do not have permission to publish it." }, { status: 404 });
    }

    return NextResponse.json({ report });
  } catch (error) {
    logDatabaseError("Unable to publish ACADEMIS student-task report:", error);
    return NextResponse.json({ error: "Unable to publish Academis feedback right now." }, { status: 500 });
  }
}
