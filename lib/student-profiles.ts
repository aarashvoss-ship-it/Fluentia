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

export type StudentProfileSaveMode = "database" | "local";

const localProfileKey = (studentToken: string) => `fluentia:student-profile:${studentToken}`;
const requestedLocalProfileKey = (studentToken: string) => `student_profile_${studentToken}`;
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

export function normalizeStudentLevel(value: unknown): StudentCefrLevel | "" {
  if (typeof value !== "string") return "";
  const match = value.trim().toUpperCase().match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  return match ? match[1] as StudentCefrLevel : "";
}

function normalizeStudentProfile(profile: Record<string, unknown> | null, studentToken: string): Partial<StudentProfile> | null {
  if (!profile) return null;
  const targetLevel = normalizeStudentLevel(getProfileValue(profile, ["target_level", "targetLevel", "level"]));
  return {
    id: studentToken,
    fullName: getProfileValue(profile, ["full_name", "fullName", "name"]) || undefined,
    email: getProfileValue(profile, ["email"]) || undefined,
    enrolledDate: getProfileValue(profile, ["enrolled_date", "enrolledDate", "created_at"]) || undefined,
    targetLevel: targetLevel || undefined,
    level: targetLevel || undefined,
    targetGoal: getProfileValue(profile, [
      "targetGoal",
      "learningGoal",
      "learning_goal",
      "core_goal",
      "goal",
    ]) || undefined,
    assignedInstructor: getProfileValue(profile, [
      "assignedInstructor",
      "assigned_instructor",
      "instructor_name",
    ]) || undefined,
    weaknesses: Array.isArray(profile.focus_weaknesses)
      ? profile.focus_weaknesses.filter((value): value is string => typeof value === "string")
      : Array.isArray(profile.weaknesses)
        ? profile.weaknesses.filter((value): value is string => typeof value === "string")
        : undefined,
    teacherNotes: getStudentProfileNote(profile) || undefined,
    avatarUrl: getProfileValue(profile, ["avatar_url", "avatarUrl"]) || undefined,
    bannerUrl: getProfileValue(profile, ["banner_url", "bannerUrl"]) || undefined,
  };
}

function isMissingCustomizationColumn(error: { code?: string; message?: string }) {
  return (error.code === "42703" || error.code === "PGRST204")
    && /(avatar_url|banner_url)/i.test(error.message || "");
}

function saveStudentProfileLocally(studentToken: string, profile: StudentProfile) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  const serialized = JSON.stringify(profile);
  window.localStorage.setItem(localProfileKey(studentToken), serialized);
  window.localStorage.setItem(requestedLocalProfileKey(studentToken), serialized);
  return true;
}

function getStudentProfileLocally(studentToken: string): Partial<StudentProfile> | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const stored = window.localStorage.getItem(requestedLocalProfileKey(studentToken))
      || window.localStorage.getItem(localProfileKey(studentToken));
    return normalizeStudentProfile(stored ? JSON.parse(stored) as Record<string, unknown> : null, studentToken);
  } catch {
    return null;
  }
}

export async function saveStudentProfile(
  studentToken: string,
  profile: StudentProfile,
  options: { strict?: boolean } = {},
): Promise<StudentProfileSaveMode> {
  if (!isSupabaseConfigured()) {
    saveStudentProfileLocally(studentToken, profile);
    broadcastStudentProfileUpdate(studentToken);
    return "local";
  }

  try {
    const instructorNotes = getStudentProfileNote(profile as unknown as Record<string, unknown>);
    const profileId = profile.id && uuidPattern.test(profile.id) ? profile.id : "";
    const studentQuery = profileId
      ? supabase.from("students").select("id,token").eq("id", profileId).maybeSingle()
      : supabase.from("students").select("id,token").eq("token", studentToken).maybeSingle();
    const { data: student, error: studentLookupError } = await studentQuery;
    if (studentLookupError) throw studentLookupError;
    const canonicalId = profileId || student?.id || "";
    if (!canonicalId) throw new Error("Unable to resolve the canonical student profile.");

    const targetLevel = normalizeStudentLevel(profile.targetLevel || profile.level);
    const canonicalProfileUpdate = {
      full_name: profile.fullName,
      email: profile.email || null,
      target_level: targetLevel || null,
      level: targetLevel || null,
      enrolled_date: profile.enrolledDate || null,
      target_goal: profile.targetGoal || null,
      focus_weaknesses: profile.weaknesses || [],
      assigned_instructor: profile.assignedInstructor || null,
      instructor_note: instructorNotes || null,
      dashboard_note: instructorNotes || null,
      avatar_url: profile.avatarUrl || null,
      banner_url: profile.bannerUrl || null,
      updated_at: new Date().toISOString(),
    };
    let { error } = await supabase.from("profiles").update(canonicalProfileUpdate).eq("id", canonicalId);
    if (error && isMissingCustomizationColumn(error)) {
      const { avatar_url: _avatarUrl, banner_url: _bannerUrl, ...fallbackUpdate } = canonicalProfileUpdate;
      const fallback = await supabase.from("profiles").update(fallbackUpdate).eq("id", canonicalId);
      error = fallback.error;
    }
    if (error) throw error;

    const { error: studentError } = await supabase.from("students").update({
      name: profile.fullName,
      email: profile.email,
      updated_at: new Date().toISOString(),
    }).eq("id", canonicalId);
    if (studentError) throw studentError;

    saveStudentProfileLocally(studentToken, { ...profile, id: canonicalId, level: targetLevel, targetLevel });
    broadcastStudentProfileUpdate(studentToken);
    return "database";
  } catch (error) {
    if (options.strict) throw error;
    const details = error && typeof error === "object"
      ? error as { message?: string; details?: string; hint?: string; code?: string }
      : {};
    if (details.message || details.details) {
      console.warn("Student profile database sync unavailable; using local storage:", details.message || details.details);
    }
    if (saveStudentProfileLocally(studentToken, profile)) {
      broadcastStudentProfileUpdate(studentToken);
      return "local";
    }
    throw error;
  }
}

export async function getStudentProfile(studentToken: string): Promise<Partial<StudentProfile> | null> {
  if (!isSupabaseConfigured()) return getStudentProfileLocally(studentToken);

  const studentQuery = uuidPattern.test(studentToken)
    ? supabase.from("students").select("id,name,email,token,created_at").eq("id", studentToken).maybeSingle()
    : supabase.from("students").select("id,name,email,token,created_at").eq("token", studentToken).maybeSingle();
  const { data: student } = await studentQuery;
  const profileId = student?.id || (uuidPattern.test(studentToken) ? studentToken : "");
  if (!profileId) return getStudentProfileLocally(studentToken);
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", profileId).maybeSingle();
  if (error || !profile) return getStudentProfileLocally(student?.token || studentToken);
  const normalized = normalizeStudentProfile(profile as Record<string, unknown>, student?.token || studentToken) || {};
  return {
    ...normalized,
    id: profileId,
    fullName: typeof profile.full_name === "string" && profile.full_name.trim() ? profile.full_name : student?.name || undefined,
    email: typeof profile.email === "string" && profile.email.trim() ? profile.email : student?.email || undefined,
    enrolledDate: typeof profile.enrolled_date === "string" ? profile.enrolled_date : student?.created_at || undefined,
    targetLevel: normalizeStudentLevel(profile.target_level || profile.level) || undefined,
    level: normalizeStudentLevel(profile.target_level || profile.level) || undefined,
  };
}

export async function getStudentDirectory(): Promise<StudentDirectoryEntry[]> {
  if (!isSupabaseConfigured()) {
    return Promise.all(STUDENT_USERS.map(async (student) => {
      const savedProfile = await getStudentProfileLocally(student.token);
      const targetLevel = normalizeStudentLevel(savedProfile?.targetLevel || savedProfile?.level || student.profile.level);
      return {
        id: student.id,
        token: student.token,
        name: savedProfile?.fullName || student.name,
        email: savedProfile?.email || student.email || "",
        enrolledDate: savedProfile?.enrolledDate || "",
        profile: { ...student.profile, ...savedProfile, id: student.id, fullName: savedProfile?.fullName || student.name, email: savedProfile?.email || student.email, targetLevel, level: targetLevel },
      };
    }));
  }

  const [{ data: students, error: studentsError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from("students").select("id,name,email,token,created_at").order("name", { ascending: true }),
    supabase.from("profiles").select("*").eq("role", "student"),
  ]);
  if (studentsError) throw studentsError;
  if (profilesError) console.warn("Student profile directory fallback used:", profilesError.message);
  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile as Record<string, unknown>]));

  return (students || []).map((student) => {
    const profile = profilesById.get(student.id);
    const saved = profile ? normalizeStudentProfile(profile, student.token) : null;
    const targetLevel = normalizeStudentLevel(profile?.target_level || profile?.level || saved?.level);
    const name = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name : student.name;
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
        targetGoal: saved?.targetGoal || (typeof profile?.target_goal === "string" ? profile.target_goal : ""),
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
  const localProfile: StudentProfile = {
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
  if (isSupabaseConfigured()) {
    const { error } = await supabase.from("profiles").update({ target_level: targetLevel, level: targetLevel, updated_at: new Date().toISOString() }).eq("id", studentId);
    if (error) throw error;
  }
  saveStudentProfileLocally(studentToken, localProfile);
  saveStudentProfileLocally(studentId, localProfile);
  broadcastStudentProfileUpdate(studentToken);
}
