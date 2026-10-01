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
  const response = await fetch("/api/instructor", { credentials: "same-origin" });
  const result = await response.json() as { instructors?: Record<string, unknown>[]; error?: string };
  if (!response.ok) throw new Error(result.error || "Unable to load instructor profiles.");

  return (result.instructors || []).map((row) => ({
    id: typeof row.id === "string" ? row.id : "",
    name: typeof row.name === "string" ? row.name : "",
    email: typeof row.email === "string" ? row.email : "",
    slug: typeof row.slug === "string" ? row.slug : "",
    token: typeof row.token === "string" ? row.token : "",
    specialization: typeof row.specialization === "string" ? row.specialization : "",
    status: row.status === "on_leave" ? "on_leave" : "active",
    maxStudentCapacity: Number.isFinite(row.max_student_capacity) ? Number(row.max_student_capacity) : 20,
    assignedCount: 0,
    bio: typeof row.bio === "string" ? row.bio : "",
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : typeof row.created_at === "string" ? row.created_at : "",
  }));
}