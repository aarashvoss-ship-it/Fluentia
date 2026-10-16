import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import type { ResourceAssetRow } from "@/types/resource-hub";
import {
  isRecord,
  isUuid,
  requireInstructor,
  RESOURCE_ASSET_COLUMNS,
} from "../../_shared";

export const runtime = "nodejs";

const UPDATE_COLUMNS: Record<string, string> = {
  title: "title",
  description: "description",
  mainCategory: "main_category",
  subCategory: "sub_category",
  url: "url",
  isDownloadable: "allow_student_download",
  cefrLevel: "cefr_level",
  tags: "tags",
};
const MAIN_CATEGORIES = new Set(["documents", "videos", "audios", "visuals", "others"]);
const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2", "All Levels"]);

function isValidUpdate(body: Record<string, unknown>) {
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !Object.hasOwn(UPDATE_COLUMNS, key))) return false;
  return keys.every((key) => {
    const value = body[key];
    switch (key) {
      case "title":
      case "subCategory":
      case "url":
        return typeof value === "string";
      case "description":
        return typeof value === "string";
      case "mainCategory":
        return typeof value === "string" && MAIN_CATEGORIES.has(value);
      case "isDownloadable":
        return typeof value === "boolean";
      case "cefrLevel":
        return typeof value === "string" && CEFR_LEVELS.has(value);
      case "tags":
        return Array.isArray(value) && value.every((tag) => typeof tag === "string");
      default:
        return false;
    }
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid Resource Hub asset ID." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide valid Resource Hub asset updates." }, { status: 400 });
  }
  if (!isRecord(body) || !isValidUpdate(body)) {
    return NextResponse.json({ error: "Provide at least one valid Resource Hub asset field to update." }, { status: 400 });
  }

  const entries = Object.entries(body);
  const values: unknown[] = [id, access.user.id];
  const assignments = entries.map(([key, value]) => {
    values.push(key === "description" && value === "" ? null : value);
    return `${UPDATE_COLUMNS[key]} = $${values.length}`;
  });
  assignments.push("updated_at = now()");

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query<ResourceAssetRow>(
      `UPDATE public.resource_assets
       SET ${assignments.join(", ")}
       WHERE id = $1 AND instructor_id = $2
       RETURNING ${RESOURCE_ASSET_COLUMNS}`,
      values,
    );
    const asset = result.rows[0];
    if (!asset) return NextResponse.json({ error: "Resource Hub asset was not found or you do not have permission to update it." }, { status: 404 });
    return NextResponse.json({ asset });
  } catch (error) {
    logDatabaseError("PostgreSQL Resource Hub asset update failed:", error);
    return NextResponse.json({ error: "Unable to update Resource Hub asset." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid Resource Hub asset ID." }, { status: 400 });

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query(
      `DELETE FROM public.resource_assets
       WHERE id = $1 AND instructor_id = $2
       RETURNING id`,
      [id, access.user.id],
    );
    if (!result.rowCount) {
      return NextResponse.json({ error: "Resource Hub asset was not found or you do not have permission to delete it." }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    logDatabaseError("PostgreSQL Resource Hub asset deletion failed:", error);
    return NextResponse.json({ error: "Unable to delete Resource Hub asset." }, { status: 500 });
  }
}
