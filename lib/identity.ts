import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export async function resolveUserUuid(_legacyIdentifier?: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user?.id) return null;
    return data.session.user.id;
  } catch (error) {
    console.warn("Unable to read the active Supabase session:", error);
    return null;
  }
}
