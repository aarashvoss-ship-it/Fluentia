import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { requireStudyRoomReader } from "../_shared";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireStudyRoomReader();
  if ("response" in access) return access.response;

  try {
    await initializeDatabase();
    const result = await getPostgresPool().query<{ title: string; url: string }>(
      `SELECT title, url
       FROM public.resource_assets
       WHERE main_category = 'audios'
         AND (
           sub_category = 'Study Room Music'
           OR tags @> ARRAY['study-room']::text[]
         )
       ORDER BY created_at DESC`,
    );
    return NextResponse.json({ tracks: result.rows });
  } catch (error) {
    logDatabaseError("PostgreSQL Study Room music read failed:", error);
    return NextResponse.json({ error: "Unable to load Study Room music." }, { status: 500 });
  }
}
