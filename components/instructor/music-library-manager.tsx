"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Pause, Play, Plus, Trash2, Upload, Volume2, VolumeX, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { addResourceAsset, deleteResourceAsset, useResourceAssets } from "@/lib/resource-hub-store";
import type { ResourceAsset } from "@/types/resource-hub";
import { getYoutubeVideoId, isYoutubeUrl } from "@/lib/musicTracks";
import { Tooltip } from "@/components/shared/tooltip";
import { YoutubeAudioController } from "@/components/shared/youtube-audio-controller";

function isUploadedTrack(url: string) {
  try {
    const parsedUrl = new URL(url);
    const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "";
    return parsedUrl.origin === supabaseOrigin && parsedUrl.pathname.includes("/storage/v1/object/public/ambient-music/");
  } catch {
    return false;
  }
}

export function MusicLibraryManager({ instructorId }: { instructorId: string }) {
  const { assets, loading, error: loadError } = useResourceAssets(instructorId);
  const tracks = assets.filter((asset) => asset.mainCategory === "audios" && (
    asset.subCategory === "Study Room Music" || asset.tags.includes("study-room")
  ));
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [previewedYoutubeTrack, setPreviewedYoutubeTrack] = useState<ResourceAsset | null>(null);
  const [previewVolume, setPreviewVolume] = useState(0.4);
  const [status, setStatus] = useState<string | null>(null);
  const [isAddTrackOpen, setIsAddTrackOpen] = useState(false);
  const [trackTitle, setTrackTitle] = useState("");
  const [trackUrl, setTrackUrl] = useState("");
  const [trackFile, setTrackFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isResolvingYoutube, setIsResolvingYoutube] = useState(false);
  const [trackPendingDelete, setTrackPendingDelete] = useState<ResourceAsset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    setIsResolvingYoutube(false);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trackUrl.trim());
    } catch {
      return;
    }
    if (!isYoutubeUrl(trackUrl.trim())) return;
    if (!getYoutubeVideoId(trackUrl.trim())) {
      setStatus("Playlist links cannot be added as one track. Paste an individual video link from the playlist.");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsResolvingYoutube(true);
      setStatus("Processing YouTube link...");
      try {
        const response = await fetch("/api/music/youtube-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trackUrl.trim() }),
          signal: controller.signal,
        });
        const result = await response.json() as { title?: string; authorName?: string; error?: string };
        if (!response.ok || !result.title) throw new Error(result.error || "Unable to read this YouTube video.");
        setTrackTitle((current) => current.trim() || result.title || "");
        setStatus(`Video title found${result.authorName ? ` by ${result.authorName}` : ""}. You can edit the title before adding.`);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus("Couldn't load video details. Enter a title manually; the YouTube link can still be added.");
      } finally {
        if (!controller.signal.aborted) setIsResolvingYoutube(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [trackUrl]);

  const togglePreview = async (track: ResourceAsset) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const videoId = getYoutubeVideoId(track.url);
    if (videoId) {
      setPreviewedYoutubeTrack(track);
      setPlayingId(track.id);
      return;
    }
    setPreviewedYoutubeTrack(null);
    const audio = new Audio(track.url);
    audio.volume = previewVolume;
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
      await addResourceAsset({
        title,
        mainCategory: "audios",
        subCategory: "Study Room Music",
        url: data.publicUrl,
        isDownloadable: false,
        cefrLevel: "All Levels",
        tags: ["study-room", "music"],
      }, instructorId);
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
    if (isYoutubeUrl(url) && !getYoutubeVideoId(url)) {
      setStatus("Playlist links cannot be added as one track. Paste an individual video link from the playlist.");
      return;
    }
    setIsSaving(true);
    try {
      const videoId = getYoutubeVideoId(url);
      const normalizedUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
      await addResourceAsset({
        title,
        mainCategory: "audios",
        subCategory: "Study Room Music",
        url: normalizedUrl,
        isDownloadable: false,
        cefrLevel: "All Levels",
        tags: ["study-room", "music"],
      }, instructorId);
      setTrackTitle("");
      setTrackUrl("");
      setStatus(videoId ? "YouTube track added. Playback uses the embedded YouTube player." : "Track added to the shared library.");
    } catch (error) {
      setStatus(`Unable to add track: ${error instanceof Error ? error.message : "Check Resource Hub permissions."}`);
    } finally {
      setIsSaving(false);
    }
  };

  const removeTrack = async () => {
    if (!trackPendingDelete || isDeleting) return;
    const track = trackPendingDelete;
    setIsDeleting(true);
    try {
      await deleteResourceAsset(track.id);
      let storageCleaned = true;
      if (isUploadedTrack(track.url)) {
        const parsedUrl = new URL(track.url);
        const path = decodeURIComponent(parsedUrl.pathname.split("/storage/v1/object/public/ambient-music/")[1] || "");
        if (path) {
          const { error } = await supabase.storage.from("ambient-music").remove([path]);
          storageCleaned = !error;
        }
      }
      if (playingId === track.id) {
        audioRef.current?.pause();
        audioRef.current = null;
        setPlayingId(null);
      }
      if (previewedYoutubeTrack?.id === track.id) setPreviewedYoutubeTrack(null);
      setTrackPendingDelete(null);
      setStatus(storageCleaned ? "Track removed from the Resource Hub." : "Track removed. Its stored audio file could not be cleaned up.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to remove track: ${error.message}` : "Unable to remove this track.");
    } finally {
      setIsDeleting(false);
    }
  };

  return <section className="space-y-5" aria-labelledby="study-room-music-title">
    <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Resource Hub · Audios</p><h2 id="study-room-music-title" className="mt-1 font-sans text-2xl font-semibold text-stone-100">Study Room Music</h2><p className="mt-2 text-sm text-stone-500">These audio assets are shared with students who are assigned to your published lessons.</p></div>
      <Tooltip content="Add a shared audio upload or stream URL"><button type="button" onClick={() => setIsAddTrackOpen((open) => !open)} aria-expanded={isAddTrackOpen} className="inline-flex items-center gap-2 rounded-md bg-amber-500/20 px-4 py-2.5 text-xs  text-amber-400 transition hover:bg-amber-500/20"><Plus className="h-4 w-4" />Add New Track</button></Tooltip>
    </div>
    {loadError && <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" role="alert">{loadError}</p>}
    {status && <p className="rounded-md border border-amber-500/40 bg-amber-500/20 p-3 text-xs text-amber-400" role="status">{status}</p>}
    {previewedYoutubeTrack && getYoutubeVideoId(previewedYoutubeTrack.url) && <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
      <YoutubeAudioController videoId={getYoutubeVideoId(previewedYoutubeTrack.url)!} isPlaying={playingId === previewedYoutubeTrack.id} volume={previewVolume} onError={() => setStatus("YouTube audio could not be started. Check that the video allows embedding.")} />
      <p className="min-w-0 flex-1 truncate text-xs font-medium text-stone-200" title={previewedYoutubeTrack.title}>{previewedYoutubeTrack.title}</p>
      <Tooltip content={playingId === previewedYoutubeTrack.id ? "Pause YouTube preview" : "Play YouTube preview"}><button type="button" onClick={() => setPlayingId((current) => current === previewedYoutubeTrack.id ? null : previewedYoutubeTrack.id)} aria-label={playingId === previewedYoutubeTrack.id ? "Pause YouTube preview" : "Play YouTube preview"} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-500/40 text-amber-400 hover:bg-amber-500/20">{playingId === previewedYoutubeTrack.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button></Tooltip>
      <VolumeX className="h-3.5 w-3.5 text-stone-500" />
      <input type="range" min="0" max="1" step="0.01" value={previewVolume} onChange={(event) => setPreviewVolume(Number(event.target.value))} aria-label={`${previewedYoutubeTrack.title} volume`} className="h-1 w-24 accent-amber-500" />
      <Volume2 className="h-3.5 w-3.5 text-amber-400" />
    </div>}
    {isAddTrackOpen && <section aria-label="Add a shared audio track" className="grid gap-4 rounded-lg border border-border bg-surface/60 p-4 md:grid-cols-2">
      <label className="text-xs text-stone-400 md:col-span-2">Track title<input value={trackTitle} onChange={(event) => setTrackTitle(event.target.value)} maxLength={120} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label>
      <form onSubmit={(event) => void addDirectUrl(event)} className="space-y-3 rounded-md border border-border bg-background p-4">
        <h3 className="text-sm font-semibold text-stone-200">Add audio stream or URL</h3>
        <label className="block text-xs text-stone-400">Stream or direct audio URL<input type="url" required value={trackUrl} onChange={(event) => setTrackUrl(event.target.value)} placeholder="https://radio.example.com/live or https://cdn.example.com/track.mp3" className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-xs text-stone-200 outline-none focus:border-amber-500/40" /></label>
        <p className="text-[10px] text-stone-500">Supports HTTP/HTTPS audio streams and individual YouTube video links. YouTube tracks play in an embedded player.</p>
        <button type="submit" disabled={isSaving || isResolvingYoutube} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-3 py-2 text-xs  text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"><Plus className="h-3.5 w-3.5" />{isResolvingYoutube ? "Processing YouTube link..." : isYoutubeUrl(trackUrl) ? "Add YouTube track" : "Add shared stream"}</button>
      </form>
      <div className="space-y-3 rounded-md border border-border bg-background p-4">
        <h3 className="text-sm font-semibold text-stone-200">Upload an audio file</h3>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2.5 text-xs text-stone-300 hover:border-amber-500/40 hover:text-amber-400"><Upload className="h-4 w-4" />{trackFile?.name || "Choose MP3, WAV, M4A, or AAC"}<input ref={fileInputRef} type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/x-m4a,.mp3,.wav,.m4a,.aac" onChange={(event) => setTrackFile(event.target.files?.[0] || null)} className="sr-only" /></label>
        <p className="text-[10px] text-stone-500">Maximum file size: 15 MB. The uploaded file is stored in the shared audio bucket.</p>
        <Tooltip content="Upload the selected audio file to the shared student library"><button type="button" disabled={!trackFile || isSaving} onClick={() => void uploadTrack(trackFile || undefined)} className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-3 py-2 text-xs  text-amber-400 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-3.5 w-3.5" />{isSaving ? "Uploading..." : "Upload track"}</button></Tooltip>
      </div>
    </section>}
    <div className="overflow-hidden rounded-xl border border-border bg-surface/60"><table className="w-full text-left text-xs"><thead className="border-b border-border bg-background text-[10px] uppercase tracking-[0.12em] text-stone-500"><tr><th className="px-5 py-3">Track Title</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">URL</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border">{loading ? <tr><td colSpan={4} className="px-5 py-10 text-center text-stone-500">Loading Study Room music...</td></tr> : tracks.map((track) => <tr key={track.id}><td className="px-5 py-4 font-medium text-stone-200">{track.title}</td><td className="px-4 py-4 text-stone-400">{isUploadedTrack(track.url) ? "Uploaded file" : getYoutubeVideoId(track.url) ? "YouTube" : "Stream / URL"}</td><td className="max-w-[360px] truncate px-4 py-4 text-stone-500">{track.url}</td><td className="px-4 py-4"><div className="flex justify-end gap-2"><Tooltip content={`Preview ${track.title}`}><button type="button" onClick={() => void togglePreview(track)} aria-label={`${playingId === track.id ? "Pause" : "Play"} ${track.title}`} className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/40 text-amber-400 hover:bg-amber-500/20">{playingId === track.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button></Tooltip><Tooltip content={`Delete ${track.title} from the Resource Hub`}><button type="button" onClick={() => setTrackPendingDelete(track)} aria-label={`Remove ${track.title}`} className="flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></Tooltip></div></td></tr>)}{!loading && tracks.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-stone-500">No Study Room music assets. Add a track above.</td></tr>}</tbody></table></div>
    {trackPendingDelete && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeleting) setTrackPendingDelete(null); }}><section role="dialog" aria-modal="true" aria-labelledby="delete-track-title" aria-describedby="delete-track-warning" className="w-full max-w-md rounded-lg border border-red-500/30 bg-surface p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><h3 id="delete-track-title" className="text-lg font-semibold text-stone-100">Delete shared track?</h3><button type="button" disabled={isDeleting} onClick={() => setTrackPendingDelete(null)} aria-label="Close confirmation" className="rounded border border-border p-1.5 text-stone-400 hover:text-stone-100 disabled:opacity-50"><X className="h-4 w-4" /></button></div><p id="delete-track-warning" className="mt-3 text-sm leading-relaxed text-stone-400">This removes the track from the shared student library. Students currently listening may hear the audio stop.</p><p className="mt-2 truncate text-xs text-amber-400">{trackPendingDelete.title}</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={isDeleting} onClick={() => setTrackPendingDelete(null)} className="rounded-md border border-border px-3 py-2 text-xs text-stone-300 disabled:opacity-50">Cancel</button><button type="button" disabled={isDeleting} onClick={() => void removeTrack()} className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-2 text-xs  text-white hover:bg-red-400 disabled:opacity-50">{isDeleting ? "Deleting..." : <><Check className="h-3.5 w-3.5" />Delete track</>}</button></div></section></div>}
  </section>;
}