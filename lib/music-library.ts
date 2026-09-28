import { isSupabaseConfigured, supabase, type AmbientTrackRow } from "@/lib/supabase";
import { DEFAULT_LESSON_AUDIO_TRACKS, type LessonAudioTrack } from "@/lib/musicTracks";

export async function getAmbientTracks(): Promise<LessonAudioTrack[]> {
  if (!isSupabaseConfigured()) return DEFAULT_LESSON_AUDIO_TRACKS;
  try {
    const { data, error } = await supabase
      .from("ambient_tracks")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (error) {
      console.error('Supabase Error Details:', error);
      return DEFAULT_LESSON_AUDIO_TRACKS;
    }
    const persistedTracks = (data as AmbientTrackRow[] | null) || [];
    const persistedUrls = new Set(persistedTracks.map((track) => track.url));
    return [
      ...persistedTracks.map(({ title, url }) => ({ title, url })),
      ...DEFAULT_LESSON_AUDIO_TRACKS.filter((track) => !persistedUrls.has(track.url)),
    ];
  } catch (error) {
    console.error('Supabase Error Details:', error);
    return DEFAULT_LESSON_AUDIO_TRACKS;
  }
}

export async function createAmbientTrack(title: string, url: string, sourceType: "upload" | "url" = "url"): Promise<AmbientTrackRow> {
  const { data, error } = await supabase
    .from("ambient_tracks")
    .insert({ title: title.trim(), url: url.trim(), source_type: sourceType, is_active: true })
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Unable to create ambient track");
  return data as AmbientTrackRow;
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