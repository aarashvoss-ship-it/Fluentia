import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";
import { deleteS3Object, uploadToS3 } from "@/lib/s3-storage";

export const runtime = "nodejs";

const ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in before uploading a file." }, { status: 401 });

  const url = new URL(request.url);
  let fileBody = request.body;
  let fileSize = Number(request.headers.get("x-file-size") || request.headers.get("content-length"));
  let fileName = url.searchParams.get("fileName") || randomUUID();
  let folderName = url.searchParams.get("folder") || "assets";
  let contentType = request.headers.get("content-type") || "application/octet-stream";

  if (contentType.toLowerCase().startsWith("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
      fileBody = file.stream();
      fileSize = file.size;
      fileName = file.name || fileName;
      const folder = formData.get("folder");
      folderName = typeof folder === "string" && folder.trim() ? folder.trim() : folderName;
      contentType = file.type || "application/octet-stream";
    } catch (error) {
      console.error("Asset upload multipart parsing failed:", error);
      return NextResponse.json({ error: "Provide a valid file upload." }, { status: 400 });
    }
  }

  if (!fileBody) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "Provide a valid non-empty file size." }, { status: 400 });
  }

  try {
    const url = await uploadToS3(
      fileBody,
      fileSize,
      fileName,
      folderName,
      user.id,
      contentType,
    );
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error("Asset upload API failed:", error);
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
  if (typeof body.url === "string") {
    try {
      const deleted = await deleteS3Object(
        body.url,
        user.id,
        user.role === "instructor" || user.role === "admin",
      );
      return NextResponse.json({ deleted });
    } catch (error) {
      console.error("Asset deletion API failed:", error);
      return NextResponse.json({ error: "Unable to delete the file." }, { status: 500 });
    }
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
