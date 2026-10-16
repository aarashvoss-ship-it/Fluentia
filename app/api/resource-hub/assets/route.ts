import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import type { ResourceAssetRow } from "@/types/resource-hub";
import {
  isRecord,
  isResourceAssetInput,
  requireInstructor,
  RESOURCE_ASSET_COLUMNS,
} from "../_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  const instructorId = new URL(request.url).searchParams.get("instructorId")?.trim();
  if (!instructorId) return NextResponse.json({ error: "An instructor ID is required." }, { status: 400 });
  if (instructorId !== access.user.id) {
    return NextResponse.json({ error: "You can only access your own Resource Hub assets." }, { status: 403 });
  }

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query<ResourceAssetRow>(
      `SELECT ${RESOURCE_ASSET_COLUMNS}
       FROM public.resource_assets
       WHERE instructor_id = $1
       ORDER BY created_at DESC`,
      [access.user.id],
    );
    return NextResponse.json({ assets: result.rows });
  } catch (error) {
    logDatabaseError("PostgreSQL Resource Hub asset read failed:", error);
    return NextResponse.json({ error: "Unable to load Resource Hub assets." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide valid Resource Hub asset data." }, { status: 400 });
  }
  if (!isRecord(body) || body.instructorId !== access.user.id || !isResourceAssetInput(body)) {
    return NextResponse.json({ error: "Provide valid Resource Hub asset data for the signed-in instructor." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query<ResourceAssetRow>(
      `INSERT INTO public.resource_assets (
         instructor_id, title, description, main_category, sub_category, url,
         allow_student_download, cefr_level, tags
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${RESOURCE_ASSET_COLUMNS}`,
      [
        access.user.id,
        body.title,
        body.description || null,
        body.mainCategory,
        body.subCategory,
        body.url,
        body.isDownloadable,
        body.cefrLevel,
        body.tags,
      ],
    );
    const asset = result.rows[0];
    if (!asset) throw new Error("The inserted Resource Hub asset was not returned.");
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    logDatabaseError("PostgreSQL Resource Hub asset creation failed:", error);
    return NextResponse.json({ error: "Unable to create Resource Hub asset." }, { status: 500 });
  }
}
