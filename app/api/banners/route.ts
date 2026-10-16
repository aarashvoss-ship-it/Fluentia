import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const instructorRoles = new Set(["instructor", "admin"]);

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

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") || "active";
  if (scope !== "active" && scope !== "all") {
    return NextResponse.json({ error: "Use the active or all banner scope." }, { status: 400 });
  }

  if (scope === "all") {
    const user = await getServerSessionUser();
    if (!user) return NextResponse.json({ error: "Sign in to access all banners." }, { status: 401 });
    if (!instructorRoles.has(user.role)) {
      return NextResponse.json({ error: "Only instructors can access all banners." }, { status: 403 });
    }
  }

  try {
    await initializeDatabase();
    const query = scope === "active"
      ? "SELECT id, title, message, is_active, created_at FROM public.banners WHERE is_active = true ORDER BY created_at DESC"
      : "SELECT id, title, message, is_active, created_at FROM public.banners ORDER BY created_at DESC";
    const result = await getPostgresPool().query(query);
    return NextResponse.json({ banners: result.rows });
  } catch (error) {
    logDatabaseError("PostgreSQL banner query failed:", error);
    return NextResponse.json({ error: "Unable to load banners." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Banner changes must come from this site." }, { status: 403 });
  }
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide valid banner details." }, { status: 400 });
  }
  if (
    !isRecord(body)
    || typeof body.title !== "string"
    || typeof body.message !== "string"
    || (body.is_active !== undefined && typeof body.is_active !== "boolean")
  ) {
    return NextResponse.json({ error: "Provide a title, message, and optional active status." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query(
      `INSERT INTO public.banners (title, message, is_active)
       VALUES ($1, $2, $3)
       RETURNING id, title, message, is_active, created_at`,
      [body.title, body.message, body.is_active ?? true],
    );
    return NextResponse.json({ banner: result.rows[0] }, { status: 201 });
  } catch (error) {
    logDatabaseError("PostgreSQL banner creation failed:", error);
    return NextResponse.json({ error: "Unable to create banner." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Banner changes must come from this site." }, { status: 403 });
  }
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a valid banner action." }, { status: 400 });
  }
  if (!isRecord(body) || body.action !== "deactivateAll") {
    return NextResponse.json({ error: "Provide a supported banner action." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query(
      "UPDATE public.banners SET is_active = false WHERE is_active IS DISTINCT FROM false RETURNING id",
    );
    return NextResponse.json({ deactivated: true, count: result.rowCount ?? 0 });
  } catch (error) {
    logDatabaseError("PostgreSQL bulk banner update failed:", error);
    return NextResponse.json({ error: "Unable to deactivate banners." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Banner changes must come from this site." }, { status: 403 });
  }
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query("DELETE FROM public.banners RETURNING id");
    return NextResponse.json({ deleted: true, count: result.rowCount ?? 0 });
  } catch (error) {
    logDatabaseError("PostgreSQL bulk banner deletion failed:", error);
    return NextResponse.json({ error: "Unable to delete banners." }, { status: 500 });
  }
}
