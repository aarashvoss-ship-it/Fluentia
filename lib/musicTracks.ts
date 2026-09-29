export interface AmbientTrack {
  id: string;
  label: string;
  url: string;
}

export type LessonAudioTrack = { title: string; url: string };

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "music.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

export function getYoutubeVideoId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  const videoId = url.hostname.toLowerCase().endsWith("youtu.be")
    ? url.pathname.split("/").filter(Boolean)[0]
    : url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
  return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
}

export function getYoutubeEmbedUrl(
  value: string,
  autoplay = false,
  origin = typeof window === "undefined" ? "" : window.location.origin,
): string | null {
  const videoId = getYoutubeVideoId(value);
  if (!videoId) return null;
  const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
  embedUrl.searchParams.set("autoplay", autoplay ? "1" : "0");
  embedUrl.searchParams.set("controls", "1");
  embedUrl.searchParams.set("enablejsapi", "1");
  embedUrl.searchParams.set("playsinline", "1");
  if (origin) embedUrl.searchParams.set("origin", origin);
  return embedUrl.toString();
}

export function isYoutubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const AMBIENT_TRACKS: AmbientTrack[] = [
  {
    id: "deep-focus",
    label: "Deep Focus (Lofi)",
    url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3",
  },
  {
    id: "rain-piano",
    label: "Gentle Rain & Piano",
    url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3",
  },
  {
    id: "ambient-synth",
    label: "Calm Ambient Synth",
    url: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3",
  },
  {
    id: "alpha-waves",
    label: "Alpha Waves",
    url: "https://cdn.pixabay.com/download/audio/2021/09/06/audio_84e1d13f98.mp3",
  },
];

export const DEFAULT_LESSON_AUDIO_TRACKS: LessonAudioTrack[] = AMBIENT_TRACKS.map(({ label, url }) => ({ title: label, url }));