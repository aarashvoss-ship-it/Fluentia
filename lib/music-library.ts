import { isSupabaseConfigured, supabase, type AmbientTrackRow } from "@/lib/supabase";
import { DEFAULT_LESSON_AUDIO_TRACKS, type LessonAudioTrack } from "@/lib/musicTracks";

export async function getAmbientTracks(): Promise<LessonAudioTrack[]> {
  if (!isSupabaseConfigured()) return DEFAULT_LESSON_AUDIO_TRACKS;
  try {
    const { data, error } = await supabase
      .from("ambient_tracks")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error || !data || data.length === 0) return DEFAULT_LESSON_AUDIO_TRACKS;
    return (data as AmbientTrackRow[]).map(({ title, url }) => ({ title, url }));
  } catch {
    return DEFAULT_LESSON_AUDIO_TRACKS;
  }
}

export async function createAmbientTrack(title: string, url: string): Promise<AmbientTrackRow> {
  const { data, error } = await supabase
    .from("ambient_tracks")
    .insert({ title: title.trim(), url: url.trim(), is_active: true })
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Unable to create ambient track");
  return data as AmbientTrackRow;
}

export async function deleteAmbientTrack(id: string): Promise<void> {
  const { error } = await supabase.from("ambient_tracks").delete().eq("id", id);
  if (error) throw error;
}