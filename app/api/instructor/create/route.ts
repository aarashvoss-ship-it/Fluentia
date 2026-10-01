import { NextResponse } from "next/server";
import { getInstructorAdminContext } from "@/lib/server/instructor-admin";

const instructorStatuses = new Set(["active", "on_leave"]);

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
  let addedAllowlistEmail = false;
  try {
    const { data: authResult, error: authError } = await context.adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name, role: "instructor" },
    });
    if (authError || !authResult.user) throw authError || new Error("Supabase did not create an auth user.");
    createdAuthUserId = authResult.user.id;

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

    const token = crypto.randomUUID();
    const slugBase = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "instructor";
    const slug = `${slugBase}-${token.slice(0, 8)}`;
    const { error: profileError } = await context.adminClient.from("profiles").insert({
      id: createdAuthUserId,
      token,
      full_name: name,
      email,
      role: "instructor",
    });
    if (profileError) throw profileError;

    const { data: instructor, error: instructorError } = await context.adminClient.from("instructors").insert({
      id: createdAuthUserId,
      name,
      email,
      slug,
      token,
      specialization,
      status,
      max_student_capacity: 20,
      bio,
    }).select("id,name,email,slug,token,specialization,status,max_student_capacity,bio,created_at,updated_at").single();
    if (instructorError || !instructor) throw instructorError || new Error("Supabase did not create the instructor record.");

    return NextResponse.json({ instructor }, { status: 201 });
  } catch (error) {
    if (addedAllowlistEmail) await context.adminClient.from("allowed_users").delete().eq("email", email);
    if (createdAuthUserId) await context.adminClient.auth.admin.deleteUser(createdAuthUserId);
    const message = error instanceof Error ? error.message : "Unable to create instructor.";
    console.error("Instructor creation failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}