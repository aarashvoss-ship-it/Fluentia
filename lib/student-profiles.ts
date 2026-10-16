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
    avatarBgColor: getProfileValue(profile, ["avatar_bg_color", "avatarBgColor", "badgeColor"]) || undefined,
    avatarInitials: getProfileValue(profile, ["avatar_initials", "avatarInitials", "badgeInitials"]) || undefined,
  };
}

export async function saveStudentProfile(
  studentToken: string,
  profile: StudentProfile,
): Promise<StudentProfileSaveMode> {
  const response = await fetch("/api/instructor/students", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: profile.id || studentToken, profile }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string; studentId?: string };
  if (!response.ok) throw new Error(result.error || "Unable to save student profile.");

  broadcastStudentProfileUpdate(studentToken);
  return "database";
}

export async function getStudentProfile(studentToken: string): Promise<Partial<StudentProfile> | null> {
  const response = await fetch(`/api/instructor/students?studentId=${encodeURIComponent(studentToken)}`);
  const result = await response.json().catch(() => ({})) as {
    error?: string;
    student?: Record<string, unknown> & { id?: string; token?: string | null; email?: string; created_at?: string; full_name?: string };
  };
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(result.error || "Unable to load the student profile.");
  }
  const student = result.student;
  if (!student) return null;
  const profileId = typeof student.id === "string" ? student.id : studentToken;
  const token = typeof student.token === "string" && student.token ? student.token : profileId;
  const normalized = normalizeStudentProfile(student, token) || {};
  return {
    ...normalized,
    fullName: normalizeStudentDisplayName(typeof student.full_name === "string" && student.full_name.trim() ? student.full_name : undefined),
    email: typeof student.email === "string" && student.email.trim() ? student.email : undefined,
    enrolledDate: typeof student.enrolled_date === "string" ? student.enrolled_date : student.created_at || undefined,
    targetLevel: normalizeStudentLevel(student.target_level || student.level) || undefined,
    level: normalizeStudentLevel(student.target_level || student.level) || undefined,
    id: profileId,
  };
}

export async function getStudentDirectory(): Promise<StudentDirectoryEntry[]> {
  const response = await fetch("/api/instructor/students");
  const result = await response.json().catch(() => ({})) as { error?: string; students?: Record<string, unknown>[] };
  if (!response.ok) throw new Error(result.error || "Unable to load the student directory.");

  return (result.students || []).map((student) => {
    const id = typeof student.id === "string" ? student.id : "";
    const token = typeof student.token === "string" && student.token ? student.token : id;
    const saved = normalizeStudentProfile(student, token);
    const targetLevel = normalizeStudentLevel(student.target_level || student.level || saved?.level);
    const rawName = typeof student.full_name === "string" && student.full_name.trim()
      ? student.full_name
      : typeof student.email === "string" ? student.email.split("@")[0] : "";
    const name = normalizeStudentDisplayName(rawName) || rawName;
    const email = typeof student.email === "string" ? student.email : "";
    const enrolledDate = typeof student.enrolled_date === "string"
      ? student.enrolled_date
      : typeof student.created_at === "string" ? student.created_at : "";
    return {
      id,
      token,
      name,
      email,
      enrolledDate,
      profile: {
        id,
        fullName: name,
        email,
        enrolledDate,
        targetLevel,
        level: targetLevel,
        targetGoal: saved?.targetGoal || "",
        weaknesses: saved?.weaknesses || [],
        teacherNotes: saved?.teacherNotes || "",
        assignedInstructor: saved?.assignedInstructor || "",
        avatarUrl: saved?.avatarUrl,
        bannerUrl: saved?.bannerUrl,
        avatarBgColor: saved?.avatarBgColor,
        avatarInitials: saved?.avatarInitials,
        attendanceRate: 0,
        completedModulesCount: 0,
      },
    };
  });
}

export async function updateStudentTargetLevel(studentId: string, targetLevel: StudentCefrLevel, studentToken = studentId) {
  if (!uuidPattern.test(studentId)) throw new Error("A valid student profile ID is required.");
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
    avatarBgColor: existing.avatarBgColor,
    avatarInitials: existing.avatarInitials,
    assignedInstructor: existing.assignedInstructor,
  };
  await saveStudentProfile(studentToken, profile);
}
