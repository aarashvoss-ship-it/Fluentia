import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/server/session";
import { deleteS3Object, uploadToS3 } from "@/lib/s3-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getServerSessionUser();
    if (!user) return NextResponse.json({ error: "Sign in before uploading a file." }, { status: 401 });

    const url = new URL(request.url);
    let fileBody = request.body;
    const sizeHeader = request.headers.get("x-file-size") ?? request.headers.get("content-length");
    let fileSize = sizeHeader === null ? undefined : Number(sizeHeader);
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
    if (fileSize !== undefined && (!Number.isSafeInteger(fileSize) || fileSize < 0)) {
      return NextResponse.json({ error: "Provide a valid file size." }, { status: 400 });
    }
    if (fileSize === 0) return NextResponse.json({ error: "Choose a non-empty file to upload." }, { status: 400 });

    const publicUrl = await uploadToS3(
      fileBody,
      fileSize,
      fileName,
      folderName,
      user.id,
      contentType,
    );
    return NextResponse.json({ url: publicUrl }, { status: 201 });
  } catch (error) {
    console.error("Asset upload API failed:", error);
    const detail = error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Unexpected storage error.";
    return NextResponse.json(
      { error: `Unable to save the uploaded file: ${detail}` },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in before deleting a file." }, { status: 401 });

  let url: string;
  try {
    const parsed = await request.json();
    url = parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.url === "string"
      ? parsed.url
      : "";
  } catch {
    return NextResponse.json({ error: "Provide a Paasta S3 file URL." }, { status: 400 });
  }
  if (!url) return NextResponse.json({ error: "Provide a Paasta S3 file URL." }, { status: 400 });

  try {
    const deleted = await deleteS3Object(
      url,
      user.id,
      user.role === "instructor" || user.role === "admin",
    );
    if (!deleted) return NextResponse.json({ error: "The file URL is not in the configured Paasta S3 bucket." }, { status: 400 });
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error("Asset deletion API failed:", error);
    const detail = error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Unexpected storage error.";
    return NextResponse.json({ error: `Unable to delete the file: ${detail}` }, { status: 500 });
  }
}
