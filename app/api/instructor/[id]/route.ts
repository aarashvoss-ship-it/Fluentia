import { NextResponse } from "next/server";
import { getInstructorAdminContext } from "@/lib/server/instructor-admin";

const instructorStatuses = new Set(["active", "on_leave"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getInstructorAdminContext();
  if (!context.ok) return NextResponse.json({ error: context.message }, { status: context.status });
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Invalid instructor ID." }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Provide valid instructor profile changes." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name.trim();
  if (typeof body.email === "string") update.email = body.email.trim().toLowerCase();
  if (typeof body.specialization === "string") update.specialization = body.specialization.trim();
  if (typeof body.bio === "string") update.bio = body.bio.trim();
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !instructorStatuses.has(body.status)) {
      return NextResponse.json({ error: "Choose Active or On Leave." }, { status: 400 });
    }
    update.status = body.status;
  }
  if (body.maxStudentCapacity !== undefined) {
    const capacity = Number(body.maxStudentCapacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000) {
      return NextResponse.json({ error: "Capacity must be between 1 and 1000." }, { status: 400 });
    }
    update.max_student_capacity = capacity;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No instructor changes were provided." }, { status: 400 });
  if (typeof update.name === "string" && !update.name) return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
  if (typeof update.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { data, error } = await context.adminClient
    .from("instructors")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,name,email,slug,token,specialization,status,max_student_capacity,bio,created_at,updated_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Instructor not found." }, { status: 404 });
  return NextResponse.json({ instructor: data });
}