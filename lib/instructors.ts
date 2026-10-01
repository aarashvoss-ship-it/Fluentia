import { supabase } from "@/lib/supabase";

export type InstructorStatus = "active" | "on_leave";

export interface InstructorDirectoryEntry {
  id: string;
  name: string;
  email: string;
  slug: string;
  token: string;
  specialization: string;
  status: InstructorStatus;
  maxStudentCapacity: number;
  assignedCount: number;
  bio: string;
  createdAt: string;
  updatedAt: string;
}

export async function getInstructorDirectory(): Promise<InstructorDirectoryEntry[]> {
  const { data, error } = await supabase
    .from("instructors")
    .select("id,name,email,slug,token,specialization,status,max_student_capacity,bio,created_at,updated_at")
    .order("name", { ascending: true });
  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    slug: row.slug,
    token: row.token,
    specialization: row.specialization || "",
    status: row.status === "on_leave" ? "on_leave" : "active",
    maxStudentCapacity: Number.isFinite(row.max_student_capacity) ? row.max_student_capacity : 20,
    assignedCount: 0,
    bio: row.bio || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || "",
  }));
}