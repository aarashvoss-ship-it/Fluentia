import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { StudentId } from "@/types/database";
import type { StudentProfile } from "@/types/lesson";
import { STUDENT_USERS } from "@/lib/users";

export interface StudentProfileRecord {
  student_id?: StudentId;
  /** @deprecated Legacy student_profiles lookup key. */
  student_token: string;
  name?: string;
  level: string;
  learning_goal: string;
  instructor_notes: string;
  assigned_instructor?: string;
  avatar_url?: string;
  banner_url?: string;
  updated_at?: string;
}

export const STUDENT_CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type StudentCefrLevel = (typeof STUDENT_CEFR_LEVELS)[number];

export interface StudentDirectoryEntry {
  id: string;
  token: string;
  name: string;
  email: string;
  enrolledDate: string;
  profile: StudentProfile;
}

export type StudentProfileSaveMode = "database";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function broadcastStudentProfileUpdate(studentToken: string) {
  if (typeof window === "undefined") return;
  const detail = { type: "student-profile", studentToken, updatedAt: new Date().toISOString() };
  window.dispatchEvent(new CustomEvent("fluentia:student-profile-updated", { detail }));
  window.dispatchEvent(new CustomEvent("fluentia:data-updated", { detail }));
  try {
    window.localStorage.setItem("fluentia:profile-updated", JSON.stringify(detail));
  } catch {
    // The in-tab events still refresh the active view when storage is unavailable.
  }
}

export function getStudentProfileNote(profile?: Record<string, unknown> | null) {
  if (!profile) return "";
  for (const key of [
    "teacherNotes",
    "instructorNotes",
    "instructorNote",
    "instructor_note",
    "instructor_notes",
    "dashboard_note",
    "student_dashboard_note",
    "studentDashboardNote",
  ]) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getProfileValue(profile: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!profile) return "";
  for (const key of keys) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeStudentDisplayName(value: string | undefined) {
  if (!value) return value;
  return value.trim().toLowerCase() === "yasaman shebani" ? "Yasaman Sheybani" : value.trim();
}

export function normalizeStudentLevel(value: unknown): StudentCefrLevel | "" {
  if (typeof value !== "string") return "";
  const match = value.trim().toUpperCase().match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  return match ? match[1] as StudentCefrLevel : "";
}

function normalizeStudentProfile(profile: Record<string, unknown> | null, studentToken: string): Partial<StudentProfile> | null {
  if (!profile) return null;
  const targetLevel = normalizeStudentLevel(getProfileValue(profile, ["target_level", "targetLevel", "level"]));
  const focusWeaknesses = Array.isArray(profile.focus_weaknesses)
    ? profile.focus_weaknesses.filter((value): value is string => typeof value === "string")
    : Array.isArray(profile.weaknesses)
      ? profile.weaknesses.filter((value): value is string => typeof value === "string")
      : typeof profile.focus_weaknesses === "string"
        ? profile.focus_weaknesses.split(/[,;\n]+/).map((value) => value.trim()).filter(Boolean)
        : undefined;
  const coreGoal = getProfileValue(profile, [
    "core_goal",
    "target_goal",
    "targetGoal",
    "learningGoal",
    "learning_goal",
    "goal",
  ]);
  return {
    id: studentToken,
    fullName: normalizeStudentDisplayName(getProfileValue(profile, ["full_name", "fullName", "name"])) || undefined,
    email: getProfileValue(profile, ["email"]) || undefined,
    enrolledDate: getProfileValue(profile, ["enrolled_date", "enrolledDate", "created_at"]) || undefined,
    targetLevel: targetLevel || undefined,
    level: targetLevel || undefined,
    targetGoal: coreGoal || undefined,
    core_goal: coreGoal || undefined,
    assignedInstructor: getProfileValue(profile, [
      "assignedInstructor",
      "assigned_instructor",
      "instructor_name",
    ]) || undefined,
    weaknesses: focusWeaknesses,
    teacherNotes: getStudentProfileNote(profile) || undefined,
    avatarUrl: getProfileValue(profile, ["avatar_url", "avatarUrl"]) || undefined,
    bannerUrl: getProfileValue(profile, ["banner_url", "bannerUrl"]) || undefined,
  };
}

export async function saveStudentProfile(
  studentToken: string,
  profile: StudentProfile,
): Promise<StudentProfileSaveMode> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured; student profiles cannot be saved.");

  const response = await fetch("/api/instructor/students", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: profile.id || studentToken, profile }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string; studentId?: string };
  if (!response.ok) throw new Error(result.error || "Unable to save student profile to Supabase.");

  broadcastStudentProfileUpdate(studentToken);
  return "database";
}

export async function getStudentProfile(studentToken: string): Promise<Partial<StudentProfile> | null> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured; student profiles cannot be loaded.");

  const studentQuery = uuidPattern.test(studentToken)
    ? supabase.from("students").select("id,name,email,token,created_at").eq("id", studentToken).maybeSingle()
    : supabase.from("students").select("id,name,email,token,created_at").eq("token", studentToken).maybeSingle();
  const { data: student, error: studentError } = await studentQuery;
  if (studentError) throw studentError;
  if (!student) return null;
  const profileId = student.id;
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", profileId).maybeSingle();
  if (error) throw error;
  if (!profile) return null;
  const normalized = normalizeStudentProfile(profile as Record<string, unknown>, student?.token || studentToken) || {};
  return {
    ...normalized,
    fullName: normalizeStudentDisplayName(typeof profile.full_name === "string" && profile.full_name.trim() ? profile.full_name : student?.name || undefined),
    email: typeof profile.email === "string" && profile.email.trim() ? profile.email : student?.email || undefined,
    enrolledDate: typeof profile.enrolled_date === "string" ? profile.enrolled_date : student?.created_at || undefined,
    targetLevel: normalizeStudentLevel(profile.target_level || profile.level) || undefined,
    level: normalizeStudentLevel(profile.target_level || profile.level) || undefined,
    id: profileId,
  };
}

export async function getStudentDirectory(): Promise<StudentDirectoryEntry[]> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured; the student directory cannot be loaded.");

  const [{ data: students, error: studentsError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from("students").select("id,name,email,token,created_at").order("name", { ascending: true }),
    supabase.from("profiles").select("*").eq("role", "student"),
  ]);
  if (studentsError) throw studentsError;
  if (profilesError) throw profilesError;
  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile as Record<string, unknown>]));

  return (students || []).map((student) => {
    const profile = profilesById.get(student.id);
    const saved = profile ? normalizeStudentProfile(profile, student.token) : null;
    const targetLevel = normalizeStudentLevel(profile?.target_level || profile?.level || saved?.level);
    const rawName = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name : student.name;
    const name = normalizeStudentDisplayName(rawName) || student.name;
    const email = typeof profile?.email === "string" && profile.email.trim() ? profile.email : student.email;
    const enrolledDate = typeof profile?.enrolled_date === "string" ? profile.enrolled_date : student.created_at || "";
    return {
      id: student.id,
      token: student.token,
      name,
      email,
      enrolledDate,
      profile: {
        id: student.id,
        fullName: name,
        email,
        enrolledDate,
        targetLevel,
        level: targetLevel,
        targetGoal: saved?.targetGoal || "",
        weaknesses: saved?.weaknesses || [],
        teacherNotes: saved?.teacherNotes || "",
        assignedInstructor: saved?.assignedInstructor || "",
        attendanceRate: 0,
        completedModulesCount: 0,
      },
    };
  });
}

export async function updateStudentTargetLevel(studentId: string, targetLevel: StudentCefrLevel, studentToken = studentId) {
  if (isSupabaseConfigured() && !uuidPattern.test(studentId)) throw new Error("A valid student profile ID is required.");
  const existing = await getStudentProfile(studentToken) || {};
  const profile: StudentProfile = {
    id: studentId,
    fullName: existing.fullName || STUDENT_USERS.find((student) => student.id === studentId || student.token === studentToken)?.name || "",
    email: existing.email || "",
    enrolledDate: existing.enrolledDate || "",
    level: targetLevel,
    targetLevel,
    targetGoal: existing.targetGoal || "",
    weaknesses: existing.weaknesses || [],
    teacherNotes: existing.teacherNotes || "",
    attendanceRate: 0,
    completedModulesCount: 0,
    avatarUrl: existing.avatarUrl,
    bannerUrl: existing.bannerUrl,
    assignedInstructor: existing.assignedInstructor,
  };
  await saveStudentProfile(studentToken, profile);
}
