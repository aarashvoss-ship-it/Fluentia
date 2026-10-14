import { NextResponse } from "next/server";
import { getPostgresPool, logDatabaseError } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await getPostgresPool().query<{ now: string }>("SELECT NOW() AS now");
    return NextResponse.json({
      connected: true,
      now: result.rows[0].now,
    });
  } catch (error) {
    logDatabaseError("Database diagnostic query failed:", error);
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
        code:
          error !== null
          && typeof error === "object"
          && "code" in error
          && typeof error.code === "string"
            ? error.code
            : undefined,
      },
      { status: 503 },
    );
  }
}
