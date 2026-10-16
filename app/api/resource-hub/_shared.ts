import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/server/session";
import type { ResourceAssetInput } from "@/types/resource-hub";

export const RESOURCE_ASSET_COLUMNS =
  "id,instructor_id,title,description,main_category,sub_category,url,allow_student_download,cefr_level,tags,created_at,updated_at";

const MAIN_CATEGORIES = new Set(["documents", "videos", "audios", "visuals", "others"]);
const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2", "All Levels"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isResourceAssetInput(value: unknown): value is ResourceAssetInput {
  if (!isRecord(value)) return false;
  return typeof value.title === "string"
    && (value.description === undefined || typeof value.description === "string")
    && typeof value.mainCategory === "string"
    && MAIN_CATEGORIES.has(value.mainCategory)
    && typeof value.subCategory === "string"
    && typeof value.url === "string"
    && typeof value.isDownloadable === "boolean"
    && typeof value.cefrLevel === "string"
    && CEFR_LEVELS.has(value.cefrLevel)
    && Array.isArray(value.tags)
    && value.tags.every((tag) => typeof tag === "string");
}

export async function requireInstructor() {
  const user = await getServerSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Sign in as an instructor to manage Resource Hub assets." }, { status: 401 }) };
  }
  if (user.role !== "instructor") {
    return { response: NextResponse.json({ error: "Only instructors can manage Resource Hub assets." }, { status: 403 }) };
  }
  return { user };
}

export async function requireStudyRoomReader() {
  const user = await getServerSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Sign in to access Study Room music." }, { status: 401 }) };
  }
  if (user.role !== "student" && user.role !== "instructor" && user.role !== "admin") {
    return { response: NextResponse.json({ error: "You cannot access Study Room music." }, { status: 403 }) };
  }
  return { user };
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
