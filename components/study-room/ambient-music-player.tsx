"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Plus, Trash2, Volume1, Volume2, VolumeX, X } from "lucide-react";
import { DEFAULT_LESSON_AUDIO_TRACKS, getYoutubeVideoId, isYoutubeUrl, type LessonAudioTrack } from "@/lib/musicTracks";
import { getAmbientTracks } from "@/lib/music-library";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Tooltip } from "@/components/shared/tooltip";
import { YoutubeAudioController } from "@/components/shared/youtube-audio-controller";

const PLAYBACK_KEY = "fluentia:ambient-music:playing";
const ENABLED_KEY = "fluentia:ambient-music:enabled";
const VOLUME_KEY = "fluentia:ambient-music:volume";
const STUDENT_TRACKS_KEY = "fluentia:ambient-music:student-tracks";
const POMODORO_BREAK_EVENT = "fluentia:study-room-timer-break-start";
const POMODORO_FOCUS_EVENT = "fluentia:study-room-timer-focus-start";
const TIMER_CHIME_EVENT = "fluentia:study-room-timer-chime";
const AUDIO_CONTROL_CLASS = "flex h-8 w-8 items-center justify-center rounded-md border bg-transparent p-2 transition-colors duration-200 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400";
const AUDIO_CONTROL_IDLE_CLASS = "border-slate-700/50 text-slate-400";
const AUDIO_CONTROL_ACTIVE_CLASS = "border-amber-500/40 text-amber-400";

type StudentTrack = LessonAudioTrack & { id: string; storedFile?: boolean };
type StoredStudentTrack = { id: string; title: string; url?: string; storedFile?: boolean };
type AvailableTrack = LessonAudioTrack & { id: string; source: "global" | "student"; temporaryFile?: boolean };
type StoredAudioFile = { key: string; scope: string; id: string; title: string; blob: Blob };

const STUDENT_AUDIO_DB = "fluentia-student-audio";
const STUDENT_AUDIO_STORE = "tracks";

interface AmbientMusicPlayerProps {
  src?: string;
  studentScope?: string;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readStudentTracks(storageKey: string): StoredStudentTrack[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is StoredStudentTrack =>
      Boolean(item)
      && typeof item.id === "string"
      && typeof item.title === "string"
      && ((typeof item.url === "string" && isHttpUrl(item.url)) || item.storedFile === true),
    );
  } catch {
    return [];
  }
}

function openStudentAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(STUDENT_AUDIO_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STUDENT_AUDIO_STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open local audio storage."));
  });
}

async function saveStudentAudio(scope: string, id: string, title: string, blob: Blob): Promise<void> {
  const database = await openStudentAudioDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STUDENT_AUDIO_STORE, "readwrite");
    transaction.objectStore(STUDENT_AUDIO_STORE).put({ key: `${scope}:${id}`, scope, id, title, blob } satisfies StoredAudioFile);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Unable to save this audio file locally."));
    transaction.onabort = () => reject(transaction.error || new Error("Local audio storage was interrupted."));
  }).finally(() => database.close());
}

async function getStudentAudio(scope: string): Promise<StoredAudioFile[]> {
  const database = await openStudentAudioDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STUDENT_AUDIO_STORE, "readonly");
    const request = transaction.objectStore(STUDENT_AUDIO_STORE).getAll();
    request.onsuccess = () => resolve((request.result as StoredAudioFile[]).filter((item) => item.scope === scope));
    request.onerror = () => reject(request.error || new Error("Unable to load locally stored audio."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

async function deleteStudentAudio(scope: string, id: string): Promise<void> {
  const database = await openStudentAudioDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STUDENT_AUDIO_STORE, "readwrite");
    transaction.objectStore(STUDENT_AUDIO_STORE).delete(`${scope}:${id}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Unable to remove locally stored audio."));
    transaction.onabort = () => reject(transaction.error || new Error("Local audio removal was interrupted."));
  }).finally(() => database.close());
}

export function AmbientMusicPlayer({ src, studentScope = "student" }: AmbientMusicPlayerProps) {
  const [libraryTracks, setLibraryTracks] = useState<LessonAudioTrack[]>([]);
  const [studentTracks, setStudentTracks] = useState<StudentTrack[]>([]);
  const [loadedStorageKey, setLoadedStorageKey] = useState("");
  const [selectedTrack, setSelectedTrack] = useState(src || "");
  const [isEnabled, setIsEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [showVolume, setShowVolume] = useState(false);
  const [showTracks, setShowTracks] = useState(false);
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackNotice, setTrackNotice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const tracksButtonRef = useRef<HTMLButtonElement>(null);
  const tracksPanelRef = useRef<HTMLDivElement>(null);
  const volumeButtonRef = useRef<HTMLButtonElement>(null);
  const volumePanelRef = useRef<HTMLDivElement>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const failedTrackUrlsRef = useRef(new Set<string>());
  const timerPausedMusicRef = useRef(false);
  const timerMusicOverrideRef = useRef(false);
  const storageKey = `${STUDENT_TRACKS_KEY}:${encodeURIComponent(studentScope || "student")}`;

  const globalTracks = libraryTracks.length > 0 ? libraryTracks : DEFAULT_LESSON_AUDIO_TRACKS;
  const availableTracks: AvailableTrack[] = [
    ...globalTracks.map((track, index) => ({ ...track, id: `global-${index}-${track.url}`, source: "global" as const })),
    ...studentTracks.map((track) => ({ ...track, source: "student" as const })),
  ];
  const currentTrack = selectedTrack || src || globalTracks[0]?.url || "";
  const youtubeVideoId = getYoutubeVideoId(currentTrack);
  const isYoutubeTrack = isYoutubeUrl(currentTrack);

  useEffect(() => {
    if (!showTracks && !showVolume) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (showTracks && !tracksPanelRef.current?.contains(event.target) && !tracksButtonRef.current?.contains(event.target)) {
        setShowTracks(false);
      }
      if (showVolume && !volumePanelRef.current?.contains(event.target) && !volumeButtonRef.current?.contains(event.target)) {
        setShowVolume(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [showTracks, showVolume]);

  useEffect(() => {
    let mounted = true;
    const refreshTracks = async () => {
      const nextTracks = await getAmbientTracks();
      if (mounted) setLibraryTracks(nextTracks);
    };
    void refreshTracks();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscriptionTimer = window.setTimeout(() => {
      if (!mounted || !isSupabaseConfigured()) return;
      channel = supabase
        .channel(`ambient-tracks-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "ambient_tracks" }, () => {
          void refreshTracks();
        })
        .subscribe();
    }, 0);

    return () => {
      mounted = false;
      window.clearTimeout(subscriptionTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoadedStorageKey("");
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
    const savedTracks = readStudentTracks(storageKey);
    const urlTracks = savedTracks.filter((track): track is StoredStudentTrack & { url: string } => typeof track.url === "string").map((track) => ({ id: track.id, title: track.title, url: track.url }));
    setStudentTracks(urlTracks);
    void getStudentAudio(storageKey).then((files) => {
      if (!mounted) return;
      const fileTracks = savedTracks.filter((track) => track.storedFile).flatMap((track) => {
        const storedFile = files.find((file) => file.id === track.id);
        if (!storedFile) return [];
        const url = URL.createObjectURL(storedFile.blob);
        objectUrlsRef.current.add(url);
        return [{ id: track.id, title: track.title, url, storedFile: true }];
      });
      setStudentTracks([...urlTracks, ...fileTracks]);
      setLoadedStorageKey(storageKey);
    }).catch(() => {
      if (!mounted) return;
      setStudentTracks(urlTracks);
      setLoadedStorageKey(storageKey);
      setTrackNotice("Some locally stored audio could not be loaded in this browser.");
    });
    setSelectedTrack(src || "");
    setIsPlaying(false);
    persistPlayback(PLAYBACK_KEY, "false");
    return () => {
      mounted = false;
    };
  }, [storageKey, src]);

  useEffect(() => {
    if (loadedStorageKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(studentTracks.map(({ id, title, url, storedFile }) => storedFile ? { id, title, storedFile: true } : { id, title, url })));
    } catch {
      setTrackNotice("Your custom tracks could not be saved in this browser.");
    }
  }, [studentTracks, storageKey, loadedStorageKey]);

  useEffect(() => {
    if (src) setSelectedTrack(src);
  }, [src]);

  useEffect(() => {
    try {
      const storedPlaying = window.localStorage.getItem(PLAYBACK_KEY) === "true";
      const storedEnabled = window.localStorage.getItem(ENABLED_KEY);
      const storedVolume = Number(window.localStorage.getItem(VOLUME_KEY));
      if (!Number.isNaN(storedVolume) && storedVolume >= 0 && storedVolume <= 1) setVolume(storedVolume);
      if (storedEnabled !== null) setIsEnabled(storedEnabled === "true");
      if (storedPlaying && storedEnabled !== "false") setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, []);

  useEffect(() => {
    const pauseForBreak = () => {
      if (!isEnabled || !isPlaying) return;
      timerPausedMusicRef.current = true;
      timerMusicOverrideRef.current = false;
      setIsPlaying(false);
      persistPlayback(PLAYBACK_KEY, "false");
    };
    const resumeAfterBreak = () => {
      if (!timerPausedMusicRef.current) return;
      if (!timerMusicOverrideRef.current && isEnabled) {
        setIsPlaying(true);
        persistPlayback(PLAYBACK_KEY, "true");
      }
      timerPausedMusicRef.current = false;
      timerMusicOverrideRef.current = false;
    };
    window.addEventListener(POMODORO_BREAK_EVENT, pauseForBreak);
    window.addEventListener(POMODORO_FOCUS_EVENT, resumeAfterBreak);
    return () => {
      window.removeEventListener(POMODORO_BREAK_EVENT, pauseForBreak);
      window.removeEventListener(POMODORO_FOCUS_EVENT, resumeAfterBreak);
    };
  }, [isEnabled, isPlaying]);

  useEffect(() => {
    const playTimerChime = () => {
      if (!isEnabled || volume <= 0) return;
      try {
        const context = new window.AudioContext();
        const startAt = context.currentTime;
        [659.25, 880].forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const noteStart = startAt + index * 0.18;
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, noteStart);
          gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * 0.12), noteStart + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.48);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(noteStart);
          oscillator.stop(noteStart + 0.5);
        });
        window.setTimeout(() => void context.close(), 1200);
      } catch {
        setTrackNotice("Timer finished, but this browser could not play the chime.");
      }
    };
    window.addEventListener(TIMER_CHIME_EVENT, playTimerChime);
    return () => window.removeEventListener(TIMER_CHIME_EVENT, playTimerChime);
  }, [isEnabled, volume]);

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  function persistPlayback(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Playback remains usable when browser storage is unavailable.
    }
  }

  function failOverToGlobalTrack(failedUrl: string, errorMessage = "That audio could not be played.") {
    failedTrackUrlsRef.current.add(failedUrl);
    const fallback = availableTracks.find((item) =>
      item.source === "global"
      && !isYoutubeUrl(item.url)
      && !failedTrackUrlsRef.current.has(item.url),
    ) || DEFAULT_LESSON_AUDIO_TRACKS
      .filter((track) => !isYoutubeUrl(track.url))
      .find((track) => !failedTrackUrlsRef.current.has(track.url));
    if (fallback) {
      setSelectedTrack(fallback.url);
      setTrackError(null);
      setTrackNotice(`${errorMessage} Switched to another ambient track.`);
      setIsPlaying(true);
      persistPlayback(PLAYBACK_KEY, "true");
      return;
    }
    setIsPlaying(false);
    setTrackNotice(null);
    setTrackError(`${errorMessage} Choose another track to continue.`);
    persistPlayback(PLAYBACK_KEY, "false");
  }

  function handleYoutubeError(failedUrl: string, errorCode?: number) {
    const errorMessage = errorCode === 101 || errorCode === 150
      ? "This YouTube video does not allow embedded playback."
      : "YouTube audio could not be started.";
    failOverToGlobalTrack(failedUrl, errorMessage);
  }

  useEffect(() => {
    const audio = audioRef.current;
    try {
      window.localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      // Volume still applies to the active player.
    }
    if (!audio) return;
    audio.volume = volume;
    if (isYoutubeTrack || !isEnabled || !isPlaying) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => failOverToGlobalTrack(currentTrack));
  }, [volume, isEnabled, isPlaying, currentTrack]);

  function selectTrack(item: AvailableTrack) {
    if (timerPausedMusicRef.current) timerMusicOverrideRef.current = true;
    failedTrackUrlsRef.current.clear();
    setTrackError(null);
    setTrackNotice(null);
    setSelectedTrack(item.url);
    setShowTracks(false);
    setIsEnabled(true);
    setIsPlaying(true);
    persistPlayback(ENABLED_KEY, "true");
    persistPlayback(PLAYBACK_KEY, "true");
  }

  function addCustomUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = customTitle.trim();
    const url = customUrl.trim();
    if (!title) {
      setTrackError("Enter a title for your track.");
      return;
    }
    if (!isHttpUrl(url)) {
      setTrackError("Enter a valid audio URL or YouTube video link.");
      return;
    }
    if (isYoutubeUrl(url) && !getYoutubeVideoId(url)) {
      setTrackError("Paste a link to an individual YouTube video, not a playlist.");
      return;
    }
    const item: StudentTrack = { id: `student-${crypto.randomUUID()}`, title, url };
    setStudentTracks((current) => [...current, item]);
    selectTrack({ ...item, source: "student" });
    setCustomTitle("");
    setCustomUrl("");
    setTrackError(null);
    setShowAddTrack(false);
  }

  async function addLocalFile(file?: File) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!file.type.startsWith("audio/") && !["mp3", "wav", "m4a", "aac", "ogg", "webm"].includes(extension)) {
      setTrackError("Choose a supported audio file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setTrackError("Choose an audio file smaller than 25 MB.");
      return;
    }
    const id = `student-file-${crypto.randomUUID()}`;
    const title = customTitle.trim() || file.name.replace(/\.[^.]+$/, "");
    try {
      await saveStudentAudio(storageKey, id, title, file);
    } catch {
      setTrackError("This browser could not save the audio file locally.");
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.add(url);
    const item: StudentTrack = {
      id,
      title,
      url,
      storedFile: true,
    };
    setStudentTracks((current) => [...current, item]);
    selectTrack({ ...item, source: "student" });
    setCustomTitle("");
    setTrackError(null);
    setShowAddTrack(false);
  }

  function removeStudentTrack(item: StudentTrack) {
    setStudentTracks((current) => current.filter((track) => track.id !== item.id));
    if (item.storedFile) {
      URL.revokeObjectURL(item.url);
      objectUrlsRef.current.delete(item.url);
      void deleteStudentAudio(storageKey, item.id).catch(() => setTrackNotice("The audio was removed from the menu but could not be deleted from this browser."));
    }
    if (selectedTrack === item.url) {
      const fallback = globalTracks[0];
      if (fallback) selectTrack({ ...fallback, id: `global-${fallback.url}`, source: "global" });
      else setIsPlaying(false);
    }
  }

  function togglePlayback() {
    if (timerPausedMusicRef.current) timerMusicOverrideRef.current = true;
    const nextPlaying = !isPlaying;
    if (nextPlaying) {
      failedTrackUrlsRef.current.clear();
      setTrackError(null);
    }
    setIsEnabled(true);
    setIsPlaying(nextPlaying);
    persistPlayback(ENABLED_KEY, "true");
    persistPlayback(PLAYBACK_KEY, String(nextPlaying));
  }

  function toggleMute() {
    if (timerPausedMusicRef.current) timerMusicOverrideRef.current = true;
    if (volume > 0) {
      setVolume(0);
      setIsEnabled(false);
      persistPlayback(ENABLED_KEY, "false");
      setIsPlaying(false);
      persistPlayback(PLAYBACK_KEY, "false");
    } else {
      setVolume(0.35);
      setIsEnabled(true);
      persistPlayback(ENABLED_KEY, "true");
    }
  }

  function updateVolume(nextVolume: number) {
    const normalizedVolume = Math.min(1, Math.max(0, nextVolume));
    if (timerPausedMusicRef.current) timerMusicOverrideRef.current = true;
    setVolume(normalizedVolume);
    const nextEnabled = normalizedVolume > 0;
    setIsEnabled(nextEnabled);
    persistPlayback(ENABLED_KEY, String(nextEnabled));
    persistPlayback(VOLUME_KEY, String(normalizedVolume));
    if (!nextEnabled) {
      setIsPlaying(false);
      persistPlayback(PLAYBACK_KEY, "false");
    }
  }

  return (
    <div className="relative flex items-center gap-1">
      {Boolean(currentTrack) && !isYoutubeTrack && <audio ref={audioRef} src={currentTrack} loop preload="none" onError={() => failOverToGlobalTrack(currentTrack)} onEnded={() => setIsPlaying(false)} />}
      {youtubeVideoId && <YoutubeAudioController videoId={youtubeVideoId} isPlaying={isEnabled && isPlaying} volume={volume} onError={(errorCode) => handleYoutubeError(currentTrack, errorCode)} />}
      {(trackNotice || trackError) && <div role={trackError ? "alert" : "status"} className={`fixed bottom-4 right-4 z-[100] flex max-w-sm items-center gap-3 rounded-md border px-4 py-3 text-xs shadow-xl ${trackError ? "border-red-500/40 bg-[#241719] text-red-200" : "border-amber-500/40 bg-[#171d28] text-amber-400"}`}>
        <span>{trackError || trackNotice}</span>
        <button type="button" onClick={() => { setTrackError(null); setTrackNotice(null); }} aria-label="Dismiss music notification" className="shrink-0 text-current/70 hover:text-current"><X className="h-4 w-4" /></button>
      </div>}
      <Tooltip content="Open the music library"><button ref={tracksButtonRef} type="button" onClick={() => setShowTracks((open) => !open)} aria-label="Choose ambient music track" aria-expanded={showTracks} className={`${AUDIO_CONTROL_CLASS} ${showTracks ? AUDIO_CONTROL_ACTIVE_CLASS : AUDIO_CONTROL_IDLE_CLASS}`}>
        <Music className="h-3.5 w-3.5" aria-hidden="true" />
      </button></Tooltip>
      {showTracks && <div ref={tracksPanelRef} className="absolute right-0 top-10 z-40 max-h-[min(80vh,34rem)] w-72 max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto rounded-md border border-[#394252] bg-[#171d28] p-2 shadow-xl">
        <div className="flex items-center justify-between gap-2 px-2 py-1"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Music library</p><Tooltip content={showAddTrack ? "Close your custom track form" : "Add a personal audio URL or local file"}><button type="button" onClick={() => { setShowAddTrack((open) => !open); setTrackError(null); }} aria-expanded={showAddTrack} className="inline-flex items-center gap-1 rounded border border-[#394252] px-2 py-1 text-[10px]  text-stone-300 hover:border-amber-500/40 hover:text-amber-400">{showAddTrack ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}{showAddTrack ? "Close" : "Add My Own Music"}</button></Tooltip></div>
        {showAddTrack && <div className="my-2 space-y-3 rounded-md border border-[#394252] bg-[#0c1017] p-3">
          <label className="block text-[11px] text-stone-400">Track title<input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} maxLength={80} className="mt-1 w-full rounded border border-[#394252] bg-[#171d28] px-2 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label>
          <form onSubmit={addCustomUrl} className="space-y-2"><label className="block text-[11px] text-stone-400">Direct audio URL<input type="url" value={customUrl} onChange={(event) => setCustomUrl(event.target.value)} placeholder="https://…" className="mt-1 w-full rounded border border-[#394252] bg-[#171d28] px-2 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label><Tooltip content="Save this URL to your personal music list"><button type="submit" className="w-full rounded bg-amber-500/20 px-2 py-1.5 text-xs  text-amber-400 hover:bg-amber-500/20">Add URL track</button></Tooltip></form>
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded border border-[#394252] px-2 py-2 text-xs text-stone-300 hover:border-amber-500/40 hover:text-amber-400"><Plus className="h-3.5 w-3.5" />Choose local audio file<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm" onChange={(event) => { void addLocalFile(event.target.files?.[0]); event.currentTarget.value = ""; }} className="sr-only" /></label>
          <p className="text-[10px] leading-relaxed text-stone-500">Your tracks are stored only in this browser and are not shared with other students.</p>
        </div>}
        {trackError && <p role="alert" className="px-2 py-1 text-[10px] text-red-300">{trackError}</p>}
        {trackNotice && <p role="status" className="px-2 py-1 text-[10px] text-amber-400">{trackNotice}</p>}
        <div className="mt-1 space-y-0.5">{availableTracks.map((item) => <div key={item.id} className="flex items-center gap-1"><Tooltip content={`Play ${item.title}${item.source === "student" ? " (your track)" : ""}`}><button type="button" onClick={() => selectTrack(item)} className={`min-w-0 flex-1 truncate rounded px-2 py-2 text-left text-xs transition hover:bg-amber-500/20 hover:text-amber-400 ${currentTrack === item.url ? "text-amber-400" : "text-stone-400"}`} title={item.title}>{item.title}{item.source === "student" && <span className="ml-1 text-[9px] text-stone-600">Yours</span>}</button></Tooltip>{item.source === "student" && <Tooltip content={`Remove ${item.title} from your local music list`}><button type="button" onClick={() => removeStudentTrack(item as StudentTrack)} aria-label={`Remove ${item.title}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button></Tooltip>}</div>)}</div>
      </div>}
      <div className="relative">
        <Tooltip content="Adjust ambient music volume"><button ref={volumeButtonRef} type="button" onClick={() => setShowVolume((open) => !open)} aria-label="Adjust ambient music volume" aria-expanded={showVolume} className={`${AUDIO_CONTROL_CLASS} ${showVolume ? AUDIO_CONTROL_ACTIVE_CLASS : AUDIO_CONTROL_IDLE_CLASS}`}>
          {volume === 0 ? <VolumeX className="h-4 w-4" /> : volume < 0.5 ? <Volume1 className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button></Tooltip>
        {showVolume && <div ref={volumePanelRef} className="absolute right-0 top-10 z-40 flex w-40 items-center gap-2 rounded-md border border-slate-700 bg-[#171d28] p-3 shadow-xl">
          <button type="button" onClick={toggleMute} aria-label={volume === 0 ? "Unmute ambient music" : "Mute ambient music"} className="shrink-0 text-slate-400 hover:text-amber-400">{volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
          <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => updateVolume(Number(event.target.value))} aria-label="Ambient music volume" className="h-1 w-full accent-amber-500" />
          <span className="w-8 text-right text-[10px] tabular-nums text-slate-400">{Math.round(volume * 100)}%</span>
        </div>}
      </div>
      <Tooltip content={isPlaying ? "Pause ambient focus music" : "Play ambient focus music"}><button type="button" onClick={togglePlayback} aria-label={isPlaying ? "Pause ambient focus music" : "Play ambient focus music"} aria-pressed={isPlaying} className={`${AUDIO_CONTROL_CLASS} ${isPlaying ? AUDIO_CONTROL_ACTIVE_CLASS : AUDIO_CONTROL_IDLE_CLASS}`}>
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button></Tooltip>
    </div>
  );
}