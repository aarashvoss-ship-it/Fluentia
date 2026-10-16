import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instructorRoles = new Set(["instructor", "admin"]);
type RouteContext = { params: Promise<{ id: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function requireInstructor() {
  const user = await getServerSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Sign in to manage banners." }, { status: 401 }) };
  }
  if (!instructorRoles.has(user.role)) {
    return { response: NextResponse.json({ error: "Only instructors can manage banners." }, { status: 403 }) };
  }
  return { user };
}

async function getId(context: RouteContext) {
  const { id } = await context.params;
  return uuidPattern.test(id) ? id : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const id = await getId(context);
  if (!id) return NextResponse.json({ error: "Invalid banner ID." }, { status: 400 });

  const user = await getServerSessionUser();
  try {
    await initializeDatabase();
    const result = await getPostgresPool().query(
      `SELECT id, title, message, is_active, created_at
       FROM public.banners WHERE id = $1`,
      [id],
    );
    const banner = result.rows[0];
    if (!banner || (!banner.is_active && (!user || !instructorRoles.has(user.role)))) {
      return NextResponse.json({ error: "Banner not found." }, { status: 404 });
    }
    return NextResponse.json({ banner });
  } catch (error) {
    logDatabaseError("PostgreSQL banner lookup failed:", error);
    return NextResponse.json({ error: "Unable to load banner." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Banner changes must come from this site." }, { status: 403 });
  }
  const access = await requireInstructor();
  if ("response" in access) return access.response;
  const id = await getId(context);
  if (!id) return NextResponse.json({ error: "Invalid banner ID." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide valid banner details." }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Provide valid banner details." }, { status: 400 });
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of ["title", "message", "is_active"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if ((key === "is_active" && typeof value !== "boolean")
      || ((key === "title" || key === "message") && typeof value !== "string")) {
      return NextResponse.json({ error: `Invalid ${key} value.` }, { status: 400 });
    }
    values.push(value);
    fields.push(`${key} = $${values.length}`);
  }
  if (fields.length === 0) {
    return NextResponse.json({ error: "Provide at least one banner field to update." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    values.push(id);
    const result = await getPostgresPool().query(
      `UPDATE public.banners SET ${fields.join(", ")}
       WHERE id = $${values.length}
       RETURNING id, title, message, is_active, created_at`,
      values,
    );
    if (!result.rows[0]) return NextResponse.json({ error: "Banner not found." }, { status: 404 });
    return NextResponse.json({ banner: result.rows[0] });
  } catch (error) {
    logDatabaseError("PostgreSQL banner update failed:", error);
    return NextResponse.json({ error: "Unable to update banner." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Banner changes must come from this site." }, { status: 403 });
  }
  const access = await requireInstructor();
  if ("response" in access) return access.response;
  const id = await getId(context);
  if (!id) return NextResponse.json({ error: "Invalid banner ID." }, { status: 400 });

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query(
      "DELETE FROM public.banners WHERE id = $1 RETURNING id",
      [id],
    );
    if (!result.rowCount) return NextResponse.json({ error: "Banner not found." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    logDatabaseError("PostgreSQL banner deletion failed:", error);
    return NextResponse.json({ error: "Unable to delete banner." }, { status: 500 });
  }
}
