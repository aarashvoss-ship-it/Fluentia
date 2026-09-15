export interface AmbientTrack {
  id: string;
  label: string;
  url: string;
}

export type LessonAudioTrack = { title: string; url: string };

export const AMBIENT_TRACKS: AmbientTrack[] = [
  {
    id: "deep-focus",
    label: "Deep Focus (Lofi)",
    url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3",
  },
  {
    id: "rain-piano",
    label: "Gentle Rain & Piano",
    url: "https://cdn.pixabay.com/download/audio/2022/10/25/audio_946b8a7f31.mp3",
  },
  {
    id: "ambient-synth",
    label: "Calm Ambient Synth",
    url: "https://cdn.pixabay.com/download/audio/2022/03/10/audio_2c7f6f6c3f.mp3",
  },
  {
    id: "alpha-waves",
    label: "Alpha Waves",
    url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3",
  },
];

export const DEFAULT_LESSON_AUDIO_TRACKS: LessonAudioTrack[] = AMBIENT_TRACKS.map(({ label, url }) => ({ title: label, url }));