import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { StudentId } from "@/types/database";
import type { StudentProfile } from "@/types/lesson";

export interface StudentProfileRecord {
  student_id?: StudentId;
  /** @deprecated Legacy student_profiles lookup key. */
  student_token: string;
  name?: string;
  level: string;
  learning_goal: string;
  instructor_notes: string;
  avatar_url?: string;
  banner_url?: string;
  updated_at?: string;
}

export type StudentProfileSaveMode = "database" | "local";

const localProfileKey = (studentToken: string) => `fluentia:student-profile:${studentToken}`;
const requestedLocalProfileKey = (studentToken: string) => `student_profile_${studentToken}`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getStudentProfileNote(profile?: Record<string, unknown> | null) {
  if (!profile) return "";
  for (const key of [
    "teacherNotes",
    "instructorNotes",
    "instructorNote",
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

function normalizeStudentProfile(profile: Record<string, unknown> | null, studentToken: string): Partial<StudentProfile> | null {
  if (!profile) return null;
  return {
    id: studentToken,
    fullName: getProfileValue(profile, ["fullName", "name"]) || undefined,
    level: getProfileValue(profile, ["level"]) || undefined,
    targetGoal: getProfileValue(profile, [
      "targetGoal",
      "learningGoal",
      "learning_goal",
      "core_goal",
      "goal",
    ]) || undefined,
    teacherNotes: getStudentProfileNote(profile) || undefined,
  };
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

export async function saveStudentProfile(studentToken: string, profile: StudentProfile): Promise<StudentProfileSaveMode> {
  if (!isSupabaseConfigured()) {
    saveStudentProfileLocally(studentToken, profile);
    return "local";
  }

  try {
    const instructorNotes = getStudentProfileNote(profile as unknown as Record<string, unknown>);
    let { error } = await supabase.from("student_profiles").upsert({
      student_token: studentToken,
      level: profile.level,
      learning_goal: profile.targetGoal,
      instructor_notes: instructorNotes,
      updated_at: new Date().toISOString(),
    }, { onConflict: "student_token" });

    if (error && /column|schema cache/i.test(error.message || "")) {
      const fallback = await supabase.from("student_profiles").upsert({
        student_token: studentToken,
        level: profile.level,
        core_goal: profile.targetGoal,
        dashboard_note: instructorNotes,
        updated_at: new Date().toISOString(),
      }, { onConflict: "student_token" });
      error = fallback.error;
    }
    if (error) throw error;

    if (profile.id && uuidPattern.test(profile.id)) {
      const { error: canonicalProfileError } = await supabase
        .from("profiles")
        .update({
          level: profile.level || null,
          learning_goal: profile.targetGoal || null,
          instructor_note: instructorNotes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      if (canonicalProfileError) throw canonicalProfileError;
    }

    saveStudentProfileLocally(studentToken, profile);

    const { error: studentError } = await supabase
      .from("students")
      .update({ name: profile.fullName, updated_at: new Date().toISOString() })
      .eq("token", studentToken);
    if (studentError) {
      console.warn("Student name sync skipped:", studentError.message || studentError);
    }
    return "database";
  } catch (error) {
    const details = error && typeof error === "object"
      ? error as { message?: string; details?: string; hint?: string; code?: string }
      : {};
    if (details.message || details.details) {
      console.warn("Student profile database sync unavailable; using local storage:", details.message || details.details);
    }
    if (saveStudentProfileLocally(studentToken, profile)) return "local";
    throw error;
  }
}

export async function getStudentProfile(studentToken: string): Promise<Partial<StudentProfile> | null> {
  if (!isSupabaseConfigured()) return getStudentProfileLocally(studentToken);

  const identityCandidates = [
    ...(uuidPattern.test(studentToken) ? [supabase.from("students").select("id, name, email, token").eq("id", studentToken).maybeSingle()] : []),
    supabase.from("students").select("id, name, email, token").eq("token", studentToken).maybeSingle(),
    supabase.from("students").select("id, name, email, token").eq("email", studentToken).maybeSingle(),
  ];
  const identityResults = await Promise.all(identityCandidates);
  const student = identityResults.find((result) => result.data)?.data || null;
  const profileTokens = [...new Set([student?.token, studentToken].filter((value): value is string => Boolean(value)))];
  const canonicalProfileCandidates = [
    ...(uuidPattern.test(studentToken)
      ? [supabase
          .from("profiles")
          .select("id, full_name, level, learning_goal, instructor_note")
          .eq("id", studentToken)
          .maybeSingle()]
      : []),
    ...(student?.id
      ? [supabase
          .from("profiles")
          .select("id, full_name, level, learning_goal, instructor_note")
          .eq("id", student.id)
          .maybeSingle()]
      : []),
    ...(student?.token
      ? [supabase
          .from("profiles")
          .select("id, full_name, level, learning_goal, instructor_note")
          .eq("token", student.token)
          .maybeSingle()]
      : []),
  ];
  const canonicalProfileResults = await Promise.all(canonicalProfileCandidates);
  const canonicalProfile =
    canonicalProfileResults.find((result) => result.data)?.data as Record<string, unknown> | null || null;
  let profileData: Record<string, unknown> | null = null;
  let profileError: { code?: string; message?: string; details?: string } | null = null;
  for (const profileToken of profileTokens) {
    const profileResult = await supabase
      .from("student_profiles")
      .select("*")
      .eq("student_token", profileToken)
      .maybeSingle();
    if (profileResult.data) {
      profileData = profileResult.data as Record<string, unknown>;
      break;
    }
    if (profileResult.error) profileError = profileResult.error;
  }
  if (!profileData && profileError && !canonicalProfile) {
    if (profileError.code !== "42P01" && !/student_profiles/i.test(profileError.message || "")) {
      console.warn("Student profile read unavailable; using local storage:", profileError.message || profileError.details);
    }
    return profileTokens.map(getStudentProfileLocally).find(Boolean) || null;
  }
  if (!profileData && !canonicalProfile) {
    return profileTokens.map(getStudentProfileLocally).find(Boolean) || null;
  }

  const legacyProfile = normalizeStudentProfile(
    profileData,
    student?.token || studentToken,
  );
  const canonicalProfileValues = normalizeStudentProfile(
    canonicalProfile,
    student?.token || studentToken,
  );

  return {
    ...legacyProfile,
    ...(canonicalProfileValues?.level
      ? { level: canonicalProfileValues.level }
      : {}),
    ...(canonicalProfileValues?.targetGoal
      ? { targetGoal: canonicalProfileValues.targetGoal }
      : {}),
    ...(canonicalProfileValues?.teacherNotes
      ? { teacherNotes: canonicalProfileValues.teacherNotes }
      : {}),
    fullName: student?.name || undefined,
  };
}
