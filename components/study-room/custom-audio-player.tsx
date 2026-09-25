"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function CustomAudioPlayer({ src, label = "Audio" }: { src: string; label?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.load();
    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [src]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const seek = (value: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    if (audioRef.current) audioRef.current.volume = value;
  };

  const changePlaybackRate = (value: number) => {
    setPlaybackRate(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  };

  return (
    <div className="w-full rounded-xl border border-[#293343] bg-[#171d28] p-3 text-stone-300 shadow-inner">
      <audio ref={audioRef} src={src} preload="metadata" className="sr-only" aria-label={label} />
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void togglePlayback()} aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[#0c1017] transition hover:bg-amber-400">
          {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-stone-500">
            <span className="min-w-0 truncate">{label}</span>
            <select value={playbackRate} onChange={(event) => changePlaybackRate(Number(event.target.value))} aria-label={`${label} playback speed`} className="shrink-0 rounded border border-[#394252] bg-[#0c1017] px-1 py-0.5 text-[10px] text-stone-300 outline-none focus:border-amber-500">
              {[0.75, 1, 1.25, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}
            </select>
            <span className="shrink-0 tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <input type="range" min="0" max={duration || 0} step="0.01" value={Math.min(currentTime, duration || 0)} onChange={(event) => seek(Number(event.target.value))} aria-label={`${label} progress`} className="h-1.5 w-full cursor-pointer accent-amber-500" />
        </div>
        <Volume2 className="hidden h-4 w-4 shrink-0 text-stone-500 sm:block" />
        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => changeVolume(Number(event.target.value))} aria-label={`${label} volume`} className="hidden w-20 cursor-pointer accent-amber-500 sm:block" />
      </div>
    </div>
  );
}
