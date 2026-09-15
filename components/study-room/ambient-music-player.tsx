"use client";

import { useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { AMBIENT_TRACKS, type LessonAudioTrack } from "@/lib/musicTracks";

const PLAYBACK_KEY = "fluentia:ambient-music:playing";
const ENABLED_KEY = "fluentia:ambient-music:enabled";
const VOLUME_KEY = "fluentia:ambient-music:volume";
interface AmbientMusicPlayerProps {
  src?: string;
  tracks?: LessonAudioTrack[];
}

export function AmbientMusicPlayer({ src, tracks = [] }: AmbientMusicPlayerProps) {
  const availableTracks = tracks.length > 0 ? tracks : AMBIENT_TRACKS.map(({ label, url }) => ({ title: label, url }));
  const audioRef = useRef<HTMLAudioElement>(null);
  const [trackIndex, setTrackIndex] = useState(() => Math.max(0, availableTracks.findIndex((item) => item.url === src)));
  const [selectedTrack, setSelectedTrack] = useState(src || availableTracks[0].url);
  const track = selectedTrack || availableTracks[trackIndex]?.url || availableTracks[0].url;
  const [isEnabled, setIsEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [showVolume, setShowVolume] = useState(false);
  const [showTracks, setShowTracks] = useState(false);

  useEffect(() => {
    if (!src) return;
    const nextIndex = availableTracks.findIndex((item) => item.url === src);
    setTrackIndex(Math.max(0, nextIndex));
    setSelectedTrack(src);
  }, [src]);

  useEffect(() => {
    const storedPlaying = window.localStorage.getItem(PLAYBACK_KEY) === "true";
    const storedEnabled = window.localStorage.getItem(ENABLED_KEY);
    const storedVolume = Number(window.localStorage.getItem(VOLUME_KEY));
    if (!Number.isNaN(storedVolume) && storedVolume >= 0 && storedVolume <= 1) setVolume(storedVolume);
    if (storedEnabled !== null) setIsEnabled(storedEnabled === "true");
    if (storedPlaying && storedEnabled !== "false") setIsPlaying(true);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    window.localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isEnabled || !isPlaying) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => {
      setIsPlaying(false);
      window.localStorage.setItem(PLAYBACK_KEY, "false");
    });
  }, [isEnabled, isPlaying, track]);

  async function togglePlayback() {
    if (!isEnabled) {
      setIsEnabled(true);
      window.localStorage.setItem(ENABLED_KEY, "true");
    }
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    window.localStorage.setItem(PLAYBACK_KEY, String(nextPlaying));
    if (nextPlaying) {
      try {
        await audioRef.current?.play();
      } catch {
        setIsPlaying(false);
        window.localStorage.setItem(PLAYBACK_KEY, "false");
      }
    } else {
      audioRef.current?.pause();
    }
  }

  function toggleEnabled() {
    const nextEnabled = !isEnabled;
    setIsEnabled(nextEnabled);
    window.localStorage.setItem(ENABLED_KEY, String(nextEnabled));
    if (!nextEnabled) {
      setIsPlaying(false);
      window.localStorage.setItem(PLAYBACK_KEY, "false");
    }
  }

  function handleVolumeChange(value: number) {
    setVolume(value);
    if (value > 0 && audioRef.current?.paused === false) setIsPlaying(true);
  }

  function selectTrack(index: number) {
    setTrackIndex(index);
    setSelectedTrack(availableTracks[index].url);
    setShowTracks(false);
    setIsPlaying(false);
    window.localStorage.setItem(PLAYBACK_KEY, "false");
    window.setTimeout(() => audioRef.current?.load(), 0);
  }

  return (
    <div className="relative flex items-center gap-1">
      <audio
        ref={audioRef}
        src={track}
        loop
        preload="auto"
        onError={() => {
          if (!src && trackIndex < availableTracks.length - 1) {
            setTrackIndex((index) => index + 1);
            return;
          }
          setIsPlaying(false);
          window.localStorage.setItem(PLAYBACK_KEY, "false");
        }}
        onEnded={() => setIsPlaying(false)}
      />
      <button
        type="button"
        onClick={() => setShowTracks((open) => !open)}
        aria-label="Choose ambient music track"
        aria-expanded={showTracks}
        className={`flex h-8 w-8 items-center justify-center p-2 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-amber-500/50 hover:shadow-amber-500/10 transition-all ${isEnabled ? "border-amber-500/70 bg-amber-500/10 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,.18)]" : "text-stone-400 hover:text-amber-300"}`}
      >
        <Music className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {showTracks && <div className="absolute right-0 top-10 z-40 w-52 rounded-md border border-[#394252] bg-[#171d28] p-2 shadow-xl">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Music library</p>
        {availableTracks.map((item, index) => <button key={`${item.title}-${item.url}`} type="button" onClick={() => selectTrack(index)} className={`block w-full rounded px-2 py-2 text-left text-xs transition hover:bg-amber-500/10 hover:text-amber-300 ${track === item.url ? "text-amber-300" : "text-stone-400"}`}>{item.title}</button>)}
        {src && !availableTracks.some((item) => item.url === src) && <p className="px-2 py-2 text-[10px] text-stone-500">Custom lesson track</p>}
      </div>}
      <button
        type="button"
        onClick={() => setShowVolume((open) => !open)}
        aria-label="Adjust ambient music volume"
        aria-expanded={showVolume}
        className="flex h-8 w-8 items-center justify-center p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-stone-400 hover:border-amber-500/50 hover:shadow-amber-500/10 transition-all hover:text-amber-300"
      >
        {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      {showVolume && (
        <div className="absolute right-0 top-10 z-40 flex w-36 items-center gap-2 rounded-md border border-[#394252] bg-[#171d28] p-3 shadow-xl">
          <VolumeX className="h-3.5 w-3.5 text-stone-500" />
          <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => handleVolumeChange(Number(event.target.value))} aria-label="Ambient music volume" className="h-1 w-full accent-amber-500" />
          <Volume2 className="h-3.5 w-3.5 text-amber-400" />
        </div>
      )}
      <button
        type="button"
        onClick={() => void togglePlayback()}
        aria-label={isPlaying ? "Pause ambient focus music" : "Play ambient focus music"}
        aria-pressed={isPlaying}
        className={`flex h-8 w-8 items-center justify-center p-2 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-amber-500/50 hover:shadow-amber-500/10 transition-all ${isPlaying ? "border-amber-500/70 bg-amber-500/10 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,.18)]" : "text-stone-400 hover:text-amber-300"}`}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
    </div>
  );
}