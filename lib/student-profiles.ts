import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveUserUuid } from "@/lib/identity";
import type { StudentProfile } from "@/types/lesson";

export interface StudentProfileRecord {
  student_token: string;
  full_name?: string;
  level: string;
  learning_goal: string;
  instructor_notes: string;
  avatar_url?: string;
  banner_url?: string;
  updated_at?: string;
}

export async function saveStudentProfile(studentToken: string, profile: StudentProfile): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const profileId = await resolveUserUuid(studentToken);
  const profileRow = {
    id: profileId,
    token: studentToken,
    full_name: profile.fullName,
    level: profile.level,
    target_goal: profile.targetGoal,
    avatar_url: profile.avatarUrl || null,
    banner_url: profile.bannerUrl || null,
    updated_at: new Date().toISOString(),
  };
  const { error: profileError } = await supabase.from("profiles").upsert(profileRow, { onConflict: "token" });
  if (profileError) throw profileError;

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

  const [{ data: profile, error: profileError }, { data, error }] = await Promise.all([
    supabase.from("profiles").select("full_name, level, target_goal, avatar_url, banner_url").eq("token", studentToken).maybeSingle(),
    supabase
    .from("student_profiles")
    .select("level, learning_goal, instructor_notes")
    .eq("student_token", studentToken)
    .maybeSingle(),
  ]);

  if (profileError) throw profileError;
  if (error) throw error;
  if (!profile && !data) return null;

  return {
    fullName: profile?.full_name || undefined,
    level: profile?.level || data?.level || undefined,
    targetGoal: profile?.target_goal || data?.learning_goal || undefined,
    teacherNotes: data?.instructor_notes || undefined,
    avatarUrl: profile?.avatar_url || undefined,
    bannerUrl: profile?.banner_url || undefined,
  };
}
