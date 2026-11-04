import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instructorRoles = new Set(["instructor", "admin"]);

async function requireInstructor() {
  const user = await getServerSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Sign in to manage lesson tracks." }, { status: 401 }) };
  }
  if (!instructorRoles.has(user.role)) {
    return { response: NextResponse.json({ error: "Only instructors can manage lesson tracks." }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query(
      `SELECT id, instructor_id, name, is_archived, created_at, updated_at
       FROM public.lesson_tracks
       WHERE instructor_id = $1 OR $2 = 'admin'
       ORDER BY is_archived, lower(name)`,
      [access.user.id, access.user.role],
    );
    return NextResponse.json({ tracks: result.rows });
  } catch (error) {
    logDatabaseError("Lesson track query failed:", error);
    return NextResponse.json({ error: "Unable to load lesson tracks." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  let name = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body) && "name" in body && typeof body.name === "string") {
      name = body.name.trim();
    }
  } catch {
    return NextResponse.json({ error: "Provide a valid track name." }, { status: 400 });
  }
  if (!name || name.length > 120) {
    return NextResponse.json({ error: "Track names must contain 1 to 120 characters." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query(
      `INSERT INTO public.lesson_tracks (instructor_id, name)
       VALUES ($1, $2)
       RETURNING id, instructor_id, name, is_archived, created_at, updated_at`,
      [access.user.id, name],
    );
    return NextResponse.json({ track: result.rows[0] }, { status: 201 });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "23505") {
      return NextResponse.json({ error: "A track with that name already exists." }, { status: 409 });
    }
    logDatabaseError("Lesson track creation failed:", error);
    return NextResponse.json({ error: "Unable to create the lesson track." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Provide valid track changes." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide valid track changes." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Invalid track ID." }, { status: 400 });
  if (("name" in body && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120))
    || ("is_archived" in body && typeof body.is_archived !== "boolean")
    || (!("name" in body) && !("is_archived" in body))) {
    return NextResponse.json({ error: "Provide a valid track name or archive state." }, { status: 400 });
  }

  const values: unknown[] = [id];
  const updates: string[] = [];
  if ("name" in body) {
    values.push((body.name as string).trim());
    updates.push(`name = $${values.length}`);
  }
  if ("is_archived" in body) {
    values.push(body.is_archived);
    updates.push(`is_archived = $${values.length}`);
  }
  values.push(access.user.id);
  values.push(access.user.role);

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query(
      `UPDATE public.lesson_tracks
       SET ${updates.join(", ")}, updated_at = now()
       WHERE id = $1
         AND (instructor_id = $${values.length - 1} OR $${values.length} = 'admin')
       RETURNING id, instructor_id, name, is_archived, created_at, updated_at`,
      values,
    );
    if (!result.rowCount) return NextResponse.json({ error: "Lesson track not found." }, { status: 404 });
    return NextResponse.json({ track: result.rows[0] });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "23505") {
      return NextResponse.json({ error: "A track with that name already exists." }, { status: 409 });
    }
    logDatabaseError("Lesson track update failed:", error);
    return NextResponse.json({ error: "Unable to update the lesson track." }, { status: 500 });
  }
}
