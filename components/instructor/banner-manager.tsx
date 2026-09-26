"use client";

import React, { useEffect, useRef, useState } from "react";
import { Image, Upload, Check, LoaderCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface BannerManagerProps {
  bannerUrl?: string;
  customInput?: string;
  onUpdateBanner: (url: string) => void;
  onUpdateCustomInput?: (url: string) => void;
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
}: BannerManagerProps) {
  const [selectedUrl, setSelectedUrl] = useState<string>(bannerUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedUrl(bannerUrl);
  }, [bannerUrl]);

  const handleSelect = (url: string) => {
    setSelectedUrl(url);
    setUploadMessage(null);
    onUpdateBanner(url);
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
    || uploadMessage.startsWith("Choose")
    || uploadMessage.startsWith("Banner images")
  ));

  return (
    <div className="bg-[#171d28]/60 border border-[#202631] rounded-xl p-5 text-[#d9dce0]">
      <div className="mb-4 flex flex-nowrap items-center justify-between gap-3">
        <h3 className="flex min-w-0 shrink items-center gap-2 whitespace-nowrap font-sans text-xl font-semibold">
          <Image className="h-5 w-5 shrink-0 text-amber-400" />
          Hero Banner
        </h3>
        <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400">
          Dynamic Storage
        </span>
      </div>

      <div className="relative h-36 w-full rounded-lg overflow-hidden border border-[#202631] mb-4 bg-black/40">
        {selectedUrl ? (
          <img
            src={selectedUrl}
            alt="Hero Preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm leading-relaxed text-slate-400">
            No banner selected
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c1017]/80 to-transparent flex items-end p-3">
          <span className="text-xs text-[#d9dce0]">Current Live Banner</span>
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-xs text-slate-400 font-medium block">Preset Collection</label>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_BANNERS.map((preset, index) => {
            const isSelected = selectedUrl === preset;
            return (
              <button
                key={index}
                onClick={() => handleSelect(preset)}
                className={`relative h-16 rounded-md overflow-hidden border transition ${
                  isSelected ? "border-amber-500 ring-1 ring-amber-500" : "border-[#202631] opacity-70 hover:opacity-100"
                }`}
              >
                <img src={preset} alt={`Preset ${index + 1}`} className="w-full h-full object-cover" />
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
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-xs font-medium text-stone-200 transition hover:border-amber-500/60 hover:text-amber-300 disabled:cursor-wait disabled:opacity-60"
          >
            {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isUploading ? "Uploading..." : "Choose image to upload"}
          </button>
          <p className="mt-1.5 text-[10px] text-stone-500">PNG, JPG, or WebP. Maximum 5 MB.</p>
          {uploadMessage && <p className={`mt-2 text-xs ${uploadMessageIsError ? "text-red-300" : "text-amber-300"}`} role={uploadMessageIsError ? "alert" : "status"}>{uploadMessage}</p>}
        </div>

        <div className="pt-2">
          <label className="text-xs text-slate-400 font-medium block mb-1.5">Custom Image URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste image URL or Supabase link..."
              value={customInput}
              onChange={(e) => onUpdateCustomInput?.(e.target.value)}
              className="flex-1 bg-[#0c1017] border border-[#202631] rounded-lg px-3 py-2 text-xs text-[#d9dce0] focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleCustomApply}
              className="bg-[#202631] hover:bg-[#29303c] text-xs px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
