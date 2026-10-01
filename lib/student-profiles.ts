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
const pendingLocalProfileKey = (studentToken: string) => `fluentia:student-profile-pending:${studentToken}`;
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
    fullName: getProfileValue(profile, ["full_name", "fullName", "name"]) || undefined,
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

function normalizeFocusWeaknesses(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => typeof entry === "string" ? entry.trim() : String(entry ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[\n,;]+/).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function normalizeCoreGoal(profile: Partial<StudentProfile> | Record<string, unknown>): string {
  const record = profile as Record<string, unknown>;
  const candidate = [
    record.core_goal,
    record.target_goal,
    record.targetGoal,
    record.learningGoal,
    record.learning_goal,
    record.goal,
    (profile as Partial<StudentProfile>).targetGoal,
    (profile as Partial<StudentProfile>).learningGoal,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return candidate ? candidate.trim() : "";
}

function buildSafeProfileUpdatePayload(profile: Partial<StudentProfile> | Record<string, unknown>) {
  const record = profile as Record<string, unknown>;
  const targetLevel = normalizeStudentLevel((profile as Partial<StudentProfile>).targetLevel ?? (profile as Partial<StudentProfile>).level ?? record.target_level ?? record.level);
  const coreGoal = normalizeCoreGoal(profile);
  const focusWeaknesses = normalizeFocusWeaknesses((profile as Partial<StudentProfile>).weaknesses ?? record.focus_weaknesses ?? record.weaknesses);
  const assignedInstructor = typeof (profile as Partial<StudentProfile>).assignedInstructor === "string"
    ? (profile as Partial<StudentProfile>).assignedInstructor!.trim()
    : typeof record.assigned_instructor === "string"
      ? record.assigned_instructor.trim()
      : typeof record.assignedInstructor === "string"
        ? record.assignedInstructor.trim()
        : "";
  const dashboardNote = getStudentProfileNote(record)
    || (typeof record.dashboard_note === "string" ? record.dashboard_note : "")
    || ((profile as Partial<StudentProfile>).teacherNotes || "");
  const normalizedNote = typeof dashboardNote === "string" ? dashboardNote.trim() : "";
  return {
    target_level: targetLevel || null,
    core_goal: coreGoal || null,
    focus_weaknesses: focusWeaknesses,
    assigned_instructor: assignedInstructor || null,
    dashboard_note: normalizedNote || null,
    updated_at: new Date().toISOString(),
  };
}

function saveStudentProfileLocally(studentToken: string, profile: StudentProfile, pendingSync = true) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const serialized = JSON.stringify(profile);
    window.localStorage.setItem(localProfileKey(studentToken), serialized);
    window.localStorage.setItem(requestedLocalProfileKey(studentToken), serialized);
    if (pendingSync) window.localStorage.setItem(pendingLocalProfileKey(studentToken), "true");
    else window.localStorage.removeItem(pendingLocalProfileKey(studentToken));
    return true;
  } catch {
    return false;
  }
}

function hasPendingLocalStudentProfile(studentToken: string) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(pendingLocalProfileKey(studentToken)) === "true";
  } catch {
    return false;
  }
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
      full_name: profile.fullName || null,
      email: profile.email || null,
      target_level: targetLevel || null,
      core_goal: profile.targetGoal || null,
      focus_weaknesses: normalizeFocusWeaknesses(profile.weaknesses || (profile as Partial<StudentProfile> & Record<string, unknown>).focus_weaknesses),
      assigned_instructor: profile.assignedInstructor || null,
      dashboard_note: instructorNotes || null,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedProfile, error: profileUpdateError } = await supabase
      .from("profiles")
      .update(canonicalProfileUpdate)
      .eq("id", canonicalId)
      .select("id")
      .maybeSingle();
    if (profileUpdateError) throw profileUpdateError;
    if (!updatedProfile) throw new Error("Supabase did not confirm that the student profile was updated.");

    const { error: studentError } = await supabase.from("students").update({
      name: profile.fullName,
      email: profile.email,
      updated_at: new Date().toISOString(),
    }).eq("id", canonicalId);
    if (studentError) throw studentError;

    saveStudentProfileLocally(studentToken, { ...profile, id: canonicalId, level: targetLevel, targetLevel }, false);
    broadcastStudentProfileUpdate(studentToken);
    return "database";
  } catch (error) {
    const details = error && typeof error === "object"
      ? error as { message?: string; details?: string; hint?: string; code?: string }
      : {};
    console.error("Supabase Profile Save Error:", details.message, details.details);
    if (options.strict) {
      if (saveStudentProfileLocally(studentToken, profile)) {
        broadcastStudentProfileUpdate(studentToken);
      }
      throw error;
    }
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
  const resolvedToken = student?.token || studentToken;
  const pendingLocalProfile = hasPendingLocalStudentProfile(resolvedToken)
    ? getStudentProfileLocally(resolvedToken)
    : null;
  return {
    ...normalized,
    fullName: typeof profile.full_name === "string" && profile.full_name.trim() ? profile.full_name : student?.name || undefined,
    email: typeof profile.email === "string" && profile.email.trim() ? profile.email : student?.email || undefined,
    enrolledDate: typeof profile.enrolled_date === "string" ? profile.enrolled_date : student?.created_at || undefined,
    targetLevel: normalizeStudentLevel(profile.target_level || profile.level) || undefined,
    level: normalizeStudentLevel(profile.target_level || profile.level) || undefined,
    ...pendingLocalProfile,
    id: profileId,
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
    const pendingLocalProfile = hasPendingLocalStudentProfile(student.token)
      ? getStudentProfileLocally(student.token)
      : null;
    const effectiveSaved = { ...saved, ...pendingLocalProfile };
    const targetLevel = normalizeStudentLevel(pendingLocalProfile?.targetLevel || profile?.target_level || profile?.level || saved?.level);
    const name = pendingLocalProfile?.fullName || (typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name : student.name);
    const email = pendingLocalProfile?.email || (typeof profile?.email === "string" && profile.email.trim() ? profile.email : student.email);
    const enrolledDate = pendingLocalProfile?.enrolledDate || (typeof profile?.enrolled_date === "string" ? profile.enrolled_date : student.created_at || "");
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
        targetGoal: effectiveSaved.targetGoal || (typeof profile?.target_goal === "string" ? profile.target_goal : ""),
        weaknesses: effectiveSaved.weaknesses || [],
        teacherNotes: effectiveSaved.teacherNotes || "",
        assignedInstructor: effectiveSaved.assignedInstructor || "",
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
    const payload = buildSafeProfileUpdatePayload(localProfile);
    const { error } = await supabase.from("profiles").update(payload).eq("id", studentId);
    if (error) {
      console.error("Supabase Profile Save Error:", error.message, error.details);
      saveStudentProfileLocally(studentToken, localProfile);
      saveStudentProfileLocally(studentId, localProfile);
      broadcastStudentProfileUpdate(studentToken);
      throw error;
    }
    saveStudentProfileLocally(studentToken, localProfile, false);
    saveStudentProfileLocally(studentId, localProfile, false);
  } else {
    saveStudentProfileLocally(studentToken, localProfile);
    saveStudentProfileLocally(studentId, localProfile);
  }
  broadcastStudentProfileUpdate(studentToken);
}
