import { isSupabaseConfigured, supabase, type AmbientTrackRow } from "@/lib/supabase";
import type { LessonAudioTrack } from "@/lib/musicTracks";

function canRetryWithoutSourceType(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const databaseError = error as { code?: string; message?: string; details?: string };
  const description = `${databaseError.message || ""} ${databaseError.details || ""}`.toLowerCase();
  return description.includes("source_type") && (
    databaseError.code === "PGRST204"
    || (databaseError.code === "23514" && description.includes("check"))
  );
}

export async function getAmbientTracks(): Promise<LessonAudioTrack[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabase
      .from("ambient_tracks")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error('Supabase Error Details:', error);
      return [];
    }
    return ((data as AmbientTrackRow[] | null) || []).map(({ title, url }) => ({ title, url }));
  } catch (error) {
    console.error('Supabase Error Details:', error);
    return [];
  }
}

export async function createAmbientTrack(title: string, url: string, sourceType: "upload" | "url" | "youtube" = "url"): Promise<AmbientTrackRow> {
  const track = { title: title.trim(), url: url.trim(), source_type: sourceType, is_active: true };
  let result = await supabase
    .from("ambient_tracks")
    .insert(track)
    .select("*")
    .single();
  if (result.error && canRetryWithoutSourceType(result.error)) {
    const { source_type: _sourceType, ...legacyTrack } = track;
    result = await supabase
      .from("ambient_tracks")
      .insert(legacyTrack)
      .select("*")
      .single();
  }
  if (result.error || !result.data) throw result.error || new Error("Unable to create ambient track");
  return result.data as AmbientTrackRow;
}

export async function deleteAmbientTrack(id: string, url: string): Promise<boolean> {
  const { data, error } = await supabase.from("ambient_tracks").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Track was not removed. Check instructor permissions.");

  try {
    const trackUrl = new URL(url);
    const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "";
    const storagePrefix = "/storage/v1/object/public/ambient-music/";
    if (trackUrl.origin !== supabaseOrigin || !trackUrl.pathname.startsWith(storagePrefix)) return true;
    const path = decodeURIComponent(trackUrl.pathname.slice(storagePrefix.length));
    if (!path) return true;
    const { error: storageError } = await supabase.storage.from("ambient-music").remove([path]);
    return !storageError;
  } catch {
    return true;
  }
}