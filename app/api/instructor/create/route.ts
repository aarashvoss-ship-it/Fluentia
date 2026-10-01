import { NextResponse } from "next/server";
import { getInstructorAdminContext } from "@/lib/server/instructor-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

const instructorStatuses = new Set(["active", "on_leave"]);
const instructorSelect = "id,name,email,slug,token,specialization,status,max_student_capacity,bio,created_at,updated_at";

async function findAuthUserByEmail(adminClient: SupabaseClient, email: string) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.trim().toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export async function POST(request: Request) {
  const context = await getInstructorAdminContext();
  if (!context.ok) return NextResponse.json({ error: context.message }, { status: context.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide valid instructor details." }, { status: 400 });
  }

  const name = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const specialization = typeof body.specialization === "string" ? body.specialization.trim() : "";
  const bio = typeof body.bio === "string" ? body.bio.trim() : "";
  const status = typeof body.status === "string" ? body.status : "active";
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !instructorStatuses.has(status)) {
    return NextResponse.json({ error: "Enter a name, valid email, and valid status." }, { status: 400 });
  }

  let createdAuthUserId: string | null = null;
  let createdAuthUser = false;
  let addedAllowlistEmail = false;
  try {
    const { data: authResult, error: authError } = await context.adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name, role: "instructor" },
    });
    if (authError) {
      if (!/already been registered|already exists|email_exists/i.test(`${authError.message} ${authError.code || ""}`)) throw authError;
      const existingUser = await findAuthUserByEmail(context.adminClient, email);
      if (!existingUser) throw new Error("An Auth account exists for this email, but it could not be found for linking.");
      createdAuthUserId = existingUser.id;
    } else {
      if (!authResult.user) throw new Error("Supabase did not create an auth user.");
      createdAuthUserId = authResult.user.id;
      createdAuthUser = true;
    }

    const { data: existingAllowlistEntry, error: allowlistLookupError } = await context.adminClient
      .from("allowed_users")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (allowlistLookupError) throw allowlistLookupError;
    if (!existingAllowlistEntry) {
      const { error: allowlistInsertError } = await context.adminClient.from("allowed_users").insert({ email });
      if (allowlistInsertError) throw allowlistInsertError;
      addedAllowlistEmail = true;
    }

    const [{ data: existingProfile, error: profileLookupError }, { data: existingInstructor, error: instructorLookupError }, { data: instructorWithEmail, error: emailLookupError }] = await Promise.all([
      context.adminClient.from("profiles").select("token").eq("id", createdAuthUserId).maybeSingle(),
      context.adminClient.from("instructors").select("token,slug,max_student_capacity").eq("id", createdAuthUserId).maybeSingle(),
      context.adminClient.from("instructors").select("id").eq("email", email).maybeSingle(),
    ]);
    if (profileLookupError || instructorLookupError || emailLookupError) {
      throw profileLookupError || instructorLookupError || emailLookupError;
    }
    if (instructorWithEmail && instructorWithEmail.id !== createdAuthUserId) {
      throw new Error("This email is already linked to a different instructor account.");
    }

    const token = existingInstructor?.token || existingProfile?.token || crypto.randomUUID();
    const slugBase = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "instructor";
    const slug = existingInstructor?.slug || `${slugBase}-${token.slice(0, 8)}`;
    const { error: profileError } = await context.adminClient.from("profiles").upsert({
      id: createdAuthUserId,
      token,
      full_name: name,
      email,
      role: "instructor",
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    const { data: instructor, error: instructorError } = await context.adminClient.from("instructors").upsert({
      id: createdAuthUserId,
      name,
      email,
      slug,
      token,
      specialization,
      status,
      max_student_capacity: existingInstructor?.max_student_capacity || 20,
      bio,
    }, { onConflict: "id" }).select(instructorSelect).single();
    if (instructorError || !instructor) throw instructorError || new Error("Supabase did not create the instructor record.");

    return NextResponse.json({ instructor, linkedExistingAuthUser: !createdAuthUser }, { status: createdAuthUser ? 201 : 200 });
  } catch (error) {
    if (addedAllowlistEmail) await context.adminClient.from("allowed_users").delete().eq("email", email);
    if (createdAuthUser && createdAuthUserId) await context.adminClient.auth.admin.deleteUser(createdAuthUserId);
    const message = error instanceof Error ? error.message : "Unable to create instructor.";
    console.error("Instructor creation failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}