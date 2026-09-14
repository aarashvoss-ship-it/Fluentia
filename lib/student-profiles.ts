import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { StudentProfile } from "@/types/lesson";

export interface StudentProfileRecord {
  student_token: string;
  level: string;
  learning_goal: string;
  instructor_notes: string;
  updated_at?: string;
}

export async function saveStudentProfile(studentToken: string, profile: StudentProfile): Promise<void> {
  if (!isSupabaseConfigured()) return;

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

  const { data, error } = await supabase
    .from("student_profiles")
    .select("level, learning_goal, instructor_notes")
    .eq("student_token", studentToken)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    level: data.level || undefined,
    targetGoal: data.learning_goal || undefined,
    teacherNotes: data.instructor_notes || undefined,
  };
}
