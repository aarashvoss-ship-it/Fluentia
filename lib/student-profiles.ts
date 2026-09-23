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

export function getStudentProfileNote(profile?: Record<string, unknown> | null) {
  if (!profile) return "";
  for (const key of ["teacherNotes", "instructor_notes", "dashboard_note", "student_dashboard_note"]) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function saveStudentProfileLocally(studentToken: string, profile: StudentProfile) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  window.localStorage.setItem(localProfileKey(studentToken), JSON.stringify(profile));
  return true;
}

function getStudentProfileLocally(studentToken: string): Partial<StudentProfile> | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return JSON.parse(window.localStorage.getItem(localProfileKey(studentToken)) || "null") as Partial<StudentProfile> | null;
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
    const { error } = await supabase.from("student_profiles").upsert({
      student_token: studentToken,
      level: profile.level,
      learning_goal: profile.targetGoal,
      instructor_notes: instructorNotes,
      updated_at: new Date().toISOString(),
    }, { onConflict: "student_token" });

    if (error) throw error;

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

  const profileResult = await supabase
    .from("student_profiles")
    .select("level, learning_goal, instructor_notes")
    .eq("student_token", studentToken)
    .maybeSingle();
  if (profileResult.error) {
    if (profileResult.error.code !== "42P01" && !/student_profiles/i.test(profileResult.error.message || "")) {
      console.warn("Student profile read unavailable; using local storage:", profileResult.error.message || profileResult.error.details);
    }
    return getStudentProfileLocally(studentToken);
  }

  let student: { name?: string; email?: string; token?: string } | null = null;
  const studentResult = await supabase.from("students").select("name, email, token").eq("token", studentToken).maybeSingle();
  if (!studentResult.error) student = studentResult.data;

  return {
    fullName: student?.name || undefined,
    level: profileResult.data?.level || undefined,
    targetGoal: profileResult.data?.learning_goal || undefined,
    teacherNotes: profileResult.data?.instructor_notes || undefined,
  };
}
