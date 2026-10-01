import { NextResponse } from "next/server";
import { getInstructorAdminContext } from "@/lib/server/instructor-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

const instructorStatuses = new Set(["active", "on_leave"]);
const instructorSelect = "id,name,email,slug,token,specialization,status,max_student_capacity,bio,created_at,updated_at";
const requiredInstructorSelect = "id,name,email,slug,token,created_at,updated_at";
const optionalInstructorColumns = ["specialization", "status", "max_student_capacity", "bio"] as const;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Unable to create instructor.";
}

function isMissingColumnError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error
    && (error.code === "42703" || error.code === "PGRST204"));
}

async function upsertInstructorWithSchemaFallback(
  adminClient: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; omittedColumns: string[] }> {
  let currentPayload = { ...payload };
  let selectedColumns = instructorSelect;
  let lastError: unknown;

  while (true) {
    const { data, error } = await adminClient
      .from("instructors")
      .upsert(currentPayload, { onConflict: "id" })
      .select(selectedColumns)
      .single();
    if (!error && data) return {
      data: data as unknown as Record<string, unknown>,
      omittedColumns: optionalInstructorColumns.filter((column) => !(column in currentPayload)),
    };
    lastError = error || new Error("Supabase did not create the instructor record.");
    if (!isMissingColumnError(lastError)) throw lastError;

    const message = getErrorMessage(lastError);
    const missingColumns = optionalInstructorColumns.filter((column) =>
      new RegExp(`\\b${column}\\b`, "i").test(message));
    const columnsToOmit = missingColumns.length > 0 ? missingColumns : optionalInstructorColumns.filter((column) => column in currentPayload);
    if (columnsToOmit.length === 0) throw lastError;

    for (const column of columnsToOmit) delete currentPayload[column];
    selectedColumns = [requiredInstructorSelect, ...optionalInstructorColumns.filter((column) => column in currentPayload)].join(",");
  }
}

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
      context.adminClient.from("instructors").select("*").eq("id", createdAuthUserId).maybeSingle(),
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

    const { data: instructor, omittedColumns } = await upsertInstructorWithSchemaFallback(context.adminClient, {
      id: createdAuthUserId,
      name,
      email,
      slug,
      token,
      specialization,
      status,
      max_student_capacity: existingInstructor?.max_student_capacity || 20,
      bio,
    });

    return NextResponse.json({
      instructor: {
        ...instructor,
        specialization: instructor.specialization ?? specialization,
        status: instructor.status ?? status,
        max_student_capacity: instructor.max_student_capacity ?? 20,
        bio: instructor.bio ?? bio,
      },
      linkedExistingAuthUser: !createdAuthUser,
      ...(omittedColumns.length > 0 ? { warning: `Instructor created, but these database columns are missing: ${omittedColumns.join(", ")}. Apply the instructor profile migration to persist them.` } : {}),
    }, { status: createdAuthUser ? 201 : 200 });
  } catch (error) {
    if (addedAllowlistEmail) await context.adminClient.from("allowed_users").delete().eq("email", email);
    if (createdAuthUser && createdAuthUserId) await context.adminClient.auth.admin.deleteUser(createdAuthUserId);
    const message = getErrorMessage(error);
    console.error("Create instructor error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}