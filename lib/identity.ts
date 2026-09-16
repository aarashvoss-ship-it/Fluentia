import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveUserUuid(token: string): Promise<string> {
  const value = token.trim();
  if (!value) throw new Error("A user token is required");
  if (UUID_PATTERN.test(value)) return value;
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("token", value)
    .maybeSingle();
  if (studentError) throw studentError;
  if (student?.id) return student.id;

  const { data: instructor, error: instructorError } = await supabase
    .from("instructors")
    .select("id")
    .eq("token", value)
    .maybeSingle();
  if (instructorError) throw instructorError;
  if (instructor?.id) return instructor.id;

  throw new Error(`No student or instructor found for token '${value}'`);
}
