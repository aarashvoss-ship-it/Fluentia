"use client";

import { useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Volume2, VolumeX } from "lucide-react";

const PLAYBACK_KEY = "fluentia:ambient-music:playing";
const VOLUME_KEY = "fluentia:ambient-music:volume";
const DEFAULT_FOCUS_TRACK = "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3";

interface AmbientMusicPlayerProps {
  src?: string;
}

export function AmbientMusicPlayer({ src = DEFAULT_FOCUS_TRACK }: AmbientMusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [showVolume, setShowVolume] = useState(false);

  useEffect(() => {
    const storedPlaying = window.localStorage.getItem(PLAYBACK_KEY) === "true";
    const storedVolume = Number(window.localStorage.getItem(VOLUME_KEY));
    if (!Number.isNaN(storedVolume) && storedVolume >= 0 && storedVolume <= 1) setVolume(storedVolume);
    if (storedPlaying) setIsPlaying(true);
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
    if (!isPlaying) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => setIsPlaying(false));
  }, [isPlaying]);

  function togglePlayback() {
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    window.localStorage.setItem(PLAYBACK_KEY, String(nextPlaying));
  }

  function handleVolumeChange(value: number) {
    setVolume(value);
    if (value > 0 && audioRef.current?.paused === false) setIsPlaying(true);
  }

  return (
    <div className="relative flex items-center gap-1">
      <audio ref={audioRef} src={src} loop preload="auto" onEnded={() => setIsPlaying(false)} />
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? "Pause ambient focus music" : "Play ambient focus music"}
        aria-pressed={isPlaying}
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${isPlaying ? "border-amber-500/70 bg-amber-500/10 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,.18)]" : "border-[#394252] bg-[#171d28] text-stone-400 hover:border-amber-500 hover:text-amber-300"}`}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => setShowVolume((open) => !open)}
        aria-label="Adjust ambient music volume"
        aria-expanded={showVolume}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-[#394252] bg-[#171d28] text-stone-400 transition hover:border-amber-500 hover:text-amber-300"
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
        onClick={togglePlayback}
        aria-label={isPlaying ? "Disable ambient music" : "Enable ambient music"}
        aria-pressed={isPlaying}
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${isPlaying ? "border-amber-500/70 bg-amber-500/10 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,.18)]" : "border-[#394252] bg-[#171d28] text-stone-400 hover:border-amber-500 hover:text-amber-300"}`}
      >
        <Music className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}