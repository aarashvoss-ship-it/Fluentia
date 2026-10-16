import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in before uploading a file." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Provide a valid file upload." }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_ASSET_BYTES) {
    return NextResponse.json({ error: "File must be no larger than 50 MB." }, { status: 413 });
  }

  try {
    await initializeDatabase();
    const id = randomUUID();
    const result = await getPostgresPool().query(
      `INSERT INTO public.media_assets (id, owner_id, file_name, content_type, data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [id, user.id, file.name.slice(0, 255) || id, file.type || "application/octet-stream", Buffer.from(await file.arrayBuffer())],
    );
    if (!result.rows[0]) throw new Error("Uploaded file record was not returned.");
    return NextResponse.json({ url: `/api/assets/${result.rows[0].id}` }, { status: 201 });
  } catch (error) {
    logDatabaseError("PostgreSQL asset upload failed:", error);
    return NextResponse.json({ error: "Unable to save the uploaded file." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in before deleting a file." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Provide a file identifier." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide a file identifier." }, { status: 400 });
  }
  const assetId = typeof body.id === "string" ? body.id : "";
  if (!ASSET_ID_PATTERN.test(assetId)) return NextResponse.json({ error: "Invalid file identifier." }, { status: 400 });
  try {
    await initializeDatabase();
    const result = await getPostgresPool().query(
      `DELETE FROM public.media_assets
       WHERE id = $1 AND (owner_id = $2 OR $3 IN ('instructor', 'admin'))
       RETURNING id`,
      [assetId, user.id, user.role],
    );
    if (!result.rowCount) return NextResponse.json({ error: "File not found or you cannot delete it." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    logDatabaseError("PostgreSQL asset deletion failed:", error);
    return NextResponse.json({ error: "Unable to delete the file." }, { status: 500 });
  }
}
