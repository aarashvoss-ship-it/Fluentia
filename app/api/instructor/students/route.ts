import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const studentLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

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

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
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
  if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !studentLevels.has(currentLevel)) {
    return NextResponse.json({ error: "Enter a name, valid email address, and CEFR level." }, { status: 400 });
  }
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Student creation requires SUPABASE_SERVICE_ROLE_KEY in the server environment." }, { status: 503 });
  }

  const cookieStore = await cookies();
  const sessionClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // The route only reads the session; cookie refresh is handled by middleware.
        }
      },
    },
  });
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in as an instructor to add a student." }, { status: 401 });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [{ data: instructor }, { data: profile }] = await Promise.all([
    adminClient.from("instructors").select("id").eq("id", user.id).maybeSingle(),
    adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (!instructor && profile?.role !== "admin") {
    return NextResponse.json({ error: "Only instructors can add students." }, { status: 403 });
  }

  let createdAuthUserId: string | null = null;
  try {
    const { data: authResult, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createUserError || !authResult.user) throw createUserError || new Error("Supabase did not create an auth user.");
    createdAuthUserId = authResult.user.id;

    const token = crypto.randomUUID();
    const enrolledDate = new Date().toISOString().slice(0, 10);
    const profileValues = {
      id: createdAuthUserId,
      token,
      full_name: fullName,
      email,
      role: "student",
      level: currentLevel,
      target_level: currentLevel,
      enrolled_date: enrolledDate,
      target_goal: coreGoal || null,
      core_goal: coreGoal || null,
      focus_weaknesses: focusWeaknesses,
      assigned_instructor: assignedInstructor || null,
      dashboard_note: dashboardNote || null,
    };
    const { error: profileInsertError } = await adminClient.from("profiles").insert(profileValues);
    if (profileInsertError) throw profileInsertError;

    const { error: studentInsertError } = await adminClient.from("students").insert({
      id: createdAuthUserId,
      name: fullName,
      email,
      token,
    });
    if (studentInsertError) throw studentInsertError;

    return NextResponse.json({
      student: {
        id: createdAuthUserId,
        token,
        name: fullName,
        email,
        enrolledDate,
        role: "student",
        profile: {
          id: createdAuthUserId,
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
    if (createdAuthUserId) await adminClient.auth.admin.deleteUser(createdAuthUserId);
    const message = error instanceof Error ? error.message : "Unable to create student profile.";
    console.error("Student creation failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}