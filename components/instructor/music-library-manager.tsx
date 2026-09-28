"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Pause, Play, Plus, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createAmbientTrack, deleteAmbientTrack } from "@/lib/music-library";
import { DEFAULT_LESSON_AUDIO_TRACKS } from "@/lib/musicTracks";
import type { AmbientTrackRow } from "@/lib/supabase";
import { Tooltip } from "@/components/shared/tooltip";

export function MusicLibraryManager() {
  const [tracks, setTracks] = useState<AmbientTrackRow[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isAddTrackOpen, setIsAddTrackOpen] = useState(false);
  const [trackTitle, setTrackTitle] = useState("");
  const [trackUrl, setTrackUrl] = useState("");
  const [trackFile, setTrackFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [trackPendingDelete, setTrackPendingDelete] = useState<AmbientTrackRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showFallbackTracks = (message: string) => {
    setTracks(DEFAULT_LESSON_AUDIO_TRACKS.map((track, index) => ({
      id: `fallback-${index}`,
      title: track.title,
      url: track.url,
      source_type: "url",
      sort_order: index + 1,
      is_active: true,
      created_at: new Date(0).toISOString(),
    })));
    setStatus(message);
  };

  const loadTracks = async () => {
    try {
      const { data, error } = await supabase.from("ambient_tracks").select("*").order("sort_order").order("created_at");
      if (error) {
        console.error('Supabase Error Details:', error);
        showFallbackTracks("Showing default tracks. Apply migration 025 and verify instructor permissions to manage shared audio.");
        return;
      }
      if (!data || data.length === 0) {
        showFallbackTracks("Showing default tracks. Apply migration 025 to seed the shared library.");
        return;
      }
      setTracks(data as AmbientTrackRow[]);
      setStatus(null);
    } catch (error) {
      console.error('Supabase Error Details:', error);
      showFallbackTracks("Showing default tracks. Apply migration 025 and verify instructor permissions to manage shared audio.");
    }
  };

  useEffect(() => {
    void loadTracks();
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const togglePreview = async (track: AmbientTrackRow) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(track.url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    try {
      await audio.play();
      setPlayingId(track.id);
    } catch {
      setStatus("This track could not be previewed.");
    }
  };

  const uploadTrack = async (file?: File) => {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const supportedExtensions = ["mp3", "wav", "m4a", "aac"];
    if (!file.type.startsWith("audio/") && !supportedExtensions.includes(extension)) {
      setStatus("Choose an MP3, WAV, M4A, or AAC audio file.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setStatus("Choose an audio file smaller than 15 MB.");
      return;
    }
    const title = trackTitle.trim() || file.name.replace(/\.[^.]+$/, "").trim() || "Uploaded Track";
    setStatus("Uploading track...");
    setIsSaving(true);
    const path = `ambient/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    let fileUploaded = false;
    try {
      const inferredMimeType: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac" };
      const upload = await supabase.storage.from("ambient-music").upload(path, file, { contentType: file.type || inferredMimeType[extension], upsert: false });
      if (upload.error) throw upload.error;
      fileUploaded = true;
      const { data } = supabase.storage.from("ambient-music").getPublicUrl(path);
      await createAmbientTrack(title, data.publicUrl, "upload");
      await loadTracks();
      setStatus("Track added to the shared library.");
      setTrackTitle("");
      setTrackFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      if (fileUploaded) await supabase.storage.from("ambient-music").remove([path]);
      setStatus(error instanceof Error ? `Upload failed: ${error.message}` : "Upload failed. Check the ambient-music bucket and policies.");
    } finally {
      setIsSaving(false);
    }
  };

  const addDirectUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = trackTitle.trim();
    const url = trackUrl.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      setStatus("Enter a valid direct audio URL.");
      return;
    }
    if (!title || !["http:", "https:"].includes(parsedUrl.protocol)) {
      setStatus("Enter a title and an http or https audio URL.");
      return;
    }
    setIsSaving(true);
    try {
      await createAmbientTrack(title, url);
      setTrackTitle("");
      setTrackUrl("");
      await loadTracks();
      setStatus("Track added to the shared library.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to add track: ${error.message}` : "Unable to add this track.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeTrack = async () => {
    if (!trackPendingDelete || isDeleting || trackPendingDelete.id.startsWith("fallback-")) return;
    const track = trackPendingDelete;
    setIsDeleting(true);
    try {
      const storageCleaned = await deleteAmbientTrack(track.id, track.url);
      setTracks((current) => current.filter((item) => item.id !== track.id));
      if (playingId === track.id) {
        audioRef.current?.pause();
        audioRef.current = null;
        setPlayingId(null);
      }
      setTrackPendingDelete(null);
      setStatus(storageCleaned ? "Track removed from the shared library." : "Track removed. Its stored audio file could not be cleaned up.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to remove track: ${error.message}` : "Unable to remove this track.");
    } finally {
      setIsDeleting(false);
    }
  };

  return <section className="space-y-5" aria-labelledby="music-library-title">
    <div className="flex flex-col justify-between gap-4 border-b border-[#202631] pb-5 sm:flex-row sm:items-end">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Shared Student Audio</p><h2 id="music-library-title" className="mt-1 font-sans text-2xl font-semibold text-stone-100">Music Library</h2><p className="mt-2 text-sm text-stone-500">Every active track here appears in student lesson headers.</p></div>
      <Tooltip content="Add a shared audio upload or stream URL"><button type="button" onClick={() => setIsAddTrackOpen((open) => !open)} aria-expanded={isAddTrackOpen} className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400"><Plus className="h-4 w-4" />Add New Track</button></Tooltip>
    </div>
    {status && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300" role="status">{status}</p>}
    {isAddTrackOpen && <section aria-label="Add a shared audio track" className="grid gap-4 rounded-lg border border-[#394252] bg-[#171d28]/60 p-4 md:grid-cols-2">
      <label className="text-xs text-stone-400 md:col-span-2">Track title<input value={trackTitle} onChange={(event) => setTrackTitle(event.target.value)} maxLength={120} className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-xs text-stone-200 outline-none focus:border-amber-500" /></label>
      <form onSubmit={(event) => void addDirectUrl(event)} className="space-y-3 rounded-md border border-[#293343] bg-[#0c1017] p-4">
        <h3 className="text-sm font-semibold text-stone-200">Add audio stream or URL</h3>
        <label className="block text-xs text-stone-400">Stream or direct audio URL<input type="url" required value={trackUrl} onChange={(event) => setTrackUrl(event.target.value)} placeholder="https://radio.example.com/live or https://cdn.example.com/track.mp3" className="mt-1 w-full rounded-md border border-[#394252] bg-[#171d28] px-3 py-2.5 text-xs text-stone-200 outline-none focus:border-amber-500" /></label>
        <p className="text-[10px] text-stone-500">Supports HTTP/HTTPS radio streams and direct audio links.</p>
        <button type="submit" disabled={isSaving} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/50 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add shared stream</button>
      </form>
      <div className="space-y-3 rounded-md border border-[#293343] bg-[#0c1017] p-4">
        <h3 className="text-sm font-semibold text-stone-200">Upload an audio file</h3>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[#394252] px-3 py-2.5 text-xs text-stone-300 hover:border-amber-500 hover:text-amber-300"><Upload className="h-4 w-4" />{trackFile?.name || "Choose MP3, WAV, M4A, or AAC"}<input ref={fileInputRef} type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/x-m4a,.mp3,.wav,.m4a,.aac" onChange={(event) => setTrackFile(event.target.files?.[0] || null)} className="sr-only" /></label>
        <p className="text-[10px] text-stone-500">Maximum file size: 15 MB. The uploaded file is stored in the shared audio bucket.</p>
        <Tooltip content="Upload the selected audio file to the shared student library"><button type="button" disabled={!trackFile || isSaving} onClick={() => void uploadTrack(trackFile || undefined)} className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-3.5 w-3.5" />{isSaving ? "Uploading..." : "Upload track"}</button></Tooltip>
      </div>
    </section>}
    <div className="overflow-hidden rounded-xl border border-[#202631] bg-[#171d28]/60"><table className="w-full text-left text-xs"><thead className="border-b border-[#202631] bg-[#0c1017] text-[10px] uppercase tracking-[0.12em] text-stone-500"><tr><th className="px-5 py-3">Track Title</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">URL</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[#202631]">{tracks.map((track) => <tr key={track.id}><td className="px-5 py-4 font-medium text-stone-200">{track.title}</td><td className="px-4 py-4 text-stone-400">{track.source_type === "upload" ? "Uploaded file" : "Stream / URL"}</td><td className="max-w-[360px] truncate px-4 py-4 text-stone-500">{track.url}</td><td className="px-4 py-4"><div className="flex justify-end gap-2"><Tooltip content={`Preview ${track.title}`}><button type="button" onClick={() => void togglePreview(track)} aria-label={`${playingId === track.id ? "Pause" : "Play"} ${track.title}`} className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/10">{playingId === track.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button></Tooltip><Tooltip content={`Delete ${track.title} from the shared library`}><button type="button" onClick={() => setTrackPendingDelete(track)} aria-label={`Remove ${track.title}`} disabled={track.id.startsWith("fallback-")} className="flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></Tooltip></div></td></tr>)}{tracks.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-stone-500">No tracks in the shared library.</td></tr>}</tbody></table></div>
    {trackPendingDelete && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeleting) setTrackPendingDelete(null); }}><section role="dialog" aria-modal="true" aria-labelledby="delete-track-title" aria-describedby="delete-track-warning" className="w-full max-w-md rounded-lg border border-red-500/30 bg-[#171d28] p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><h3 id="delete-track-title" className="text-lg font-semibold text-stone-100">Delete shared track?</h3><button type="button" disabled={isDeleting} onClick={() => setTrackPendingDelete(null)} aria-label="Close confirmation" className="rounded border border-[#394252] p-1.5 text-stone-400 hover:text-stone-100 disabled:opacity-50"><X className="h-4 w-4" /></button></div><p id="delete-track-warning" className="mt-3 text-sm leading-relaxed text-stone-400">This removes the track from the shared student library. Students currently listening may hear the audio stop.</p><p className="mt-2 truncate text-xs text-amber-300">{trackPendingDelete.title}</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={isDeleting} onClick={() => setTrackPendingDelete(null)} className="rounded-md border border-[#394252] px-3 py-2 text-xs text-stone-300 disabled:opacity-50">Cancel</button><button type="button" disabled={isDeleting} onClick={() => void removeTrack()} className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-50">{isDeleting ? "Deleting..." : <><Check className="h-3.5 w-3.5" />Delete track</>}</button></div></section></div>}
  </section>;
}