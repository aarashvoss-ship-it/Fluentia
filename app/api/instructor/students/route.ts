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
    console.error("SUPABASE_SERVICE_ROLE_KEY is undefined; attempting student creation with NEXT_PUBLIC_SUPABASE_ANON_KEY. Admin operations may fail.");
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

  const adminClient = createClient(supabaseUrl, serviceRoleKey || anonKey, {
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

export async function PATCH(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 503 });
  }
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Student profile persistence requires SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide valid student profile details." }, { status: 400 });
  }

  const studentIdentifier = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const profileInput = body.profile && typeof body.profile === "object" && !Array.isArray(body.profile)
    ? body.profile as Record<string, unknown>
    : null;
  if (!studentIdentifier || !profileInput) {
    return NextResponse.json({ error: "Provide a student and profile to update." }, { status: 400 });
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
          // Middleware persists refreshed auth cookies for route requests.
        }
      },
    },
  });
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to save student profiles." }, { status: 401 });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const studentQuery = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentIdentifier)
    ? adminClient.from("students").select("id,token,name,email").eq("id", studentIdentifier).maybeSingle()
    : adminClient.from("students").select("id,token,name,email").eq("token", studentIdentifier).maybeSingle();
  const { data: student, error: studentLookupError } = await studentQuery;
  if (studentLookupError) {
    console.error("Student profile target lookup failed:", studentLookupError);
    return NextResponse.json({ error: "Unable to find the student profile." }, { status: 500 });
  }
  if (!student) return NextResponse.json({ error: "Student profile not found." }, { status: 404 });

  const [{ data: instructor, error: instructorError }, { data: callerProfile, error: callerProfileError }] = await Promise.all([
    adminClient.from("instructors").select("id").eq("id", user.id).maybeSingle(),
    adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (instructorError || callerProfileError) {
    console.error("Student profile permission lookup failed:", instructorError || callerProfileError);
    return NextResponse.json({ error: "Unable to verify permission to update this profile." }, { status: 500 });
  }
  const canManageStudents = Boolean(instructor)
    || callerProfile?.role === "instructor"
    || callerProfile?.role === "admin";
  if (user.id !== student.id && !canManageStudents) {
    return NextResponse.json({ error: "You cannot update this student profile." }, { status: 403 });
  }

  const { data: existingProfile, error: profileLookupError } = await adminClient
    .from("profiles")
    .select("id,role")
    .eq("id", student.id)
    .maybeSingle();
  if (profileLookupError) {
    console.error("Student profile lookup failed:", profileLookupError);
    return NextResponse.json({ error: "Unable to load the student profile." }, { status: 500 });
  }
  if (!existingProfile || existingProfile.role !== "student") {
    return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
  }

  const fullName = typeof profileInput.fullName === "string" ? profileInput.fullName.trim() : student.name;
  const email = typeof profileInput.email === "string" ? profileInput.email.trim().toLowerCase() : student.email;
  const levelInput = typeof profileInput.targetLevel === "string"
    ? profileInput.targetLevel
    : typeof profileInput.level === "string" ? profileInput.level : "";
  const currentLevel = levelInput.trim().toUpperCase();
  const targetLevel = studentLevels.has(currentLevel) ? currentLevel : "";
  if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a name and valid email address." }, { status: 400 });
  }
  const coreGoal = typeof profileInput.targetGoal === "string" ? profileInput.targetGoal.trim() : "";
  const assignedInstructor = typeof profileInput.assignedInstructor === "string" ? profileInput.assignedInstructor.trim() : "";
  const dashboardNote = typeof profileInput.teacherNotes === "string"
    ? profileInput.teacherNotes.trim()
    : typeof profileInput.dashboard_note === "string" ? profileInput.dashboard_note.trim() : "";
  const focusWeaknesses = normalizeWeaknesses(profileInput.weaknesses ?? profileInput.focus_weaknesses);

  const sharedProfileUpdate = {
    full_name: fullName,
    email,
    target_goal: coreGoal || null,
    core_goal: coreGoal || null,
    focus_weaknesses: focusWeaknesses,
    assigned_instructor: assignedInstructor || null,
    dashboard_note: dashboardNote || null,
    updated_at: new Date().toISOString(),
  };
  let profileUpdateResult = await adminClient.from("profiles").update({
    ...sharedProfileUpdate,
    target_level: targetLevel || null,
  }).eq("id", student.id).select("id").maybeSingle();
  if ((profileUpdateResult.error?.code === "42703" || profileUpdateResult.error?.code === "PGRST204")
    && /target_level/i.test(profileUpdateResult.error.message)) {
    console.warn("profiles.target_level is not available; saving the level to the legacy profiles.level column.");
    profileUpdateResult = await adminClient.from("profiles").update({
      ...sharedProfileUpdate,
      level: targetLevel || null,
    }).eq("id", student.id).select("id").maybeSingle();
  }
  const { data: updatedProfile, error: profileUpdateError } = profileUpdateResult;
  if (profileUpdateError) {
    console.error("Student profile database update failed:", {
      code: profileUpdateError.code,
      message: profileUpdateError.message,
      details: profileUpdateError.details,
      hint: profileUpdateError.hint,
    });
    const missingColumn = profileUpdateError.code === "42703" || profileUpdateError.code === "PGRST204";
    const message = missingColumn
      ? `Production Supabase is missing a student profile column (${profileUpdateError.code}). Apply migrations 036, 038, and 039.`
      : `Supabase rejected the student profile update (${profileUpdateError.code || "database error"}): ${profileUpdateError.message}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!updatedProfile) {
    return NextResponse.json({ error: "Supabase did not confirm the student profile update." }, { status: 404 });
  }

  const { data: updatedStudent, error: studentUpdateError } = await adminClient.from("students").update({
    name: fullName,
    email,
    updated_at: new Date().toISOString(),
  }).eq("id", student.id).select("id").maybeSingle();
  if (studentUpdateError) {
    console.error("Student directory database update failed:", studentUpdateError);
    return NextResponse.json({ error: "The profile was saved, but the student directory could not be updated." }, { status: 500 });
  }
  if (!updatedStudent) {
    return NextResponse.json({ error: "The profile was saved, but Supabase did not confirm the directory update." }, { status: 500 });
  }

  return NextResponse.json({ studentId: student.id, token: student.token });
}