import { NextResponse } from "next/server";
import { ensureTablesExist, getPostgresPool, logDatabaseError } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureTablesExist();
    const result = await getPostgresPool().query<{
      now: string;
      waitlist_requests_exists: boolean;
      users_exists: boolean;
      profiles_exists: boolean;
    }>(`
      SELECT
        NOW() AS now,
        to_regclass('public.waitlist_requests') IS NOT NULL AS waitlist_requests_exists,
        to_regclass('public.users') IS NOT NULL AS users_exists,
        to_regclass('public.profiles') IS NOT NULL AS profiles_exists
    `);
    const status = result.rows[0];
    const tables = {
      waitlist_requests: status.waitlist_requests_exists,
      users: status.users_exists,
      profiles: status.profiles_exists,
    };
    const missingTables = Object.entries(tables)
      .filter(([, exists]) => !exists)
      .map(([table]) => table);

    return NextResponse.json(
      {
        connected: true,
        schemaInitialized: missingTables.length === 0,
        tables,
        missingTables,
        now: status.now,
      },
      { status: missingTables.length === 0 ? 200 : 500 },
    );
  } catch (error) {
    logDatabaseError("Database diagnostic query failed:", error);
    const code =
      error !== null
      && typeof error === "object"
      && "code" in error
      && typeof error.code === "string"
        ? error.code
        : undefined;
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
        code,
      },
      { status: 503 },
    );
  }
}
