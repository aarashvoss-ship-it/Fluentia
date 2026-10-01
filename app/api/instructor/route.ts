import { NextResponse } from "next/server";
import { getInstructorAdminContext } from "@/lib/server/instructor-admin";

export async function GET() {
  const context = await getInstructorAdminContext();
  if (!context.ok) return NextResponse.json({ error: context.message }, { status: context.status });

  const { data, error } = await context.adminClient
    .from("instructors")
    .select("*")
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ instructors: data || [] });
}