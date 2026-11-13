import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { areAcademisPromptTitlesUnique } from "@/lib/academis-prompts";
import { isAllowedRequestOrigin } from "@/lib/auth";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const MAX_CATEGORIES = 50;
const MAX_PRESETS = 200;
const MAX_PROMPT_LENGTH = 2500;

interface PromptCategory {
  id: string;
  label: string;
}

interface PromptPreset {
  id: string;
  label: string;
  prompt: string;
  categoryId: string;
  isFavorite: boolean;
  stageId?: string;
  taskId?: string;
}

interface PromptLibrary {
  categories: PromptCategory[];
  presets: PromptPreset[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parsePromptLibrary(value: unknown): PromptLibrary | null {
  if (!isRecord(value) || !Array.isArray(value.categories) || !Array.isArray(value.presets)) return null;
  if (!value.categories.length || !value.presets.length
    || value.categories.length > MAX_CATEGORIES || value.presets.length > MAX_PRESETS) return null;

  const categories: PromptCategory[] = [];
  for (const item of value.categories) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || item.id.length > 120
      || typeof item.label !== "string" || !item.label.trim() || item.label.length > 40) return null;
    categories.push({ id: item.id.trim(), label: item.label.trim() });
  }
  const categoryIds = new Set(categories.map((category) => category.id));
  if (categoryIds.size !== categories.length
    || new Set(categories.map((category) => category.label.toLowerCase())).size !== categories.length) return null;

  const presets: PromptPreset[] = [];
  for (const item of value.presets) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || item.id.length > 120
      || typeof item.label !== "string" || !item.label.trim() || item.label.length > 40
      || typeof item.prompt !== "string" || !item.prompt.trim() || item.prompt.length > MAX_PROMPT_LENGTH
      || typeof item.categoryId !== "string" || !categoryIds.has(item.categoryId)
      || typeof item.isFavorite !== "boolean"
      || (item.stageId !== undefined && (typeof item.stageId !== "string" || !item.stageId.trim() || item.stageId.length > 80))
      || (item.taskId !== undefined && (typeof item.taskId !== "string" || !item.taskId.trim() || item.taskId.length > 200))
      || ((item.stageId === undefined) !== (item.taskId === undefined))) return null;
    presets.push({
      id: item.id.trim(),
      label: item.label.trim(),
      prompt: item.prompt.trim(),
      categoryId: item.categoryId,
      isFavorite: item.isFavorite,
      ...(typeof item.stageId === "string" && typeof item.taskId === "string"
        ? { stageId: item.stageId, taskId: item.taskId }
        : {}),
    });
  }
  if (new Set(presets.map((preset) => preset.id)).size !== presets.length
    || !areAcademisPromptTitlesUnique(presets)
    || presets.filter((preset) => preset.isFavorite).length > 3
    || new Set(presets
      .filter((preset) => preset.stageId && preset.taskId)
      .map((preset) => JSON.stringify([preset.stageId, preset.taskId]))).size
      !== presets.filter((preset) => preset.stageId && preset.taskId).length) return null;

  return { categories, presets };
}

async function requireInstructor() {
  const user = await getServerSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in to manage Academis prompts." }, { status: 401 }) };
  if (user.role !== "instructor" && user.role !== "admin") {
    return { response: NextResponse.json({ error: "Only instructors can manage Academis prompts." }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query<{ library: unknown }>(
      "SELECT library FROM public.academis_prompt_libraries WHERE instructor_id = $1::uuid",
      [access.user.id],
    );
    return NextResponse.json({ library: result.rows[0]?.library ?? null });
  } catch (error) {
    logDatabaseError("Academis prompt library load failed:", error);
    return NextResponse.json({ error: "Unable to load the Academis prompt library." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;
  if (!isAllowedRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a valid prompt library." }, { status: 400 });
  }
  const library = parsePromptLibrary(body);
  if (!library) {
    return NextResponse.json({ error: "The prompt library contains invalid or incomplete categories or prompts." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    await getPostgresPool().query(
      `INSERT INTO public.academis_prompt_libraries (instructor_id, library, updated_at)
       VALUES ($1::uuid, $2::jsonb, now())
       ON CONFLICT (instructor_id) DO UPDATE
       SET library = EXCLUDED.library, updated_at = now()`,
      [access.user.id, JSON.stringify(library)],
    );
    return NextResponse.json({ library });
  } catch (error) {
    logDatabaseError("Academis prompt library save failed:", error);
    return NextResponse.json({ error: "Unable to save the Academis prompt library." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;
  if (!isAllowedRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a prompt to delete." }, { status: 400 });
  }
  if (!isRecord(body) || typeof body.presetId !== "string" || !body.presetId.trim() || body.presetId.length > 120) {
    return NextResponse.json({ error: "Provide a valid prompt to delete." }, { status: 400 });
  }

  const client = await getPostgresPool().connect();
  try {
    await initializeDatabase();
    await client.query("BEGIN");
    const currentResult = await client.query<{ library: unknown }>(
      "SELECT library FROM public.academis_prompt_libraries WHERE instructor_id = $1::uuid FOR UPDATE",
      [access.user.id],
    );
    const current = parsePromptLibrary(currentResult.rows[0]?.library);
    if (!current) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "The prompt library could not be found. Reload and try again." }, { status: 404 });
    }
    const presets = current.presets.filter((preset) => preset.id !== body.presetId);
    if (presets.length === current.presets.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "That prompt no longer exists. Reload the library and try again." }, { status: 404 });
    }
    if (!presets.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Keep at least one prompt in your library." }, { status: 400 });
    }
    const library = { ...current, presets };
    await client.query(
      "UPDATE public.academis_prompt_libraries SET library = $2::jsonb, updated_at = now() WHERE instructor_id = $1::uuid",
      [access.user.id, JSON.stringify(library)],
    );
    await client.query("COMMIT");
    return NextResponse.json({ library });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    logDatabaseError("Academis prompt deletion failed:", error);
    return NextResponse.json({ error: "Unable to delete the Academis prompt." }, { status: 500 });
  } finally {
    client.release();
  }
}
