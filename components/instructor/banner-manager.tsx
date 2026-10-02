"use client";

import React, { useEffect, useRef, useState } from "react";
import { Image, Upload, Check, LoaderCircle, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getBannerPositionStyles } from "@/lib/banner-position";

export interface BannerPosition {
  x: number;
  y: number;
}

interface BannerManagerProps {
  bannerUrl?: string;
  customInput?: string;
  onUpdateBanner: (url: string) => void;
  onUpdateCustomInput?: (url: string) => void;
  position?: BannerPosition;
  onUpdatePosition?: (position: BannerPosition) => void;
  embedded?: boolean;
}

const PRESET_BANNERS = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80",
];
const MAX_BANNER_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_BANNER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function InstructorBannerManager({
  bannerUrl = PRESET_BANNERS[0],
  customInput = "",
  onUpdateBanner,
  onUpdateCustomInput,
  position = { x: 50, y: 50 },
  onUpdatePosition,
  embedded = false,
}: BannerManagerProps) {
  const [selectedUrl, setSelectedUrl] = useState<string>(bannerUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    setSelectedUrl(bannerUrl);
  }, [bannerUrl]);

  const handleSelect = (url: string) => {
    setSelectedUrl(url);
    setUploadMessage(null);
    onUpdateBanner(url);
  };

  const getUploadedBannerPath = (url: string) => {
    try {
      const pathname = new URL(url).pathname;
      const marker = "/storage/v1/object/public/lesson-assets/";
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex < 0) return null;
      const path = decodeURIComponent(pathname.slice(markerIndex + marker.length));
      return path.startsWith("banners/") ? path : null;
    } catch {
      return null;
    }
  };

  const uploadedBannerPath = selectedUrl ? getUploadedBannerPath(selectedUrl) : null;

  const handleDeleteBanner = async () => {
    if (!uploadedBannerPath || isDeleting) return;
    setIsDeleting(true);
    setUploadMessage(null);
    try {
      const { error } = await supabase.storage.from("lesson-assets").remove([uploadedBannerPath]);
      if (error) throw error;
      setSelectedUrl("");
      onUpdateBanner("");
      onUpdatePosition?.({ x: 50, y: 50 });
      onUpdateCustomInput?.("");
      setUploadMessage("Uploaded banner deleted from storage.");
    } catch (error) {
      const details = error && typeof error === "object" ? error as { message?: string } : undefined;
      console.error("Hero banner deletion failed:", error);
      setUploadMessage(details?.message ? `Delete failed: ${details.message}` : "Delete failed. Check the lesson-assets bucket permissions and try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const updatePositionFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const frame = event.currentTarget.getBoundingClientRect();
    onUpdatePosition?.({
      x: Math.round(Math.max(0, Math.min(100, ((event.clientX - frame.left) / frame.width) * 100))),
      y: Math.round(Math.max(0, Math.min(100, ((event.clientY - frame.top) / frame.height) * 100))),
    });
  };

  const handleCustomApply = () => {
    if (customInput.trim()) {
      handleSelect(customInput.trim());
      onUpdateCustomInput?.("");
      setUploadMessage(null);
    }
  };

  const handleFileSelection = async (file?: File) => {
    if (!file) return;
    setUploadMessage(null);
    if (!ALLOWED_BANNER_TYPES.has(file.type)) {
      setUploadMessage("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > MAX_BANNER_FILE_SIZE) {
      setUploadMessage("Banner images must be 5 MB or smaller.");
      return;
    }

    setIsUploading(true);
    setUploadMessage("Uploading banner...");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `banners/${Date.now()}-${safeName}`;
    try {
      const { error } = await supabase.storage.from("lesson-assets").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("lesson-assets").getPublicUrl(path);
      if (!data.publicUrl) throw new Error("Supabase did not return a public banner URL.");
      handleSelect(data.publicUrl);
      onUpdateCustomInput?.("");
      setUploadMessage("Banner uploaded and applied.");
    } catch (error) {
      const details = error && typeof error === "object" ? error as { message?: string } : undefined;
      console.error("Hero banner upload failed:", error);
      setUploadMessage(details?.message ? `Upload failed: ${details.message}` : "Upload failed. Check the lesson-assets bucket permissions and try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const uploadMessageIsError = Boolean(uploadMessage && (
    uploadMessage.startsWith("Upload failed")
    || uploadMessage.startsWith("Delete failed")
    || uploadMessage.startsWith("Choose")
    || uploadMessage.startsWith("Banner images")
  ));

  return (
    <div className={embedded ? "text-[#d9dce0]" : "rounded-xl border border-[#202631] bg-[#171d28]/60 p-5 text-[#d9dce0]"}>
      {!embedded && <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex min-w-0 shrink items-center gap-2 whitespace-nowrap font-sans text-xl font-semibold">
          <Image aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0 text-amber-400" />
          Hero Banner
        </h3>
        <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-xs text-amber-400">
          Dynamic Storage
        </span>
      </div>}

      <div
        className="relative mb-2 aspect-video w-full touch-none overflow-hidden rounded-lg border border-[#202631] bg-black/40"
        onPointerDown={(event) => {
          if (!selectedUrl || !onUpdatePosition) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          isDraggingRef.current = true;
          updatePositionFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (isDraggingRef.current) updatePositionFromPointer(event);
        }}
        onPointerUp={() => { isDraggingRef.current = false; }}
        onPointerCancel={() => { isDraggingRef.current = false; }}
        aria-label={onUpdatePosition ? "Drag to adjust banner focal position" : undefined}
      >
        {selectedUrl ? (
          <img
            src={selectedUrl}
            alt="Current live hero banner preview"
            style={getBannerPositionStyles(position)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm leading-relaxed text-slate-400">
            No banner selected
          </div>
        )}
        {selectedUrl && <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-[#0c1017]/70 to-transparent p-3"><span className="text-xs text-[#d9dce0]">Current Live Banner · drag to reposition</span></div>}
      </div>
      {onUpdatePosition && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <label className="text-[10px] text-stone-400">
            Horizontal position <span className="float-right text-stone-500">{position.x}%</span>
            <input type="range" min="0" max="100" value={position.x} onChange={(event) => onUpdatePosition({ ...position, x: Number(event.target.value) })} aria-label="Banner horizontal focal position" className="mt-1 w-full accent-amber-500" />
          </label>
          <label className="text-[10px] text-stone-400">
            Vertical position <span className="float-right text-stone-500">{position.y}%</span>
            <input type="range" min="0" max="100" value={position.y} onChange={(event) => onUpdatePosition({ ...position, y: Number(event.target.value) })} aria-label="Banner vertical focal position" className="mt-1 w-full accent-amber-500" />
          </label>
        </div>
      )}
      {uploadedBannerPath && (
        <button
          type="button"
          onClick={() => void handleDeleteBanner()}
          disabled={isDeleting || isUploading}
          className="mb-3 inline-flex items-center gap-1.5 rounded border border-red-500/40 px-3 py-2 text-xs text-red-300 transition hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-50"
        >
          {isDeleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {isDeleting ? "Deleting banner..." : "Delete Banner"}
        </button>
      )}

      <div className={embedded ? "space-y-3" : "space-y-3"}>
        <label className="text-xs text-slate-400 font-medium block">Preset Collection</label>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_BANNERS.map((preset, index) => {
            const isSelected = selectedUrl === preset;
            return (
              <button
                key={index}
                onClick={() => handleSelect(preset)}
                className={`relative aspect-video overflow-hidden rounded-md border transition ${
                  isSelected ? "border-amber-500/40 ring-1 ring-amber-500/40" : "border-[#202631] opacity-70 hover:opacity-100"
                }`}
              >
                <img src={preset} alt={`Preset banner ${index + 1}`} className="h-full w-full object-cover" />
                {isSelected && (
                    <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white drop-shadow" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="pt-2">
          <label className="text-xs text-slate-400 font-medium block mb-1.5">Upload Custom Banner</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label="Upload custom banner image"
            disabled={isUploading}
            onChange={(event) => void handleFileSelection(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-xs  text-stone-200 transition hover:border-amber-500/40 hover:text-amber-400 disabled:cursor-wait disabled:opacity-60"
          >
            {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isUploading ? "Uploading..." : "Choose image to upload"}
          </button>
          <p className="mt-1.5 text-[10px] text-stone-500">PNG, JPG, or WebP. Maximum 5 MB.</p>
          {uploadMessage && <p className={`mt-2 text-xs ${uploadMessageIsError ? "text-red-300" : "text-amber-400"}`} role={uploadMessageIsError ? "alert" : "status"}>{uploadMessage}</p>}
        </div>

        <div className="pt-2">
          <label className="text-xs text-slate-400 font-medium block mb-1.5">Custom Image URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste image URL or Supabase link..."
              value={customInput}
              onChange={(e) => onUpdateCustomInput?.(e.target.value)}
              className="flex-1 bg-[#0c1017] border border-[#202631] rounded-lg px-3 py-2 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500/40"
            />
            <button
              onClick={handleCustomApply}
              className="bg-[#202631] hover:bg-[#29303c] text-xs px-3 py-2 rounded-lg  transition flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
