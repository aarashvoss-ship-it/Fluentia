import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPostgresPool, initializeDatabase, logDatabaseError } from "@/lib/db";
import { getServerSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const studentLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeWeaknesses(value: unknown) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]+/)
      : [];
  return entries
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function requireInstructor() {
  const user = await getServerSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in to manage the student directory." }, { status: 401 }) };
  if (user.role !== "instructor" && user.role !== "admin") {
    return { response: NextResponse.json({ error: "Only instructors can manage the student directory." }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: Request) {
  const identifier = new URL(request.url).searchParams.get("studentId")?.trim();
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to load student profiles." }, { status: 401 });
  if (!identifier && user.role !== "instructor" && user.role !== "admin") {
    return NextResponse.json({ error: "Only instructors can load the student directory." }, { status: 403 });
  }
  try {
    await initializeDatabase();
    if (identifier) {
      const result = await getPostgresPool().query(
        `SELECT users.id, users.email, users.created_at,
                profiles.token, profiles.full_name, profiles.level, profiles.target_level,
                profiles.target_goal, profiles.core_goal, profiles.focus_weaknesses,
                profiles.assigned_instructor, profiles.dashboard_note, profiles.avatar_url,
                profiles.banner_url, profiles.avatar_bg_color, profiles.avatar_initials,
                profiles.enrolled_date
         FROM public.users AS users
         LEFT JOIN public.profiles AS profiles ON profiles.id = users.id
         WHERE ${uuidPattern.test(identifier) ? "users.id::text = $1" : "profiles.token = $1"}
           AND COALESCE(profiles.role, 'student') = 'student'
         LIMIT 1`,
        [identifier],
      );
      if (result.rowCount === 0) return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
      if (user.role === "student" && result.rows[0].id !== user.id) {
        return NextResponse.json({ error: "You can only load your own student profile." }, { status: 403 });
      }
      if (user.role !== "student" && user.role !== "instructor" && user.role !== "admin") {
        return NextResponse.json({ error: "Only students and instructors can load student profiles." }, { status: 403 });
      }
      return NextResponse.json({ student: result.rows[0] });
    }

    const result = await getPostgresPool().query(
      `SELECT users.id, users.email, users.created_at,
              profiles.token, profiles.full_name, profiles.level, profiles.target_level,
              profiles.target_goal, profiles.core_goal, profiles.focus_weaknesses,
              profiles.assigned_instructor, profiles.dashboard_note, profiles.avatar_url,
              profiles.banner_url, profiles.avatar_bg_color, profiles.avatar_initials,
              profiles.enrolled_date
       FROM public.users AS users
       LEFT JOIN public.profiles AS profiles ON profiles.id = users.id
       WHERE COALESCE(profiles.role, 'student') = 'student'
       ORDER BY COALESCE(NULLIF(profiles.full_name, ''), users.email)`,
    );
    return NextResponse.json({ students: result.rows });
  } catch (error) {
    logDatabaseError("PostgreSQL student directory query failed:", error);
    return NextResponse.json({ error: "Unable to load the student directory." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireInstructor();
  if ("response" in access) return access.response;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Provide valid student details." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide valid student details." }, { status: 400 });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const currentLevel = typeof body.currentLevel === "string" ? body.currentLevel.trim().toUpperCase() : "";
  const assignedInstructor = typeof body.assignedInstructor === "string" ? body.assignedInstructor.trim() : "";
  const coreGoal = typeof body.coreGoal === "string" ? body.coreGoal.trim() : "";
  const dashboardNote = typeof body.dashboardNote === "string" ? body.dashboardNote.trim() : "";
  const focusWeaknesses = normalizeWeaknesses(body.focusWeaknesses);
  if (!fullName || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !studentLevels.has(currentLevel)) {
    return NextResponse.json({ error: "Enter a name, valid email address, and CEFR level." }, { status: 400 });
  }

  const client = await getPostgresPool().connect();
  try {
    await initializeDatabase();
    await client.query("BEGIN");
    const userResult = await client.query<{ id: string; email: string }>(
      `INSERT INTO public.users (email)
       VALUES ($1)
       ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING
       RETURNING id, email`,
      [email],
    );
    const user = userResult.rows[0] || (await client.query<{ id: string; email: string }>(
      "SELECT id, email FROM public.users WHERE lower(email) = $1 LIMIT 1",
      [email],
    )).rows[0];
    if (!user) throw new Error("PostgreSQL did not return the student user.");

    const existingProfile = await client.query<{ role: string }>(
      "SELECT role FROM public.profiles WHERE id = $1 FOR UPDATE",
      [user.id],
    );
    if (existingProfile.rows[0]?.role && existingProfile.rows[0].role !== "student") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "That email is already associated with a non-student account." }, { status: 409 });
    }

    const token = existingProfile.rowCount
      ? (await client.query<{ token: string }>("SELECT token FROM public.profiles WHERE id = $1", [user.id])).rows[0].token
      : randomUUID();
    const enrolledDate = new Date().toISOString().slice(0, 10);
    await client.query(
      `INSERT INTO public.profiles
         (id, token, full_name, email, role, level, target_level, enrolled_date,
          target_goal, core_goal, focus_weaknesses, assigned_instructor, dashboard_note)
       VALUES ($1, $2, $3, $4, 'student', $5, $5, $6, $7, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         level = EXCLUDED.level,
         target_level = EXCLUDED.target_level,
         target_goal = EXCLUDED.target_goal,
         core_goal = EXCLUDED.core_goal,
         focus_weaknesses = EXCLUDED.focus_weaknesses,
         assigned_instructor = EXCLUDED.assigned_instructor,
         dashboard_note = EXCLUDED.dashboard_note,
         updated_at = now()`,
      [user.id, token, fullName, email, currentLevel, enrolledDate, coreGoal || null, JSON.stringify(focusWeaknesses), assignedInstructor || null, dashboardNote || null],
    );
    await client.query("COMMIT");
    return NextResponse.json({
      student: {
        id: user.id,
        token,
        name: fullName,
        email,
        enrolledDate,
        role: "student",
        profile: {
          id: user.id,
          fullName,
          email,
          enrolledDate,
          level: currentLevel,
          targetLevel: currentLevel,
          targetGoal: coreGoal,
          weaknesses: focusWeaknesses,
          assignedInstructor,
          teacherNotes: dashboardNote,
          attendanceRate: 0,
          completedModulesCount: 0,
        },
      },
    }, { status: 201 });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logDatabaseError("Student creation transaction rollback failed:", rollbackError);
    }
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    logDatabaseError("PostgreSQL student creation failed:", error);
    return NextResponse.json(
      { error: code === "23505" ? "A student with that email already exists." : "Unable to create the student profile." },
      { status: code === "23505" ? 409 : 500 },
    );
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request) {
  const user = await getServerSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to save student profiles." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Provide valid student profile details." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide valid student profile details." }, { status: 400 });
  }
  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const profile = body.profile && typeof body.profile === "object" && !Array.isArray(body.profile)
    ? body.profile as Record<string, unknown>
    : null;
  if (!studentId || !profile) return NextResponse.json({ error: "Provide a student and profile to update." }, { status: 400 });
  if (user.role === "student" && studentId !== user.id) {
    return NextResponse.json({ error: "You can only update your own student profile." }, { status: 403 });
  }
  if (user.role !== "student" && user.role !== "instructor" && user.role !== "admin") {
    return NextResponse.json({ error: "Only students and instructors can update student profiles." }, { status: 403 });
  }
  const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  const fullName = typeof profile.fullName === "string" ? profile.fullName.trim() : "";
  const targetLevel = typeof profile.targetLevel === "string"
    ? profile.targetLevel.trim().toUpperCase()
    : typeof profile.level === "string" ? profile.level.trim().toUpperCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName || !studentLevels.has(targetLevel)) {
    return NextResponse.json({ error: "Enter a valid name, email address, and CEFR level." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    const pool = getPostgresPool();
    const client = await pool.connect();
    let result;
    try {
      await client.query("BEGIN");
      result = await client.query(
      `UPDATE public.profiles AS profiles
       SET full_name = $2, email = $3, level = $4, target_level = $4,
           target_goal = $5, core_goal = $5, focus_weaknesses = $6,
           assigned_instructor = $7, dashboard_note = $8, avatar_url = $9,
           banner_url = $10, avatar_bg_color = $11, avatar_initials = $12, updated_at = now()
       FROM public.users AS users
       WHERE profiles.id = users.id
         AND COALESCE(profiles.role, 'student') = 'student'
         AND (profiles.id::text = $1 OR profiles.token = $1)
       RETURNING profiles.id`,
      [
        studentId,
        fullName,
        email,
        targetLevel,
        typeof profile.targetGoal === "string" ? profile.targetGoal : "",
        JSON.stringify(normalizeWeaknesses(profile.weaknesses)),
        typeof profile.assignedInstructor === "string" ? profile.assignedInstructor : "",
        typeof profile.teacherNotes === "string" ? profile.teacherNotes : "",
        typeof profile.avatarUrl === "string" ? profile.avatarUrl : null,
        typeof profile.bannerUrl === "string" ? profile.bannerUrl : null,
        typeof profile.avatarBgColor === "string" ? profile.avatarBgColor : null,
        typeof profile.avatarInitials === "string" ? profile.avatarInitials : null,
      ],
      );
      if (result.rowCount && email) {
        await client.query("UPDATE public.users SET email = $2 WHERE id = $1", [result.rows[0].id, email]);
      }
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logDatabaseError("Student profile update rollback failed:", rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
    if (!result.rowCount) return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    return NextResponse.json({ studentId: result.rows[0].id });
  } catch (error) {
    logDatabaseError("PostgreSQL student profile update failed:", error);
    return NextResponse.json({ error: "Unable to save the student profile." }, { status: 500 });
  }
}
