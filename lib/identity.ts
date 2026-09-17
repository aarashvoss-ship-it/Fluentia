import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export async function resolveUserUuid(_legacyIdentifier?: string): Promise<string> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");

  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user?.id) throw new Error("No authenticated Supabase user");

  return data.user.id;
}
