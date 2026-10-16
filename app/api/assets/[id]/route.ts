import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to access this file." }, { status: 401 });
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Invalid file identifier." }, { status: 400 });
  try {
    await initializeDatabase();
    const result = await getPostgresPool().query<{ content_type: string; file_name: string; data: Buffer }>(
      `SELECT content_type, file_name, data
       FROM public.media_assets
       WHERE id = $1`,
      [id],
    );
    const asset = result.rows[0];
    if (!asset) return NextResponse.json({ error: "File not found." }, { status: 404 });
    return new NextResponse(new Uint8Array(asset.data), {
      headers: {
        "Content-Type": asset.content_type,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.file_name)}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logDatabaseError("PostgreSQL asset read failed:", error);
    return NextResponse.json({ error: "Unable to read the file." }, { status: 500 });
  }
}
