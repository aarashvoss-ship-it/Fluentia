import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getInstructorAdminContext } from "@/lib/server/instructor-admin";
import { logDatabaseError } from "@/lib/db";

const instructorStatuses = new Set(["active", "on_leave"]);

export async function POST(request: Request) {
  const context = await getInstructorAdminContext();
  if (!context.ok) return NextResponse.json({ error: context.message }, { status: context.status });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Provide valid instructor details." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide valid instructor details." }, { status: 400 });
  }
  const name = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const specialization = typeof body.specialization === "string" ? body.specialization.trim() : "";
  const bio = typeof body.bio === "string" ? body.bio.trim() : "";
  const status = typeof body.status === "string" ? body.status : "active";
  if (!name || name.length > 120 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !instructorStatuses.has(status)) {
    return NextResponse.json({ error: "Enter a name, valid email, and valid status." }, { status: 400 });
  }

  const client = await context.pool.connect();
  try {
    await client.query("BEGIN");
    const existingUserResult = await client.query<{ id: string; email: string }>(
      "SELECT id, email FROM public.users WHERE lower(email) = $1 LIMIT 1 FOR UPDATE",
      [email],
    );
    const wasExisting = existingUserResult.rows.length > 0;
    const user = existingUserResult.rows[0] || (await client.query<{ id: string; email: string }>(
      "INSERT INTO public.users (email) VALUES ($1) RETURNING id, email",
      [email],
    )).rows[0];
    if (!user) throw new Error("PostgreSQL did not create the instructor account.");

    const existingProfile = await client.query<{ role: string; token: string }>(
      "SELECT role, token FROM public.profiles WHERE id = $1 FOR UPDATE",
      [user.id],
    );
    if (existingProfile.rows[0]?.role === "student") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This email is already registered to a student account." }, { status: 409 });
    }
    const existingInstructor = await client.query<{ slug: string; token: string; max_student_capacity: number }>(
      "SELECT slug, token, max_student_capacity FROM public.instructors WHERE id = $1",
      [user.id],
    );
    const token = existingInstructor.rows[0]?.token || existingProfile.rows[0]?.token || randomUUID();
    const slugBase = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "instructor";
    const slug = existingInstructor.rows[0]?.slug || `${slugBase}-${token.slice(0, 8)}`;

    await client.query(
      `INSERT INTO public.profiles (id, token, full_name, email, role)
       VALUES ($1, $2, $3, $4, 'instructor')
       ON CONFLICT (id) DO UPDATE SET
         token = EXCLUDED.token, full_name = EXCLUDED.full_name, email = EXCLUDED.email,
         role = 'instructor', updated_at = now()`,
      [user.id, token, name, email],
    );
    const instructorResult = await client.query(
      `INSERT INTO public.instructors
         (id, name, email, slug, token, specialization, status, max_student_capacity, bio)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, email = EXCLUDED.email, specialization = EXCLUDED.specialization,
         status = EXCLUDED.status, bio = EXCLUDED.bio, updated_at = now()
       RETURNING id,name,email,slug,token,specialization,status,max_student_capacity,bio,created_at,updated_at`,
      [
        user.id,
        name,
        email,
        slug,
        token,
        specialization,
        status,
        existingInstructor.rows[0]?.max_student_capacity || 20,
        bio,
      ],
    );
    await client.query(
      "INSERT INTO public.allowed_users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING",
      [email],
    );
    await client.query("COMMIT");
    return NextResponse.json(
      { instructor: instructorResult.rows[0], linkedExistingAccount: wasExisting },
      { status: wasExisting ? 200 : 201 },
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logDatabaseError("Instructor creation rollback failed:", rollbackError);
    }
    logDatabaseError("PostgreSQL instructor creation failed:", error);
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    return NextResponse.json(
      { error: code === "23505" ? "An instructor with that email already exists." : "Unable to create instructor." },
      { status: code === "23505" ? 409 : 500 },
    );
  } finally {
    client.release();
  }
}
