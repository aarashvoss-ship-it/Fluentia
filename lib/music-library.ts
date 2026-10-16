import type { LessonAudioTrack } from "@/lib/musicTracks";
import { fetchStudyRoomMusicTracks } from "@/lib/services/resource-hub-service";

export async function getAmbientTracks(): Promise<LessonAudioTrack[]> {
  try {
    return await fetchStudyRoomMusicTracks();
  } catch (error) {
    console.error("Unable to load Resource Hub Study Room music:", error);
    return [];
  }
}
