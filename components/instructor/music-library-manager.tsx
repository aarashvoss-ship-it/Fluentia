"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Trash2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createAmbientTrack, deleteAmbientTrack } from "@/lib/music-library";
import { DEFAULT_LESSON_AUDIO_TRACKS } from "@/lib/musicTracks";
import type { AmbientTrackRow } from "@/lib/supabase";

export function MusicLibraryManager() {
  const [tracks, setTracks] = useState<AmbientTrackRow[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showFallbackTracks = (message: string) => {
    setTracks(DEFAULT_LESSON_AUDIO_TRACKS.map((track, index) => ({
      id: `fallback-${index}`,
      title: track.title,
      url: track.url,
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
        showFallbackTracks("Showing default tracks. Run migration 003 to enable shared storage.");
        return;
      }
      if (!data || data.length === 0) {
        const seeded = await Promise.all(DEFAULT_LESSON_AUDIO_TRACKS.map((track) => createAmbientTrack(track.title, track.url).catch(() => null)));
        const created = seeded.filter((track): track is AmbientTrackRow => Boolean(track));
        if (created.length > 0) {
          setTracks(created);
          setStatus("Default tracks added to the shared library.");
          return;
        }
        showFallbackTracks("Showing default tracks. Add migration 003 to persist them.");
        return;
      }
      setTracks(data as AmbientTrackRow[]);
    } catch (error) {
      console.error('Supabase Error Details:', error);
      showFallbackTracks("Showing default tracks. Run migration 003 to enable shared storage.");
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
    if (file.size >= 15 * 1024 * 1024) {
      setStatus("Choose an MP3 smaller than 15 MB.");
      return;
    }
    setStatus("Uploading track...");
    const path = `ambient/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const upload = await supabase.storage.from("ambient-music").upload(path, file, { contentType: "audio/mpeg", upsert: false });
    if (upload.error) {
      setStatus("Upload failed. Check the ambient-music bucket and policies.");
      return;
    }
    const { data } = supabase.storage.from("ambient-music").getPublicUrl(path);
    try {
      await createAmbientTrack(file.name.replace(/\.mp3$/i, "") || "Uploaded Track", data.publicUrl);
      await loadTracks();
      setStatus("Track added to the shared library.");
    } catch {
      setStatus("The file uploaded, but its library record could not be created.");
    }
  };

  const removeTrack = async (track: AmbientTrackRow) => {
    try {
      await deleteAmbientTrack(track.id);
      setTracks((current) => current.filter((item) => item.id !== track.id));
      if (playingId === track.id) setPlayingId(null);
    } catch {
      setStatus("Unable to remove this track.");
    }
  };

  return <section className="space-y-5" aria-labelledby="music-library-title">
    <div className="flex flex-col justify-between gap-4 border-b border-[#202631] pb-5 sm:flex-row sm:items-end">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Shared Student Audio</p><h2 id="music-library-title" className="mt-1 font-sans text-2xl font-semibold text-stone-100">Music Library</h2><p className="mt-2 text-sm text-stone-500">Every active track here appears in student lesson headers.</p></div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400"><Upload className="h-4 w-4" /> Upload New Track<input type="file" accept="audio/mpeg,.mp3" className="sr-only" onChange={(event) => void uploadTrack(event.target.files?.[0])} /></label>
    </div>
    {status && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300" role="status">{status}</p>}
    <div className="overflow-hidden rounded-xl border border-[#202631] bg-[#171d28]/60"><table className="w-full text-left text-xs"><thead className="border-b border-[#202631] bg-[#0c1017] text-[10px] uppercase tracking-[0.12em] text-stone-500"><tr><th className="px-5 py-3">Track Title</th><th className="px-4 py-3">URL</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[#202631]">{tracks.map((track) => <tr key={track.id}><td className="px-5 py-4 font-medium text-stone-200">{track.title}</td><td className="max-w-[360px] truncate px-4 py-4 text-stone-500">{track.url}</td><td className="px-4 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={() => void togglePreview(track)} aria-label={`${playingId === track.id ? "Pause" : "Play"} ${track.title}`} className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/10">{playingId === track.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button><button type="button" onClick={() => void removeTrack(track)} aria-label={`Remove ${track.title}`} className="flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}{tracks.length === 0 && <tr><td colSpan={3} className="px-5 py-10 text-center text-stone-500">No tracks in the shared library.</td></tr>}</tbody></table></div>
  </section>;
}