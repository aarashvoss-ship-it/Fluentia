import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveUserUuid } from "@/lib/identity";
import type { StudentProfile } from "@/types/lesson";

export interface StudentProfileRecord {
  student_token: string;
  name?: string;
  level: string;
  learning_goal: string;
  instructor_notes: string;
  avatar_url?: string;
  banner_url?: string;
  updated_at?: string;
}

export async function saveStudentProfile(studentToken: string, profile: StudentProfile): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const profileId = await resolveUserUuid();
  if (!profileId) return;
  const { error: studentError } = await supabase
    .from("students")
    .update({ name: profile.fullName, updated_at: new Date().toISOString() })
    .eq("id", profileId);
  if (studentError) throw studentError;

  const { error } = await supabase.from("student_profiles").upsert({
    student_token: studentToken,
    level: profile.level,
    learning_goal: profile.targetGoal,
    instructor_notes: profile.teacherNotes,
    updated_at: new Date().toISOString(),
  }, { onConflict: "student_token" });

  if (error) throw error;
}

export async function getStudentProfile(studentToken: string): Promise<Partial<StudentProfile> | null> {
  if (!isSupabaseConfigured()) return null;

  const [{ data: student, error: studentError }, { data, error }] = await Promise.all([
    supabase.from("students").select("name, email, token").eq("token", studentToken).maybeSingle(),
    supabase
    .from("student_profiles")
    .select("level, learning_goal, instructor_notes")
    .eq("student_token", studentToken)
    .maybeSingle(),
  ]);

  if (studentError) throw studentError;
  if (error) throw error;
  if (!student && !data) return null;

  return {
    fullName: student?.name || undefined,
    level: data?.level || undefined,
    targetGoal: data?.learning_goal || undefined,
    teacherNotes: data?.instructor_notes || undefined,
  };
}
