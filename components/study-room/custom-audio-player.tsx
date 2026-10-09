"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Pause, Play, Volume2 } from "lucide-react";
import { parseInteractiveTranscript } from "@/lib/transcripts";
import { MarkdownContent } from "@/components/study-room/markdown-content";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function isRemoteAudioUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isAudioDataUrl(value: string) {
  return /^data:audio\/[\w.+-]+(?:;[^,]*)?,/i.test(value);
}

export function CustomAudioPlayer({ src, label = "Audio", blob, transcript }: { src: string; label?: string; blob?: Blob; transcript?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptId = useId();
  const [playbackSrc, setPlaybackSrc] = useState("");
  const [sourceStatus, setSourceStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const transcriptLines = parseInteractiveTranscript(transcript || "");
  const isAudioPrompt = /\baudio\s+prompt\b/i.test(label);

  useEffect(() => {
    setPlaybackSrc("");
    setSourceStatus("checking");

    if (blob) {
      let cancelled = false;
      const reader = new FileReader();
      reader.onload = () => {
        if (cancelled) return;
        if (typeof reader.result !== "string" || !isAudioDataUrl(reader.result)) {
          setSourceStatus("unavailable");
          return;
        }
        setPlaybackSrc(reader.result);
        setSourceStatus("ready");
      };
      reader.onerror = () => {
        if (!cancelled) setSourceStatus("unavailable");
      };
      reader.readAsDataURL(blob);
      return () => {
        cancelled = true;
        reader.abort();
      };
    }

    if (isRemoteAudioUrl(src) || isAudioDataUrl(src)) {
      setPlaybackSrc(src);
      setSourceStatus("ready");
    } else if (/^blob:/i.test(src)) {
      setSourceStatus("unavailable");
    } else {
      setSourceStatus("unavailable");
    }
  }, [blob, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || sourceStatus !== "ready") return;
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
  }, [playbackSrc]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || sourceStatus !== "ready") return;
    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
        setSourceStatus("unavailable");
      }
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

  const seekToTimestamp = (seconds: number) => {
    if (sourceStatus !== "ready" || !audioRef.current) return;
    seek(seconds);
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
    <div className="space-y-3">
      {sourceStatus === "unavailable" ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-stone-400">Audio playback unavailable</p>
      ) : (
        <div className="w-full rounded-xl border border-border bg-surface p-3 text-stone-300 shadow-inner">
          {sourceStatus === "ready" && <audio ref={audioRef} src={playbackSrc} preload="metadata" className="sr-only" aria-label={label} onError={() => setSourceStatus("unavailable")} />}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void togglePlayback()} disabled={sourceStatus !== "ready"} aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-50">
              {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-stone-500">
                <span className="min-w-0 truncate">{label}</span>
                <select value={playbackRate} onChange={(event) => changePlaybackRate(Number(event.target.value))} aria-label={`${label} playback speed`} className="shrink-0 rounded border border-border bg-background px-1 py-0.5 text-[10px] text-stone-300 outline-none focus:border-amber-500/40">
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
      )}
      {transcriptLines.length > 0 && (
        <div className="rounded border border-border bg-background/50" aria-label="Interactive audio transcript">
          <button
            type="button"
            onClick={() => setIsTranscriptExpanded((expanded) => !expanded)}
            aria-expanded={isTranscriptExpanded}
            aria-controls={transcriptId}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-stone-300 transition hover:bg-amber-500/20 hover:text-amber-400"
          >
            <span>Show / Hide Transcript</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-amber-400 transition-transform duration-200 ${isTranscriptExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {isTranscriptExpanded && (
            <div id={transcriptId} className="max-h-[320px] overflow-y-auto overscroll-contain border-t border-border scroll-smooth pr-2">
              {isAudioPrompt && <p className="px-4 pt-3 text-xs leading-relaxed text-amber-300">Words in ALL CAPS indicate key stress points—emphasize them with higher pitch while shadowing.</p>}
              <div className="space-y-1 p-2">
                {transcriptLines.map((line) => (
                  <div key={`${line.seconds}-${line.text}`} className="flex min-w-0 items-start gap-2 rounded px-2 py-1.5 text-xs text-stone-300">
                    <button
                      type="button"
                      onClick={() => seekToTimestamp(line.seconds)}
                      disabled={sourceStatus !== "ready"}
                      className="shrink-0 rounded border border-amber-500/40 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Seek to ${line.timestamp}`}
                    >
                      [{line.timestamp}]
                    </button>
                    <MarkdownContent
                      value={line.text}
                      className="min-w-0 flex-1 break-words text-xs leading-relaxed text-stone-300 [&_p]:my-0 [&_p]:inline [&_p]:whitespace-pre-wrap [&_strong]:font-semibold"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
